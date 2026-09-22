# Canfy Cobranças — Sistema de Gestão de Cobranças e Splits Asaas

Sistema completo para criação de cobranças e divisão automática de pagamentos (split) integrado à
plataforma **Asaas**. Inclui painel administrativo web, API REST, banco de dados, processamento de
webhooks e sincronização periódica com o Asaas.

---

## Sumário

1. [Visão geral](#visão-geral)
2. [Stack técnica](#stack-técnica)
3. [Estrutura do repositório](#estrutura-do-repositório)
4. [Setup local (desenvolvimento)](#setup-local-desenvolvimento)
5. [Variáveis de ambiente](#variáveis-de-ambiente)
6. [Deploy em produção](#deploy-em-produção)
7. [Operação no servidor (PM2)](#operação-no-servidor-pm2)
8. [Como configurar domínio próprio](#como-configurar-domínio-próprio)
9. [Webhooks Asaas](#webhooks-asaas)
10. [Solução de problemas](#solução-de-problemas)

---

## Visão geral

O sistema permite:

- **Cadastro de subcontas** (médicos, fornecedores) ligadas a `walletId` do Asaas
- **Criação de cobranças avulsas** (Pix, Boleto, Cartão ou Link com múltiplas formas)
- **Splits automáticos** — divisão percentual entre subcontas e a conta principal
- **Painel administrativo** com Dashboard, Cobranças, Splits, Webhooks, Usuários e Configurações
- **Webhooks** para receber notificações de pagamento em tempo real
- **Sincronização automática** a cada 5 minutos (caso algum webhook falhe)
- **Gestão de usuários** com 2 papéis: `ADMIN` (único que pode criar/listar/excluir usuários) e `ATTENDANT` (acesso operacional completo — cobranças, subcontas, splits, webhooks)

> **Importante:** Splits automáticos só funcionam em **cobranças avulsas** (`POST /payments`).
> Links de pagamento (`POST /paymentLinks`) NÃO suportam split — limitação da própria API do Asaas.

---

## Stack técnica

| Camada     | Tecnologia                              |
|------------|-----------------------------------------|
| Backend    | NestJS 11 + TypeScript + Node.js 20+    |
| Frontend   | Next.js 14 + React + TailwindCSS        |
| Banco      | PostgreSQL 16 + Prisma ORM              |
| Cache/Fila | Redis 7 + Bull                          |
| Auth       | JWT (Passport)                          |
| Integração | API Asaas v3 (produção)                 |
| Deploy     | PM2 + Cloudflare Tunnel (atual)         |

---

## Estrutura do repositório

```
.
├── backend/              # API NestJS (porta 3001)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/         # Autenticação JWT, login
│   │   │   ├── users/        # Gestão de usuários e papéis
│   │   │   ├── subaccounts/  # Subcontas Asaas (médicos/fornecedores)
│   │   │   ├── charges/      # Criação e listagem de cobranças
│   │   │   ├── splits/       # Histórico de splits realizados
│   │   │   ├── webhooks/     # Recebimento de eventos Asaas
│   │   │   ├── sync/         # Cron de sincronização (5 min)
│   │   │   └── dashboard/    # Métricas do painel
│   │   ├── common/           # Guards, interceptors, filters
│   │   └── asaas/            # Cliente HTTP do Asaas
│   ├── prisma/               # Schema e migrations
│   └── .env.example
├── frontend/             # Painel Next.js (porta 3002)
│   └── src/
│       ├── app/              # Rotas (App Router)
│       ├── components/       # Componentes UI
│       └── lib/              # API client, helpers
├── docker-compose.yml        # Postgres + Redis (dev)
├── docker-compose.prod.yml   # Stack completa produção
├── ecosystem.config.js       # Configuração PM2
├── deploy.sh                 # Script de deploy via Docker
└── nginx/                    # Config nginx (opcional)
```

---

## Setup local (desenvolvimento)

### Pré-requisitos

- Node.js 20 ou superior
- Docker + Docker Compose
- Conta no Asaas (sandbox ou produção)

### Passo a passo

```bash
# 1. Clonar o repositório
git clone https://github.com/MarioMatsui/canfy-cobrancas.git
cd canfy-cobrancas

# 2. Subir Postgres + Redis localmente
docker compose up -d

# 3. Configurar e instalar o backend
cd backend
cp .env.example .env
# Edite o .env com suas chaves (veja seção "Variáveis de ambiente")
npm install
npx prisma migrate deploy
npx prisma generate
npm run start:dev
# Backend rodando em http://localhost:3001

# 4. Em outro terminal, configurar o frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev
# Frontend rodando em http://localhost:3000
```

### Criar primeiro usuário admin

O endpoint `POST /auth/register` só pode ser chamado por um usuário `ADMIN` já autenticado — ou seja,
não há como criar o primeiro admin pela API. Insira-o diretamente no banco:

```bash
cd backend

# 1. Gere salt + hash da senha (mesmo algoritmo usado pelo AuthService: PBKDF2-SHA512)
node -e "
const crypto = require('crypto');
const password = 'SUA_SENHA_AQUI';
const salt = crypto.randomBytes(32).toString('hex');
const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
console.log('salt:', salt);
console.log('password (hash):', hash);
"
```

```sql
-- 2. Insira o usuário usando os valores gerados acima
INSERT INTO users (id, email, password, salt, name, role, created_at, updated_at)
VALUES (gen_random_uuid(), 'admin@exemplo.com', '<hash>', '<salt>', 'Admin', 'ADMIN', now(), now());
```

Depois disso, use o painel (**Usuários**) ou `POST /auth/register` logado como esse admin para criar os demais.

---

## Variáveis de ambiente

### Backend (`backend/.env`)

```env
# Banco de dados
DATABASE_URL=postgresql://postgres:postgres@localhost:5437/asaas_split

# Redis (para fila de webhooks)
REDIS_HOST=localhost
REDIS_PORT=6381

# Servidor
PORT=3001
NODE_ENV=production

# Asaas — chave de produção (pegar em https://www.asaas.com/integracao)
ASAAS_API_KEY=$aact_prod_XXXXXXXXXXXXXX
ASAAS_API_URL=https://www.asaas.com/api/v3
# Para sandbox: https://api-sandbox.asaas.com/v3
# Opcional: retorno automatico da fatura Asaas. O dominio precisa estar
# cadastrado nos dados comerciais da conta Asaas; se omitido, a invoiceUrl
# continua funcionando normalmente sem callback automatico.
# ASAAS_PAYMENT_CALLBACK_BASE_URL=https://pagar.canfy.com.br

# JWT — gere uma string aleatória forte
JWT_SECRET=string-aleatoria-de-pelo-menos-32-caracteres
JWT_EXPIRES_IN=7d

# Webhook (token que o Asaas vai enviar no header "asaas-access-token")
WEBHOOK_SECRET=token-aleatorio-para-validar-webhooks

# URLs das interfaces
FRONTEND_URL=https://cobranca.canfy.com.br
CHECKOUT_FRONTEND_URL=https://pagar.canfy.com.br
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=https://cobranca.canfy.com.br/api
# Em desenvolvimento: http://localhost:3001/api
```

---

## Deploy em produção

### Opção A — Servidor Linux + PM2 (atual)

Esta é a configuração que está rodando hoje. Recomendada para começar.

```bash
# 1. Instalar dependências do servidor
sudo apt update
sudo apt install -y nodejs npm postgresql redis docker.io docker-compose
sudo npm install -g pm2

# 2. Clonar repositório
git clone https://github.com/MarioMatsui/canfy-cobrancas.git
cd canfy-cobrancas

# 3. Subir Postgres + Redis via Docker
docker compose up -d

# 4. Configurar e buildar backend
cd backend
cp .env.example .env
# Edite o .env com valores de produção
npm install
npx prisma migrate deploy
npx prisma generate
npx nest build

# 5. Configurar e buildar frontend
cd ../frontend
cp .env.example .env.local
# Edite o .env.local
npm install
npx next build

# 6. Iniciar com PM2
cd ..
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # gera comando para iniciar no boot — execute o comando que aparecer
```

> **Atenção:** o `ecosystem.config.js` atual sobe os processos com `npm run start:dev` (backend) e
> `next dev` (frontend) — ou seja, roda em **modo desenvolvimento**, e não usa os builds gerados
> nos passos 4 e 5. Funciona, mas sem as otimizações de produção. Para usar de fato o build,
> troque os `args` do `ecosystem.config.js` para `start:prod` (backend, via `node dist/main`) e
> `next start -p 3002` (frontend).

### Opção B — Docker Compose

```bash
cp .env.production.example .env.production
# Edite o .env.production
./deploy.sh
```

---

## Operação no servidor (PM2)

```bash
pm2 status                       # Ver status dos processos
pm2 logs mario-backend           # Ver logs do backend
pm2 logs mario-frontend          # Ver logs do frontend
pm2 restart mario-backend        # Reiniciar backend
pm2 restart all                  # Reiniciar tudo
pm2 stop all                     # Parar tudo
pm2 monit                        # Monitor em tempo real
```

### Atualizar para nova versão

```bash
cd /caminho/do/projeto
git pull origin main

# Backend
cd backend
npm install
npx prisma migrate deploy
npx nest build
pm2 restart mario-backend

# Frontend
cd ../frontend
npm install
npx next build
pm2 restart mario-frontend
```

---

## Como configurar domínio próprio

Hoje o sistema acessa via túnel temporário do Cloudflare. Para usar `cobranca.canfy.com.br`:

### 1. No DNS do `canfy.com.br` (Registro.br, Cloudflare, etc):

Crie um registro **A** apontando para o IP do servidor:

```
Tipo: A
Nome: cobranca
Valor: <IP_DO_SERVIDOR>
TTL: 3600
```

### 2. No servidor, instale Nginx e Certbot:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 3. Crie a config do Nginx em `/etc/nginx/sites-available/cobranca.canfy.com.br`:

```nginx
server {
    listen 80;
    server_name cobranca.canfy.com.br;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend (API)
    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. Ative o site e gere o certificado HTTPS:

```bash
sudo ln -s /etc/nginx/sites-available/cobranca.canfy.com.br /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d cobranca.canfy.com.br
```

### 5. Atualize o `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=https://cobranca.canfy.com.br/api
```

E rebuilde:

```bash
cd frontend && npx next build && pm2 restart mario-frontend
```

### 6. Pare o túnel temporário (opcional):

```bash
pm2 stop mario-tunnel
pm2 delete mario-tunnel
```

---

## Webhooks Asaas

O sistema recebe eventos de pagamento via webhook em:

```
POST https://cobranca.canfy.com.br/api/webhooks/asaas
```

### Configurar no Asaas:

1. Painel Asaas → **Configurações** → **Integrações** → **Webhooks**
2. Adicione a URL acima
3. Token de autenticação: o mesmo valor de `WEBHOOK_SECRET` no `.env` (o Asaas envia esse valor no
   header `asaas-access-token`, que é o que o backend valida)
4. Eventos: marque **PAYMENT_CONFIRMED** e **PAYMENT_RECEIVED** no mínimo

### Eventos processados:

- `PAYMENT_CONFIRMED` — pagamento confirmado pelo Asaas
- `PAYMENT_RECEIVED` — valor disponível na conta
- `PAYMENT_OVERDUE` — cobrança vencida
- `PAYMENT_REFUNDED` / `PAYMENT_CHARGEBACK` — pagamento estornado

Outros eventos são aceitos e logados, mas não alteram o status da cobrança.

---

## Solução de problemas

### Backend não inicia

```bash
pm2 logs mario-backend --lines 50
# Causas comuns:
# - DATABASE_URL incorreta
# - Postgres não está rodando (docker compose up -d)
# - Migration pendente (npx prisma migrate deploy)
```

### Frontend mostra "Network Error" no login

- Verifique `NEXT_PUBLIC_API_URL` no frontend
- Verifique se o backend está respondendo: `curl http://localhost:3001/api/health`
- Confirme CORS no backend (`FRONTEND_URL` no `.env`)

### Cobrança paga mas não atualizou no painel

- Aguarde até 5 minutos (sync automático)
- Ou force a sincronização clicando em **Atualizar** no painel
- Verifique se o webhook está configurado no Asaas

### Split não aconteceu

- Confirme que é uma cobrança **avulsa** (não link de pagamento)
- Verifique se a subconta tem `walletId` válido em **Subcontas**
- Cheque os logs: `pm2 logs mario-backend | grep -i split`

---

## Suporte

Em caso de dúvidas técnicas durante o período de suporte combinado, entre em contato com o
desenvolvedor responsável.

Para suporte da API Asaas: https://docs.asaas.com/

---

## Licença

Software proprietário desenvolvido para uso exclusivo do cliente.
Todos os direitos reservados.
