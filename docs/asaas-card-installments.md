# Parcelamento no checkout Canfy → Asaas

## Comportamento implementado

1. O operador define `maxInstallments` na venda (atualmente 1–12).
2. O paciente acessa `pagar.canfy.com.br`, seleciona de 1x até o limite e escolhe **Cartão**.
3. O POST `/api/public/payment/:token/start` recebe `{ "method": "CARD", "installments": 4 }`.
4. O backend valida que a quantidade não excede o limite da venda. **Nunca** aceita parcelas de Pix.
5. Para 1x, envia `POST /payments` com `value` e splits `fixedValue` (fluxo antigo).
6. Para 2x ou mais, envia `POST /payments` com `installmentCount` + `totalValue` e splits `totalFixedValue`. Não inclui `value`, evitando duplicidade de valor.
7. O banco salva o ID da primeira cobrança em `Payment.providerPaymentId`, o grupo em `Payment.providerInstallmentId` e a quantidade em `Payment.installments`.
8. A URL `invoiceUrl` do Asaas continua sendo aberta em nova aba, sem captura de cartão no checkout Canfy.
9. Os webhooks e a sincronização a cada 5 min recuperam `GET /installments/{grupo}/payments` e salvam os IDs e estados individuais em `payment_installments`. **Uma parcela isolada confirmada nunca marca a venda como paga.**
10. A venda só fica `PAID` se **todas** as parcelas do grupo estiverem em `CONFIRMED` ou `RECEIVED`. Os splits registrados no painel representam totais do pedido, não totais repetidos por parcela.

## Regras e limites

- O limite conservador de **12x** foi adotado porque Asaas documenta até 12 parcelas para algumas bandeiras (Visa/Mastercard podem aceitar 21). Não exibir opções que possam falhar pela bandeira não conhecida na Canfy.
- A quantidade escolhida é **fixada quando a fatura Asaas é criada**. Pedidos já com fatura de cartão aberta reutilizam a tentativa e não podem alterar o número de parcelas; a API recusa pedidos conflitantes. Não existe reemissão automática.
- Parcelamento em cartão é uma operação financeira distinta de 4 boletos isolados. Asaas retorna uma primeira cobrança e um ID de grupo. Evite confundir o ID do grupo com os IDs de cobrança.
- Para cancelamento, antes de remover o grupo, a aplicação consulta todas as parcelas e usa `DELETE /installments/{id}/payments`. Se qualquer parcela estiver confirmada, bloqueia a remoção; **nunca excluir só a primeira parcela**.
- Falhas de comunicação com o Asaas precisam ser reconciliadas. Em caso de incerteza sobre uma cobrança enviada e não persistida, verificar no painel/API antes de criar novamente.
- A exibição de status `COMPLETED` de um split depende de evidência de liquidação do provedor. Não equiparar confirmação de cobrança com liquidação de split.
- Pagamentos legados em 1x permanecem sem grupo. A migration não modifica cobranças existentes.
- O checkout de cartão pode ter taxas e outras restrições do Asaas, que não foram alteradas pelo software.

## Validação em sandbox ANTES da produção

Usar cliente de teste e as credenciais do sandbox em ambiente isolado. Não enviar dados reais de pacientes ou cartão para sandbox.

1. Criar venda de R$ 1.317,65, split fornecedor de R$ 1.187,37, `maxInstallments = 4`; abrir checkout e verificar seleções 1x–4x.
2. Escolher 4x, iniciar pagamento; confirmar requisição ao Asaas com `totalValue = 1317.65`, `installmentCount = 4`, `split.totalFixedValue = 1187.37`, sem `value` nem `split.fixedValue`.
3. Conferir `invoiceUrl` real e todas as cobranças do grupo no painel/API do Asaas. Verificar os arredondamentos das quatro parcelas e o limite configurado.
4. Confirmar apenas uma parcela via evento simulado: a Charge **não** pode ficar `PAID`. Após confirmação das quatro, a Charge pode ser `PAID` (sem multiplicar split).
5. Testar 1x e Pix: payload e UX anteriores preservados.
6. Testar mesmo botão duas vezes, recarregamento, duas abas, fatura existente, queda de API, diferentes limites e tentativa de superar o máximo do pedido.
7. Testar cancelamento de grupo inteiramente pendente e bloqueio quando qualquer parcela tiver confirmação; checar transições na tabela `payment_installments`.
8. Testar Pix e Cartão simultaneamente, confirmação vencedora, cancelamento seguro da alternativa e recepção tardia de webhooks.
9. Validar devolução/estorno parcial em sandbox. O estado de estorno parcial exige análise operacional antes de automatizar qualquer reembolso.
10. Executar CI de checkout/frontend/backend e smoke browser.

## Publicação na VPS: roteiro de segurança

**Não executar até a PR passar integralmente e os testes reais em sandbox estarem concluídos.**

1. Verificar o branch correto, a configuração PM2 efetiva, o commit da `master` e o status atual do banco. Não presumir que `ecosystem.config.js` corresponde à configuração PM2 do servidor.
2. Fazer backup verificado do PostgreSQL antes da migration e confirmar a URL de banco pelo `backend/.env` real, **sem revelar credenciais**.
3. Mesclar a PR na `master`; na VPS fazer `git fetch origin` e `git pull --ff-only origin master` no diretório verdadeiro do projeto.
4. `cd backend && npm ci && npx prisma migrate status && npx prisma migrate deploy && npx prisma generate && npm run build`; confirmar arquivo de entrada de produção conforme o `package.json` (histórico utiliza `dist/src/main.js`).
5. No mesmo repositório: `cd frontend && npm ci && npm run build`, `cd ../checkout && npm ci && npm run build`.
6. Reiniciar **apenas** os três processos PM2 de produção correspondentes aos serviços corretos (nomes reais obtidos com `pm2 list`), usando a configuração do servidor. Nunca reiniciar todos os processos sem inspecioná-los.
7. Confirmar `/api/health`, emissão de pedidos 1x/4x, checkout, webhooks, splits, PM2 logs e os dois domínios públicos.
8. Fazer reconciliação das faturas já pendentes antes de qualquer cancelamento/reemissão. **A migration não altera a fatura Asaas já existente do exemplo.**

Rollback: o schema é aditivo; manter colunas novas ao reverter código é mais seguro do que apagá-las. Não publicar downgrade com grupos financeiros abertos sem um plano explícito de conciliação.

## Referências oficiais consultadas

- https://docs.asaas.com/docs/criar-uma-cobranca-parcelada
- https://docs.asaas.com/docs/split-em-parcelamentos
- https://docs.asaas.com/reference/listar-cobran%C3%A7as-de-um-parcelamento
- https://docs.asaas.com/reference/cancelar-cobrancas-de-um-parcelamento
- https://docs.asaas.com/docs/webhook-para-cobrancas
