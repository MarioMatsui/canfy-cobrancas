# Cronograma de Entregas — AsaasSplit

## Fase 1: Setup + Integração Asaas (Dias 1–3)
**Meta:** Base do projeto funcionando com CRUD de subcontas

### Dia 1 — Setup Completo
- [x] Estrutura do projeto (monorepo)
- [ ] NestJS configurado (módulos, guards, interceptors)
- [ ] Prisma + PostgreSQL (schema inicial, migrations)
- [ ] Docker Compose (PostgreSQL + Redis)
- [ ] Configuração de variáveis de ambiente
- [ ] Swagger documentação base

### Dia 2 — Autenticação + Asaas Client
- [ ] Módulo de auth (JWT, login, register)
- [ ] Asaas SDK client (HttpModule, interceptors, error handling)
- [ ] Testes de conexão com sandbox Asaas
- [ ] Middleware de tratamento de erros global

### Dia 3 — CRUD Subcontas
- [ ] Criar subconta via API Asaas + persistir local
- [ ] Listar subcontas (com filtros e paginação)
- [ ] Editar subconta
- [ ] Ativar/desativar subconta
- [ ] Sincronizar dados com Asaas
- [ ] Testes unitários do módulo

---

## Fase 2: Geração de Cobranças (Dias 4–6)
**Meta:** Sistema de cobranças completo com todos os meios de pagamento

### Dia 4 — Cobranças Avulsas
- [ ] Criar cobrança (boleto, Pix, cartão) vinculada a subconta
- [ ] Configuração de vencimento, multa, juros, desconto
- [ ] Persistência local + Asaas
- [ ] Endpoint de consulta de cobrança individual

### Dia 5 — Cobranças Recorrentes + Notificações
- [ ] Cobranças recorrentes (semanal, mensal, etc)
- [ ] Envio automático de notificação ao pagador
- [ ] Cancelamento de cobranças
- [ ] Reenvio de cobranças

### Dia 6 — Listagem + Filtros
- [ ] Listagem com filtros (status, data, subconta, tipo)
- [ ] Paginação server-side
- [ ] Ordenação
- [ ] Testes unitários do módulo de cobranças

---

## Fase 3: Splits + Webhooks + Sync (Dias 7–9)
**Meta:** Automação de splits e sincronização em tempo real

### Dia 7 — Regras de Split
- [ ] Configuração de regras de split (% ou valor fixo por subconta)
- [ ] CRUD de regras de split
- [ ] Validação de regras (soma = 100%, etc)
- [ ] Associação de splits a cobranças

### Dia 8 — Webhooks Asaas
- [ ] Endpoint de recebimento de webhooks
- [ ] Validação de assinatura do webhook
- [ ] Fila de processamento (Bull/Redis)
- [ ] Processamento de eventos: PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_REFUNDED
- [ ] Log de todos os eventos recebidos
- [ ] Retry automático em caso de falha

### Dia 9 — Sincronização + Histórico
- [ ] Job de sincronização periódica (cron)
- [ ] Sincronização bidirecional com Asaas
- [ ] Split automático no momento do pagamento
- [ ] Histórico de splits realizados
- [ ] Visualização clara: quem recebe quanto por cobrança

---

## Fase 4: Painel de Gestão + Deploy (Dias 10–12)
**Meta:** Frontend completo e deploy em produção

### Dia 10 — Dashboard + Auth Frontend
- [ ] Layout base (Sidebar, Header, responsivo)
- [ ] Tela de login
- [ ] Dashboard com indicadores:
  - Total cobranças (pagas/pendentes/atrasadas)
  - Volume por subconta
  - Gráficos de evolução

### Dia 11 — Telas de Gestão
- [ ] Tela de subcontas (lista, status, saldo)
- [ ] Tela de cobranças (lista, detalhes, ações: reenviar, cancelar)
- [ ] Tela de splits (breakdown por cobrança)
- [ ] Exportação de relatórios (CSV)

### Dia 12 — Testes + Deploy
- [ ] Testes E2E dos fluxos críticos
- [ ] Deploy backend → Railway
- [ ] Deploy frontend → Vercel
- [ ] Deploy banco → Supabase
- [ ] Configurar webhooks em produção
- [ ] Documentação Swagger final
- [ ] Entrega e handoff

---

## Marcos de Validação com o Cliente

| Marco | Dia | Entrega |
|-------|-----|---------|
| M1    | 3   | Subcontas funcionando (API + banco) |
| M2    | 6   | Cobranças completas (boleto, Pix, cartão) |
| M3    | 9   | Splits automáticos + webhooks em tempo real |
| M4    | 12  | Painel completo + deploy em produção |
