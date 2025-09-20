-- Migration number: 0003 	 2024-12-27T23:00:00.000Z

-- Adicionar campos de verificação de email
ALTER TABLE user ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user ADD COLUMN verification_code TEXT;
ALTER TABLE user ADD COLUMN verification_expires_at TIMESTAMP;

-- Adicionar campos de recuperação de senha
ALTER TABLE user ADD COLUMN password_reset_code TEXT;
ALTER TABLE user ADD COLUMN password_reset_expires_at TIMESTAMP;

-- Criar tabela para logs de emails enviados
CREATE TABLE IF NOT EXISTS email_logs (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT,
    email_type TEXT NOT NULL CHECK (email_type IN ('verification', 'password_reset', 'welcome', 'notification')),
    recipient_email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pending')) DEFAULT 'pending',
    sent_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_user_email_verified ON user(email_verified);
CREATE INDEX IF NOT EXISTS idx_user_verification_code ON user(verification_code);
CREATE INDEX IF NOT EXISTS idx_user_password_reset_code ON user(password_reset_code);
CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);