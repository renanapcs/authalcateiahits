export interface VerificationCode {
  code: string;
  expiresAt: Date;
}

export class VerificationService {
  private static readonly CODE_LENGTH = 6;
  private static readonly VERIFICATION_EXPIRY_MINUTES = 10;
  private static readonly PASSWORD_RESET_EXPIRY_MINUTES = 15;

  /**
   * Gera um código de verificação numérico
   */
  static generateCode(): string {
    const min = Math.pow(10, this.CODE_LENGTH - 1);
    const max = Math.pow(10, this.CODE_LENGTH) - 1;
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  /**
   * Cria um código de verificação com data de expiração
   */
  static createVerificationCode(): VerificationCode {
    return {
      code: this.generateCode(),
      expiresAt: new Date(Date.now() + this.VERIFICATION_EXPIRY_MINUTES * 60 * 1000)
    };
  }

  /**
   * Cria um código de recuperação de senha com data de expiração
   */
  static createPasswordResetCode(): VerificationCode {
    return {
      code: this.generateCode(),
      expiresAt: new Date(Date.now() + this.PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000)
    };
  }

  /**
   * Verifica se um código ainda é válido
   */
  static isCodeValid(expiresAt: string | Date): boolean {
    const expiryDate = new Date(expiresAt);
    return expiryDate > new Date();
  }

  /**
   * Valida um código de verificação
   */
  static validateCode(inputCode: string, storedCode: string, expiresAt: string | Date): boolean {
    if (!inputCode || !storedCode) return false;
    if (!this.isCodeValid(expiresAt)) return false;
    return inputCode === storedCode;
  }

  /**
   * Formata a data de expiração para o banco de dados
   */
  static formatExpiryDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Calcula o tempo restante até a expiração em minutos
   */
  static getTimeRemaining(expiresAt: string | Date): number {
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60)));
  }
}

export interface EmailVerificationResult {
  success: boolean;
  message: string;
  timeRemaining?: number;
}

export class EmailVerificationManager {
  constructor(private db: D1Database) {}

  /**
   * Inicia o processo de verificação de email
   */
  async initiateEmailVerification(email: string): Promise<EmailVerificationResult> {
    try {
      // Verificar se o usuário existe
      const user = await this.db.prepare(
        'SELECT id, email_verified FROM user WHERE email = ?'
      ).bind(email).first<{ id: string; email_verified: boolean }>();

      if (!user) {
        return { success: false, message: 'Usuário não encontrado' };
      }

      if (user.email_verified) {
        return { success: false, message: 'Email já verificado' };
      }

      // Gerar novo código de verificação
      const verificationCode = VerificationService.createVerificationCode();

      // Atualizar o usuário com o código
      await this.db.prepare(`
        UPDATE user 
        SET verification_code = ?, verification_expires_at = ?
        WHERE email = ?
      `).bind(
        verificationCode.code,
        VerificationService.formatExpiryDate(verificationCode.expiresAt),
        email
      ).run();

      // Log do email
      await this.logEmailSent(user.id, 'verification', email, 'pending');

      return { 
        success: true, 
        message: 'Código de verificação enviado',
        timeRemaining: VerificationService.VERIFICATION_EXPIRY_MINUTES
      };
    } catch (error) {
      console.error('Error initiating email verification:', error);
      return { success: false, message: 'Erro interno do servidor' };
    }
  }

  /**
   * Verifica o código de verificação
   */
  async verifyEmailCode(email: string, code: string): Promise<EmailVerificationResult> {
    try {
      const user = await this.db.prepare(`
        SELECT id, verification_code, verification_expires_at, email_verified 
        FROM user WHERE email = ?
      `).bind(email).first<{ 
        id: string; 
        verification_code: string; 
        verification_expires_at: string; 
        email_verified: boolean 
      }>();

      if (!user) {
        return { success: false, message: 'Usuário não encontrado' };
      }

      if (user.email_verified) {
        return { success: false, message: 'Email já verificado' };
      }

      if (!user.verification_code) {
        return { success: false, message: 'Nenhum código de verificação encontrado' };
      }

      if (!VerificationService.validateCode(code, user.verification_code, user.verification_expires_at)) {
        return { success: false, message: 'Código inválido ou expirado' };
      }

      // Marcar email como verificado
      await this.db.prepare(`
        UPDATE user 
        SET email_verified = TRUE, verification_code = NULL, verification_expires_at = NULL
        WHERE email = ?
      `).bind(email).run();

      // Atualizar log do email
      await this.updateEmailLog(user.id, 'verification', 'sent');

      return { success: true, message: 'Email verificado com sucesso!' };
    } catch (error) {
      console.error('Error verifying email code:', error);
      return { success: false, message: 'Erro interno do servidor' };
    }
  }

  /**
   * Inicia o processo de recuperação de senha
   */
  async initiatePasswordReset(email: string): Promise<EmailVerificationResult> {
    try {
      const user = await this.db.prepare(
        'SELECT id FROM user WHERE email = ?'
      ).bind(email).first<{ id: string }>();

      if (!user) {
        // Por segurança, não revelamos se o email existe ou não
        return { success: true, message: 'Se o email existir, você receberá instruções de recuperação' };
      }

      // Gerar novo código de recuperação
      const resetCode = VerificationService.createPasswordResetCode();

      // Atualizar o usuário com o código
      await this.db.prepare(`
        UPDATE user 
        SET password_reset_code = ?, password_reset_expires_at = ?
        WHERE email = ?
      `).bind(
        resetCode.code,
        VerificationService.formatExpiryDate(resetCode.expiresAt),
        email
      ).run();

      // Log do email
      await this.logEmailSent(user.id, 'password_reset', email, 'pending');

      return { 
        success: true, 
        message: 'Código de recuperação enviado',
        timeRemaining: VerificationService.PASSWORD_RESET_EXPIRY_MINUTES
      };
    } catch (error) {
      console.error('Error initiating password reset:', error);
      return { success: false, message: 'Erro interno do servidor' };
    }
  }

  /**
   * Verifica o código de recuperação de senha
   */
  async verifyPasswordResetCode(email: string, code: string): Promise<EmailVerificationResult> {
    try {
      const user = await this.db.prepare(`
        SELECT id, password_reset_code, password_reset_expires_at 
        FROM user WHERE email = ?
      `).bind(email).first<{ 
        id: string; 
        password_reset_code: string; 
        password_reset_expires_at: string 
      }>();

      if (!user) {
        return { success: false, message: 'Usuário não encontrado' };
      }

      if (!user.password_reset_code) {
        return { success: false, message: 'Nenhum código de recuperação encontrado' };
      }

      if (!VerificationService.validateCode(code, user.password_reset_code, user.password_reset_expires_at)) {
        return { success: false, message: 'Código inválido ou expirado' };
      }

      return { success: true, message: 'Código válido' };
    } catch (error) {
      console.error('Error verifying password reset code:', error);
      return { success: false, message: 'Erro interno do servidor' };
    }
  }

  /**
   * Limpa códigos de verificação expirados
   */
  async clearExpiredCodes(): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      await this.db.prepare(`
        UPDATE user 
        SET verification_code = NULL, verification_expires_at = NULL
        WHERE verification_expires_at < ?
      `).bind(now).run();

      await this.db.prepare(`
        UPDATE user 
        SET password_reset_code = NULL, password_reset_expires_at = NULL
        WHERE password_reset_expires_at < ?
      `).bind(now).run();
    } catch (error) {
      console.error('Error clearing expired codes:', error);
    }
  }

  /**
   * Registra o envio de um email
   */
  private async logEmailSent(
    userId: string, 
    emailType: string, 
    recipientEmail: string, 
    status: string
  ): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO email_logs (user_id, email_type, recipient_email, status, sent_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(userId, emailType, recipientEmail, status, new Date().toISOString()).run();
    } catch (error) {
      console.error('Error logging email:', error);
    }
  }

  /**
   * Atualiza o status de um email log
   */
  private async updateEmailLog(userId: string, emailType: string, status: string): Promise<void> {
    try {
      await this.db.prepare(`
        UPDATE email_logs 
        SET status = ?, sent_at = ?
        WHERE user_id = ? AND email_type = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(status, new Date().toISOString(), userId, emailType).run();
    } catch (error) {
      console.error('Error updating email log:', error);
    }
  }
}