# 🎵 Alcatéia Hits - Backend

Backend da plataforma Alcatéia Hits construído com Cloudflare Workers, OpenAuth e integração com MercadoPago.

## 🚀 Tecnologias

- **Cloudflare Workers** - Runtime serverless
- **TypeScript** - Linguagem principal
- **OpenAuth.js** - Sistema de autenticação
- **Cloudflare D1** - Banco de dados SQLite
- **Cloudflare KV** - Armazenamento de chave-valor
- **MercadoPago API** - Pagamentos e assinaturas

## 📋 Funcionalidades

- ✅ Sistema de autenticação completo
- ✅ 3 planos de assinatura (Start, Plus, Premium)
- ✅ Integração com MercadoPago
- ✅ Webhook automático para pagamentos
- ✅ API REST para frontend
- ✅ CORS configurado

## 🛠️ Setup Local

```bash
# Instalar dependências
npm install

# Configurar Cloudflare
npx wrangler login

# Criar banco de dados
npx wrangler d1 create alcateia-mvp-db

# Criar namespace KV
npx wrangler kv namespace create AUTH_STORAGE

# Aplicar migrações
npx wrangler d1 migrations apply --remote alcateia-mvp-db

# Configurar secrets
npx wrangler secret put MERCADOPAGO_ACCESS_TOKEN
npx wrangler secret put MERCADOPAGO_PUBLIC_KEY

# Deploy
npx wrangler deploy
```

## 🔧 Scripts Disponíveis

- `npm run dev` - Executar em modo desenvolvimento
- `npm run deploy` - Deploy para produção
- `npm run db:migrate` - Aplicar migrações
- `npm run tail` - Ver logs em tempo real

## 📚 Documentação

- [Guia de Deploy](../DEPLOYMENT_GUIDE.md)
- [Instruções de Setup](../SETUP_INSTRUCTIONS.md)
- [Guia de Uso](../USAGE_GUIDE.md)

## 🌐 URLs de Produção

- **API**: https://auth.alcateiahits.org
- **Webhook**: https://auth.alcateiahits.org/api/webhooks/mercadopago

## 📞 Suporte

- **Email**: contato@alcateiahits.org
- **WhatsApp**: +55 11 98267-9018
