# Finança — Planejador Financeiro

Dashboard financeiro pessoal (PF) e empresarial (PJ) com controle de receitas, despesas, metas, dívidas, patrimônio, assinaturas, projeções e câmbio.

## Stack

- **Frontend**: Single-page app (HTML/CSS/JS) com Supabase-js via CDN
- **Backend**: Node.js + Express (helmet, compression, CORS)
- **Banco de dados**: Supabase (Postgres + Auth + Row Level Security)
- **Pagamentos**: Stripe (checkout, portal, webhooks)
- **Deploy**: Railway (ou qualquer plataforma Node)

## Pré-requisitos

- Node.js >= 20
- Conta no [Supabase](https://supabase.com)
- Conta no [Stripe](https://stripe.com) (opcional — app funciona em modo demo sem)

## Setup

### 1. Clonar e instalar

```bash
git clone <seu-repo>
cd financa-app
npm install
```

### 2. Configurar Supabase

1. Crie um projeto no [Supabase Dashboard](https://app.supabase.com)
2. Vá em **SQL Editor** e execute o conteúdo de `supabase/migrations/001_initial_schema.sql`
3. Copie a **URL** e as chaves **anon** e **service_role** de **Settings → API**

### 3. Configurar Stripe (opcional)

1. No [Stripe Dashboard](https://dashboard.stripe.com), crie 3 produtos com preços recorrentes mensais:
   - **Plus** — R$ 19,90/mês
   - **Pro** — R$ 39,90/mês
   - **Business** — R$ 99,90/mês
2. Copie o `price_id` de cada um (começa com `price_`)
3. Crie um webhook endpoint apontando para `https://seu-dominio.com/api/stripe/webhook` com os eventos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copie o **Webhook Signing Secret** (`whsec_...`)

### 4. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PLUS=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_BUSINESS=price_...

PORT=3000
APP_URL=https://seu-dominio.com
```

### 5. Rodar localmente

```bash
npm run dev
```

Acesse `http://localhost:3000`. Sem Supabase configurado, roda em modo demo (dados locais apenas).

## Deploy no Railway

1. Crie um projeto no [Railway](https://railway.app)
2. Conecte o repositório Git
3. Adicione as variáveis de ambiente em **Variables**
4. O `railway.json` já configura o build e start automaticamente
5. Após o deploy, atualize `APP_URL` com a URL do Railway e o webhook do Stripe

O healthcheck está em `/api/health`.

## Estrutura

```
financa-app/
├── package.json
├── railway.json
├── .env.example
├── public/
│   └── index.html          ← Frontend completo (SPA)
├── src/
│   ├── server.js            ← Express server
│   └── routes/
│       └── stripe.js        ← Checkout, portal, webhooks
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

## Funcionalidades

- Autenticação (email/senha) via Supabase Auth
- Dashboard com saldo patrimonial, KPIs e gráficos
- CRUD completo: receitas, despesas, metas, dívidas, ativos, passivos, assinaturas
- Projeção financeira com cenários (conservador/moderado/otimista)
- Score de saúde financeira (0–100)
- Conversor de câmbio em tempo real
- Exportação de dados em JSON
- Planos pagos via Stripe com portal de gestão
- Tema claro/escuro automático
- Responsivo (mobile-first)
- Row Level Security — cada usuário vê apenas seus dados

## Licença

Proprietário. Todos os direitos reservados.
