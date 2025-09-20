# Configuração de Segredos - Cloudflare Workers

## Variáveis de Ambiente e Segredos Configurados

### Variáveis de Ambiente (públicas)
Estas variáveis são definidas no arquivo `wrangler.json` e são visíveis no código:

- `FRONTEND_DOMAIN`: https://alcateiahits.org
- `AUTH_DOMAIN`: https://auth.alcateiahits.org  
- `ALLOWED_ORIGINS`: Lista de origens permitidas para CORS

### Segredos (criptografados)
Estes segredos são armazenados de forma criptografada no Cloudflare Workers:

- `Access Token`: Token de acesso para APIs externas
- `apiKey`: Chave da API para serviços externos
- `Public Key`: Chave pública para autenticação
- `SMTP_PASS`: Senha do servidor SMTP (Gmail)
- `SMTP_USER`: Usuário do servidor SMTP (Gmail)

## Como Configurar os Segredos

### 1. Via Wrangler CLI

```bash
# Configurar cada segredo individualmente
wrangler secret put "Access Token"
wrangler secret put apiKey
wrangler secret put "Public Key"
wrangler secret put SMTP_PASS
wrangler secret put SMTP_USER
```

### 2. Via Dashboard do Cloudflare

1. Acesse o [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Vá para Workers & Pages
3. Selecione seu worker `authalcateiahits`
4. Vá para Settings > Variables
5. Na seção "Environment Variables", adicione cada segredo:
   - Nome: `Access Token`, Valor: [seu token]
   - Nome: `apiKey`, Valor: [sua chave da API]
   - Nome: `Public Key`, Valor: [sua chave pública]
   - Nome: `SMTP_PASS`, Valor: [sua senha do Gmail]
   - Nome: `SMTP_USER`, Valor: [seu email do Gmail]

### 3. Valores Recomendados

- **SMTP_USER**: Seu email do Gmail (ex: `alcateiahits@gmail.com`)
- **SMTP_PASS**: Senha de app do Gmail (não sua senha normal)
- **Access Token**: Token de acesso do MercadoPago ou outro serviço
- **apiKey**: Chave da API do MercadoPago
- **Public Key**: Chave pública do MercadoPago

## Configuração do Gmail SMTP

Para usar o Gmail como servidor SMTP, você precisa:

1. Ativar a verificação em duas etapas na sua conta Google
2. Gerar uma "Senha de app" específica:
   - Vá para Configurações da Conta Google
   - Segurança > Verificação em duas etapas
   - Senhas de app
   - Selecione "Outro" e digite "Cloudflare Workers"
   - Use a senha gerada como valor do segredo `SMTP_PASS`

## Deploy

### 1. Configurar Token de API do Cloudflare

Primeiro, você precisa criar um token de API:

1. Acesse [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Clique em "Create Token"
3. Use o template "Edit Cloudflare Workers" 
4. Configure as permissões:
   - Account: Workers:Edit
   - Zone: Zone:Read (se aplicável)
5. Copie o token gerado

### 2. Configurar o Token no Ambiente

```bash
# Definir o token como variável de ambiente
export CLOUDFLARE_API_TOKEN="seu_token_aqui"

# Ou criar um arquivo .env
echo "CLOUDFLARE_API_TOKEN=seu_token_aqui" > .env
```

### 3. Fazer o Deploy

```bash
# Usando wrangler v3 (compatível com Node.js v18)
npx wrangler@3 deploy

# Ou se tiver wrangler instalado globalmente
wrangler deploy
```

## Verificação

Para verificar se os segredos estão configurados corretamente:

```bash
wrangler secret list
```

## Segurança

- ✅ Segredos são criptografados no Cloudflare
- ✅ Não são visíveis no código fonte
- ✅ Não aparecem nos logs do worker
- ✅ Podem ser rotacionados sem alterar o código