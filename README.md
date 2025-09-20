# Alcatéia Hits - Sistema de Autenticação

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/openauth-template)

![Alcatéia Hits Logo](https://alcateiahits.org/src/img/loboalpha80px.png)

<!-- dash-content-start -->

Sistema de autenticação personalizado da **Alcatéia Hits** utilizando [OpenAuth](https://openauth.js.org/) como provedor universal para gerenciamento de autenticação de usuários. Este sistema foi implantado no Cloudflare Workers para fornecer autenticação escalável para a plataforma Alcatéia Hits.

O sistema inclui:
- Login e registro de usuários
- Verificação de email
- Recuperação de senha
- Sistema de assinaturas com diferentes planos (Start, Plus, Premium)
- Sessões de produção
- Controle de acesso a conteúdo
- Integração com MercadoPago para pagamentos

Armazenamento e estado são gerenciados por [D1](https://developers.cloudflare.com/d1/) e [KV](https://developers.cloudflare.com/kv/). [Observabilidade](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#enable-workers-logs) está habilitada por padrão.

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/openauth-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/openauth-template
```

O sistema de autenticação da Alcatéia Hits está disponível em [https://auth.alcateiahits.org](https://auth.alcateiahits.org)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/) with the name "openauth-db":
   ```bash
   npx wrangler d1 create openauth-db
   ```
   ...and update the `database_id` field in `wrangler.json` with the new database ID.
3. Run the following db migration to initialize the database (notice the `migrations` directory in this project):
   ```bash
   npx wrangler d1 migrations apply --remote openauth-db
   ```
4. Create a [kv namespace](https://developers.cloudflare.com/kv/get-started/) with a binding named "AUTH_STORAGE":
   ```bash
   npx wrangler kv namespace create AUTH_STORAGE
   ```
   ...and update the `kv_namespaces` -> `id` field in `wrangler.json` with the new namespace ID.
5. Deploy the project!
   ```bash
   npx wrangler deploy
   ```
6. And monitor your worker
   ```bash
   npx wrangler tail
   ```
