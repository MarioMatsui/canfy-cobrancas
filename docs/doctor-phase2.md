# Médico canônico — implementação da etapa 2
Branch separada de master; NADA migrado ou implantado em produção.

## Mudanças
- Nova tabela `doctors`: profissional não depende de `subaccounts`; `msgdesk_auth_user_id` é identidade externa nullable, sem FK entre bancos.
- `doctor_licenses` suporta CRM/UF múltiplos, unicidade global do par.
- `doctor_financial_links` mantém histórico, um vínculo ATIVO por médico; carteira de clínica pode ser compartilhada por múltiplos médicos.
- `doctor_provisioning_operations` possui chave de idempotência e hash, sem senhas/API keys.
- Endpoints `/api/doctors` (JwtAuthGuard + ADMIN) e `/api/integrations/v2/admin/doctors` (X-Canfy-Integration-Key + scopes ADMIN específicos).
- A API `/api/integrations/v1/doctors` e referências de split seguem com o contrato financeiro original.
- `POST /api/doctors` exige `Idempotency-Key` UUID e aceita nome, documentos/endereço parciais e array de CRMs; não cria Asaas nem Auth.
- `PATCH /:id`, `POST /:id/licenses`, `POST /:id/regularize`, `POST /:id/financial-links` e `GET /:id/provisioning`.
- `POST /:id/provisioning/prepare` é stub seguro e explicitamente NÃO cria login: Prompt 3 concluirá autenticação e reconciliação.

## Acesso e compatibilidade
- `doctors:admin:read` / `doctors:admin:write` são NOVOS scopes; nenhuma chave já emitida os recebe automaticamente.
- As rotas de escrita de subcontas agora exigem ADMIN; GET permanece com autenticação atual para não interromper o seletor operacional do painel.
- `syncFromAsaas` passou a percorrer páginas e a não sobrescrever vínculos de carteiras ambíguas.
- `linkExisting` faz consulta filtrada por walletId, preservando prefixo external_ para vínculos não verificados.
- `Subaccount`, Charge.doctorSubaccountId, splits, pagamentos e IDs legados NÃO são migrados.
- Evitar atualizações de médico via `subaccounts`: o novo endpoint é canônico.
- `incomeValue` deve ser >0 antes do POST Asaas. Não disparar criação real em teste.

## Validação (ambiente DEV/SANDBOX APENAS)
```bash
cd backend
npm ci
npx prisma validate
npx prisma generate
npm run build
npm test -- --runInBand
# Configure DATABASE_URL para BANCO DESCARTÁVEL com backup.
npx prisma migrate deploy
node scripts/doctor-legacy-audit.cjs --dry-run
```
Não se deve rodar migrate deploy contra a base de produção sem aprovação.
`doctor-legacy-audit.cjs` exige schema novo e executa somente SELECTs agregados; nenhuma importação está habilitada.

## Critérios ainda pendentes
- PostgreSQL Canfy ainda não foi inspecionado: não há backfill de dados reais.
- O endpoint real de criação de subconta com outbox/reconciliação pós-falha exige trabalho adicional. O POST de subcontas existente ainda tem risco de criação remota seguida de falha local; NÃO utilizar a rota para provisionamento automático.
- Não existe provisionador Supabase Auth neste Prompt 2; não marcar doctor login como ativo.
- A verificação oficial CRM não está automatizada; regularize move para PENDING_REVIEW.
- Validar endpoints e testes contra DB de desenvolvimento antes de merge/deploy.
