# Sistema de Mensageria - Alcateia Hits

## Visão Geral

Este sistema implementa um serviço completo de mensageria por email para o Alcateia Hits, incluindo:

- ✅ Verificação de email para novos usuários
- ✅ Recuperação de senha
- ✅ Emails de boas-vindas
- ✅ Templates HTML responsivos
- ✅ Logs de envio de emails
- ✅ Códigos de verificação com expiração

## Configuração SMTP

### Credenciais Gmail
- **Email**: `alcateiahits@gmail.com`
- **Senha de App**: `xpsr ijar ztrp duse`
- **SMTP**: `smtp.gmail.com:587`

### Variáveis de Ambiente
```json
{
  "SMTP_USER": "alcateiahits@gmail.com",
  "SMTP_PASS": "xpsr ijar ztrp duse"
}
```

## APIs Disponíveis

### 1. Verificação de Email

#### Iniciar Verificação
```http
POST /api/email/verify
Content-Type: application/json

{
  "email": "usuario@exemplo.com"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Código de verificação enviado",
  "timeRemaining": 10
}
```

#### Verificar Código
```http
POST /api/email/verify-code
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "code": "123456"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Email verificado com sucesso!"
}
```

### 2. Recuperação de Senha

#### Solicitar Recuperação
```http
POST /api/email/password-reset
Content-Type: application/json

{
  "email": "usuario@exemplo.com"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Código de recuperação enviado",
  "timeRemaining": 15
}
```

#### Verificar Código de Recuperação
```http
POST /api/email/verify-reset-code
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "code": "123456"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Código válido"
}
```

### 3. Email de Boas-vindas

```http
POST /api/email/welcome
Content-Type: application/json

{
  "email": "usuario@exemplo.com"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Email de boas-vindas enviado"
}
```

## Templates de Email

### 1. Verificação de Email
- **Assunto**: "Código de Verificação - Alcateia Hits"
- **Expiração**: 10 minutos
- **Design**: Gradiente azul/roxo com código destacado

### 2. Recuperação de Senha
- **Assunto**: "Recuperação de Senha - Alcateia Hits"
- **Expiração**: 15 minutos
- **Design**: Gradiente azul/roxo com aviso de segurança

### 3. Boas-vindas
- **Assunto**: "Bem-vindo à Alcateia Hits! 🎵"
- **Design**: Apresentação dos recursos da plataforma

## Banco de Dados

### Tabela `user` (campos adicionados)
```sql
ALTER TABLE user ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user ADD COLUMN verification_code TEXT;
ALTER TABLE user ADD COLUMN verification_expires_at TIMESTAMP;
ALTER TABLE user ADD COLUMN password_reset_code TEXT;
ALTER TABLE user ADD COLUMN password_reset_expires_at TIMESTAMP;
```

### Tabela `email_logs`
```sql
CREATE TABLE email_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email_type TEXT CHECK (email_type IN ('verification', 'password_reset', 'welcome', 'notification')),
    recipient_email TEXT NOT NULL,
    status TEXT CHECK (status IN ('sent', 'failed', 'pending')) DEFAULT 'pending',
    sent_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Fluxo de Autenticação

### 1. Cadastro de Usuário
1. Usuário se cadastra com email
2. Sistema gera código de verificação
3. Email é enviado automaticamente
4. Usuário verifica email com código
5. Conta é marcada como verificada

### 2. Recuperação de Senha
1. Usuário solicita recuperação
2. Sistema gera código de recuperação
3. Email é enviado com código
4. Usuário verifica código
5. Sistema permite redefinir senha

## Segurança

- ✅ Códigos expiram automaticamente
- ✅ Limpeza automática de códigos expirados
- ✅ Logs de todas as tentativas
- ✅ Rate limiting (implementar conforme necessário)
- ✅ Validação de entrada

## Monitoramento

### Logs de Email
Todos os emails enviados são registrados na tabela `email_logs` com:
- Status do envio
- Tipo de email
- Timestamp
- Mensagens de erro (se houver)

### Limpeza Automática
Códigos expirados são limpos automaticamente para manter o banco otimizado.

## Deploy

1. Execute a migração do banco:
```bash
wrangler d1 migrations apply AUTH_DB --remote
```

2. Configure as variáveis de ambiente no Cloudflare Workers

3. Deploy do Worker:
```bash
wrangler deploy
```

## Troubleshooting

### Email não enviado
1. Verificar logs no Cloudflare Workers
2. Verificar configuração SMTP
3. Verificar tabela `email_logs`

### Código inválido
1. Verificar se não expirou
2. Verificar se foi usado corretamente
3. Verificar logs de tentativas

### Problemas de CORS
Verificar configuração de `ALLOWED_ORIGINS` no `wrangler.json`.