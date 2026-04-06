# AsaasSplit — Sistema de Gestão de Cobranças e Splits de Pagamento

## Visão Geral

Sistema completo para gestão de cobranças e splits de pagamento integrado à plataforma **Asaas**.
Permite criação de subcontas, geração de cobranças (boleto, Pix, cartão), automação de splits e acompanhamento em tempo real via painel de gestão.

## Stack Tecnológico

| Camada     | Tecnologia                          |
|------------|-------------------------------------|
| Backend    | NestJS (Node.js) + TypeScript       |
| Banco      | PostgreSQL + Prisma ORM             |
| Frontend   | Next.js 14 + React + TailwindCSS    |
| Auth       | JWT                                 |
| Integração | API Asaas v3                        |
| Deploy     | Vercel (front) + Railway (back) + Supabase (db) |

## Estrutura do Repositório

```
├── backend/          # API NestJS
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/          # Autenticação JWT
│   │   │   ├── subaccounts/   # Gestão de subcontas
│   │   │   ├── charges/       # Geração de cobranças
│   │   │   ├── splits/        # Automação de splits
│   │   │   ├── webhooks/      # Recebimento de eventos Asaas
│   │   │   ├── sync/          # Sincronização periódica
│   │   │   └── dashboard/     # Dados do painel
│   │   ├── common/            # Guards, interceptors, filters
│   │   └── asaas/             # Client SDK do Asaas
│   └── prisma/                # Schema e migrations
├── frontend/         # Painel Next.js
│   └── src/
│       ├── app/               # App Router
│       ├── components/        # Componentes reutilizáveis
│       ├── lib/               # API client, utils
│       └── hooks/             # Custom hooks
├── docs/             # Documentação
└── docker-compose.yml
```

## Setup Local

```bash
# 1. Clonar e instalar
git clone <repo>
cd asaas-split

# 2. Subir infra local
docker-compose up -d

# 3. Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run start:dev

# 4. Frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Variáveis de Ambiente

### Backend (.env)
```
DATABASE_URL=postgresql://user:pass@localhost:5432/asaas_split
ASAAS_API_KEY=seu_api_key
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
JWT_SECRET=seu_jwt_secret
WEBHOOK_SECRET=seu_webhook_secret
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Cliente

- **Nome:** Mario Matsui Fumura
- **Plataforma:** Workana
- **Contrato:** R$ 2.400,00
- **Prazo:** 12 dias úteis (aceito em 06/04/2026)

## Autor

Gabriel Gomes Santos Barreto — Desenvolvedor Backend & Integrações de Pagamento
