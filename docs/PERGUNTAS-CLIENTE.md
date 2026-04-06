# Perguntas Pendentes para o Mario

## Prioridade Alta (bloqueia desenvolvimento)

### 1. Acesso à API Asaas
- Já tem conta Asaas com API key?
- Ou precisa de ambiente sandbox para desenvolvimento?
- Se já tem, é sandbox ou produção?

### 2. Regras de Negócio dos Splits
- Os splits são sempre as mesmas porcentagens ou mudam por cobrança/cliente?
- Quem são os recebedores fixos? (ex: conta principal + % para parceiros)
- Existe algum valor mínimo/máximo por split?
- Splits devem ser em percentual (%), valor fixo (R$), ou ambos?

### 3. Volume de Subcontas
- Quantas subcontas estima ter inicialmente? (5, 20, 100+?)
- Isso impacta na arquitetura de busca e listagem

## Prioridade Média (pode iniciar sem, mas precisamos antes da Fase 2)

### 4. Cobranças Recorrentes
- As cobranças recorrentes são mensais? Semanais? Periodicidade variável?
- Existe lógica de tentativa automática em caso de falha?

### 5. Notificações
- Além do email padrão do Asaas, deseja alguma notificação adicional? (WhatsApp, SMS?)
- Quer receber notificações quando pagamentos são confirmados?

### 6. Usuários do Painel
- Apenas um usuário admin ou múltiplos?
- Se múltiplos, há níveis de permissão diferentes?

### 7. Relatórios
- Além de CSV, precisa de PDF?
- Quais dados são essenciais nos relatórios?
- Precisa de relatórios por período específico?

## Prioridade Baixa (define na Fase 4)

### 8. Identidade Visual
- Tem logo, cores, fontes preferidas para o painel?
- Ou posso seguir um design limpo/padrão?

### 9. Domínio
- Já tem domínio para o painel?
- Ou usar o domínio padrão da Vercel temporariamente?

---

## Status das Respostas

| # | Pergunta | Respondida? | Resposta |
|---|----------|-------------|----------|
| 1 | API Asaas | ✅ | Já possui conta Asaas. Aguardando API key. |
| 2 | Regras de split | ✅ | 2 tipos de serviço: Atendimento médico (15% pro médico) e Venda de produtos (70% pro fornecedor). Percentuais personalizáveis. |
| 3 | Volume de subcontas | ✅ | Começa com 2, pretende 20+ em 1 ano (crescimento exponencial) |
| 4 | Recorrência | ❌ | — |
| 5 | Notificações | ❌ | — |
| 6 | Usuários painel | ❌ | — |
| 7 | Relatórios | ❌ | — |
| 8 | Identidade visual | ❌ | — |
| 9 | Domínio | ❌ | — |
