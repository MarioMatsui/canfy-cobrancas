# Checkout CanFy

Frontend público do domínio `pagar.canfy.com.br`.

## Escopo desta etapa

- lê a cobrança exclusivamente por `GET /api/public/payment/:token`;
- não usa login/JWT;
- não acessa Supabase/Postgres diretamente;
- não cria pagamentos no Asaas;
- não persiste endereço porque o backend ainda não possui uma rota pública token-scoped para isso;
- não coleta/envia dados reais de cartão enquanto não houver uma estratégia deliberada e segura para o fluxo de pagamento.

A UI de endereço e as superfícies de Pix/cartão já estão componentizadas para as próximas etapas. O ponto de integração do endereço está isolado em `src/lib/shipping-address-service.ts`.

## Desenvolvimento

```bash
npm ci
npm run dev
```

O app abre em `http://localhost:4020`. Em desenvolvimento, `/api/*` é reescrito para `http://localhost:3001/api/*`.

## Produção

Use `NEXT_PUBLIC_API_URL=/api`. O Nginx deve enviar `pagar.canfy.com.br/api/*` ao backend NestJS e o restante ao container do checkout.
