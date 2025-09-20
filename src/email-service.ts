export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  async sendEmail(to: string, template: EmailTemplate): Promise<boolean> {
    try {
      // Para Cloudflare Workers, vamos usar fetch para enviar emails via API
      // Como não temos acesso direto ao SMTP, vamos usar um serviço como Resend ou SendGrid
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.auth.pass}`, // Usando como API key
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.config.auth.user,
          to: [to],
          subject: template.subject,
          html: template.html,
          text: template.text,
        }),
      });

      if (!response.ok) {
        console.error('Failed to send email:', await response.text());
        return false;
      }

      console.log(`Email sent successfully to ${to}`);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  // Template para código de verificação
  createVerificationTemplate(code: string, email: string): EmailTemplate {
    return {
      subject: 'Código de Verificação - Alcateia Hits',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Código de Verificação</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .code { background: #fff; border: 2px dashed #667eea; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; color: #667eea; margin: 20px 0; border-radius: 8px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎵 Alcateia Hits</h1>
              <p>Verificação de Conta</p>
            </div>
            <div class="content">
              <h2>Olá!</h2>
              <p>Você está quase lá! Use o código abaixo para verificar sua conta:</p>
              <div class="code">${code}</div>
              <p><strong>Este código expira em 10 minutos.</strong></p>
              <p>Se você não solicitou esta verificação, pode ignorar este email.</p>
            </div>
            <div class="footer">
              <p>© 2024 Alcateia Hits. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Código de Verificação - Alcateia Hits
        
        Olá!
        
        Você está quase lá! Use o código abaixo para verificar sua conta:
        
        ${code}
        
        Este código expira em 10 minutos.
        
        Se você não solicitou esta verificação, pode ignorar este email.
        
        © 2024 Alcateia Hits. Todos os direitos reservados.
      `
    };
  }

  // Template para recuperação de senha
  createPasswordRecoveryTemplate(code: string, email: string): EmailTemplate {
    return {
      subject: 'Recuperação de Senha - Alcateia Hits',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Recuperação de Senha</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .code { background: #fff; border: 2px dashed #667eea; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; color: #667eea; margin: 20px 0; border-radius: 8px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Alcateia Hits</h1>
              <p>Recuperação de Senha</p>
            </div>
            <div class="content">
              <h2>Recuperação de Senha</h2>
              <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
              <p>Use o código abaixo para continuar:</p>
              <div class="code">${code}</div>
              <div class="warning">
                <strong>⚠️ Importante:</strong> Este código expira em 15 minutos. Se você não solicitou esta recuperação, ignore este email e sua senha permanecerá inalterada.
              </div>
              <p>Se você não fez esta solicitação, recomendamos que verifique a segurança da sua conta.</p>
            </div>
            <div class="footer">
              <p>© 2024 Alcateia Hits. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Recuperação de Senha - Alcateia Hits
        
        Recuperação de Senha
        
        Recebemos uma solicitação para redefinir a senha da sua conta.
        
        Use o código abaixo para continuar:
        
        ${code}
        
        ⚠️ IMPORTANTE: Este código expira em 15 minutos. Se você não solicitou esta recuperação, ignore este email e sua senha permanecerá inalterada.
        
        Se você não fez esta solicitação, recomendamos que verifique a segurança da sua conta.
        
        © 2024 Alcateia Hits. Todos os direitos reservados.
      `
    };
  }

  // Template para confirmação de cadastro
  createWelcomeTemplate(email: string): EmailTemplate {
    return {
      subject: 'Bem-vindo à Alcateia Hits! 🎵',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bem-vindo!</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .feature { background: #fff; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #667eea; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎵 Alcateia Hits</h1>
              <p>Bem-vindo à nossa comunidade!</p>
            </div>
            <div class="content">
              <h2>Parabéns! Sua conta foi criada com sucesso!</h2>
              <p>Bem-vindo à Alcateia Hits! Estamos muito felizes em tê-lo como parte da nossa comunidade de produtores musicais.</p>
              
              <h3>O que você pode fazer agora:</h3>
              <div class="feature">
                <strong>🎼 Acessar conteúdo exclusivo</strong><br>
                Explore nossa biblioteca de beats, samples e tutoriais.
              </div>
              <div class="feature">
                <strong>🎧 Sessões de produção</strong><br>
                Agende sessões com nossos produtores especializados.
              </div>
              <div class="feature">
                <strong>🌐 Registro de domínio</strong><br>
                Para planos Premium, registre seu domínio personalizado.
              </div>
              
              <p>Se você tiver alguma dúvida, não hesite em entrar em contato conosco!</p>
            </div>
            <div class="footer">
              <p>© 2024 Alcateia Hits. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Bem-vindo à Alcateia Hits! 🎵
        
        Parabéns! Sua conta foi criada com sucesso!
        
        Bem-vindo à Alcateia Hits! Estamos muito felizes em tê-lo como parte da nossa comunidade de produtores musicais.
        
        O que você pode fazer agora:
        
        🎼 Acessar conteúdo exclusivo
        Explore nossa biblioteca de beats, samples e tutoriais.
        
        🎧 Sessões de produção
        Agende sessões com nossos produtores especializados.
        
        🌐 Registro de domínio
        Para planos Premium, registre seu domínio personalizado.
        
        Se você tiver alguma dúvida, não hesite em entrar em contato conosco!
        
        © 2024 Alcateia Hits. Todos os direitos reservados.
      `
    };
  }
}