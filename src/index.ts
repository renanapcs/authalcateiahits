import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string, enum as enumType, number, boolean } from "valibot";
import { EmailService } from "./email-service";
import { EmailVerificationManager } from "./verification-service";

// This value should be shared between the OpenAuth server Worker and other
// client Workers that you connect to it, so the types and schema validation are
// consistent.
const subjects = createSubjects({
  user: object({
    id: string(),
    email: string(),
    email_verified: object({
      verified: boolean,
      verification_code: string().optional(),
      verification_expires_at: string().optional(),
    }).optional(),
    subscription: object({
      id: string(),
      plan_type: enumType(['start', 'plus', 'premium']),
      status: enumType(['active', 'cancelled', 'expired', 'pending']),
      features: object({
        music_limit: number(),
        producer_sessions: number(),
        domain_registration: number(),
      }),
    }).optional(),
  }),
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    
    // Handle CORS for frontend requests
    const origin = request.headers.get('Origin');
    const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || [
      'https://alcateiahits.org',
      'https://www.alcateiahits.org',
      'http://localhost:80',
      'http://localhost:3000'
    ];
    
    // Determine the allowed origin
    let allowedOrigin = env.FRONTEND_DOMAIN || 'https://alcateiahits.org';
    if (origin && allowedOrigins.includes(origin)) {
      allowedOrigin = origin;
    }
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Subscription APIs
    if (url.pathname.startsWith('/api/subscriptions')) {
      return handleSubscriptionAPI(request, env, corsHeaders);
    }

    // Producer session APIs
    if (url.pathname.startsWith('/api/producer-sessions')) {
      return handleProducerSessionAPI(request, env, corsHeaders);
    }

    // Content access APIs
    if (url.pathname.startsWith('/api/content')) {
      return handleContentAPI(request, env, corsHeaders);
    }

    // Email verification APIs
    if (url.pathname.startsWith('/api/email')) {
      return handleEmailAPI(request, env, corsHeaders);
    }

    // MercadoPago webhook
    if (url.pathname === '/api/webhooks/mercadopago') {
      return handleMercadoPagoWebhook(request, env, corsHeaders);
    }

    // This top section is just for demo purposes. In a real setup another
    // application would redirect the user to this Worker to be authenticated,
    // and after signing in or registering the user would be redirected back to
    // the application they came from. In our demo setup there is no other
    // application, so this Worker needs to do the initial redirect and handle
    // the callback redirect on completion.
    if (url.pathname === "/") {
      url.searchParams.set("redirect_uri", url.origin + "/callback");
      url.searchParams.set("client_id", "your-client-id");
      url.searchParams.set("response_type", "code");
      url.pathname = "/authorize";
      return Response.redirect(url.toString());
    } else if (url.pathname === "/callback") {
      return new Response(JSON.stringify({
        message: "OAuth flow complete!",
        params: Object.fromEntries(url.searchParams.entries()),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // The real OpenAuth server code starts here:
    const response = await issuer({
      storage: CloudflareStorage({
        namespace: env.AUTH_STORAGE,
      }),
      subjects,
      providers: {
        password: PasswordProvider(
          PasswordUI({
            // eslint-disable-next-line @typescript-eslint/require-await
            sendCode: async (email, code) => {
              try {
                // Configurar o serviço de email
                const emailService = new EmailService({
                  host: 'smtp.gmail.com',
                  port: 587,
                  secure: false,
                  auth: {
                    user: env['SMTP_USER'] || 'alcateiahits@gmail.com',
                    pass: env['SMTP_PASS'] || 'xpsr ijar ztrp duse'
                  }
                });

                // Criar template de verificação
                const template = emailService.createVerificationTemplate(code, email);
                
                // Enviar email
                const success = await emailService.sendEmail(email, template);
                
                if (success) {
                  console.log(`Verification code sent successfully to ${email}`);
                  
                  // Log do envio
                  const verificationManager = new EmailVerificationManager(env.AUTH_DB);
                  await verificationManager.logEmailSent('', 'verification', email, 'sent');
                } else {
                  console.error(`Failed to send verification code to ${email}`);
                }
              } catch (error) {
                console.error('Error sending verification code:', error);
              }
            },
            copy: {
              input_code: "Digite o código enviado para seu email",
            },
          }),
        ),
      },
      theme: {
        title: "myAuth",
        primary: "#0051c3",
        favicon: "https://workers.cloudflare.com//favicon.ico",
        logo: {
          dark: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/db1e5c92-d3a6-4ea9-3e72-155844211f00/public",
          light:
            "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fa5a3023-7da9-466b-98a7-4ce01ee6c700/public",
        },
      },
      success: async (ctx, value) => {
        const userId = await getOrCreateUser(env, value.email);
        const subscription = await getUserSubscription(env, userId);
        const emailVerification = await getEmailVerificationStatus(env, userId);
        
        return ctx.subject("user", {
          id: userId,
          email: value.email,
          email_verified: emailVerification,
          subscription: subscription,
        });
      },
    }).fetch(request, env, ctx);

    // Add CORS headers to the OpenAuth response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
} satisfies ExportedHandler<Env>;

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const result = await env.AUTH_DB.prepare(
    `
		INSERT INTO user (email)
		VALUES (?)
		ON CONFLICT (email) DO UPDATE SET email = email
		RETURNING id;
		`,
  )
    .bind(email)
    .first<{ id: string }>();
  if (!result) {
    throw new Error(`Unable to process user: ${email}`);
  }
  console.log(`Found or created user ${result.id} with email ${email}`);
  return result.id;
}

async function getUserSubscription(env: Env, userId: string) {
  const subscription = await env.AUTH_DB.prepare(`
    SELECT s.*, 
           sf_music.feature_value as music_limit,
           sf_producer.feature_value as producer_sessions,
           sf_domain.feature_value as domain_registration
    FROM subscriptions s
    LEFT JOIN subscription_features sf_music ON s.id = sf_music.subscription_id AND sf_music.feature_type = 'music_limit'
    LEFT JOIN subscription_features sf_producer ON s.id = sf_producer.subscription_id AND sf_producer.feature_type = 'producer_sessions'
    LEFT JOIN subscription_features sf_domain ON s.id = sf_domain.subscription_id AND sf_domain.feature_type = 'domain_registration'
    WHERE s.user_id = ? AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1
  `).bind(userId).first();

  if (!subscription) return null;

  return {
    id: subscription.id,
    plan_type: subscription.plan_type,
    status: subscription.status,
    features: {
      music_limit: subscription.music_limit || 0,
      producer_sessions: subscription.producer_sessions || 0,
      domain_registration: subscription.domain_registration || 0,
    },
  };
}

async function getEmailVerificationStatus(env: Env, userId: string) {
  const user = await env.AUTH_DB.prepare(`
    SELECT email_verified, verification_code, verification_expires_at
    FROM user WHERE id = ?
  `).bind(userId).first<{ 
    email_verified: boolean; 
    verification_code: string | null; 
    verification_expires_at: string | null 
  }>();

  if (!user) return null;

  return {
    verified: user.email_verified,
    verification_code: user.verification_code,
    verification_expires_at: user.verification_expires_at,
  };
}

// Email API handlers
async function handleEmailAPI(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const url = new URL(request.url);
  const verificationManager = new EmailVerificationManager(env.AUTH_DB);
  
  // Iniciar verificação de email
  if (request.method === 'POST' && url.pathname === '/api/email/verify') {
    const body = await request.json() as { email: string };
    const result = await verificationManager.initiateEmailVerification(body.email);
    
    if (result.success) {
      // Enviar email com código
      const emailService = new EmailService({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: env['SMTP_USER'] || 'alcateiahits@gmail.com',
          pass: env['SMTP_PASS'] || 'xpsr ijar ztrp duse'
        }
      });

      // Buscar código do usuário
      const user = await env.AUTH_DB.prepare(`
        SELECT verification_code FROM user WHERE email = ?
      `).bind(body.email).first<{ verification_code: string }>();

      if (user?.verification_code) {
        const template = emailService.createVerificationTemplate(user.verification_code, body.email);
        await emailService.sendEmail(body.email, template);
      }
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Verificar código de email
  if (request.method === 'POST' && url.pathname === '/api/email/verify-code') {
    const body = await request.json() as { email: string; code: string };
    const result = await verificationManager.verifyEmailCode(body.email, body.code);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Iniciar recuperação de senha
  if (request.method === 'POST' && url.pathname === '/api/email/password-reset') {
    const body = await request.json() as { email: string };
    const result = await verificationManager.initiatePasswordReset(body.email);
    
    if (result.success) {
      // Enviar email com código de recuperação
      const emailService = new EmailService({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: env['SMTP_USER'] || 'alcateiahits@gmail.com',
          pass: env['SMTP_PASS'] || 'xpsr ijar ztrp duse'
        }
      });

      // Buscar código do usuário
      const user = await env.AUTH_DB.prepare(`
        SELECT password_reset_code FROM user WHERE email = ?
      `).bind(body.email).first<{ password_reset_code: string }>();

      if (user?.password_reset_code) {
        const template = emailService.createPasswordRecoveryTemplate(user.password_reset_code, body.email);
        await emailService.sendEmail(body.email, template);
      }
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Verificar código de recuperação de senha
  if (request.method === 'POST' && url.pathname === '/api/email/verify-reset-code') {
    const body = await request.json() as { email: string; code: string };
    const result = await verificationManager.verifyPasswordResetCode(body.email, body.code);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Enviar email de boas-vindas
  if (request.method === 'POST' && url.pathname === '/api/email/welcome') {
    const body = await request.json() as { email: string };
    
    try {
      const emailService = new EmailService({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: env['SMTP_USER'] || 'alcateiahits@gmail.com',
          pass: env['SMTP_PASS'] || 'xpsr ijar ztrp duse'
        }
      });

      const template = emailService.createWelcomeTemplate(body.email);
      const success = await emailService.sendEmail(body.email, template);
      
      return new Response(JSON.stringify({ 
        success, 
        message: success ? 'Email de boas-vindas enviado' : 'Falha ao enviar email' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Erro interno do servidor' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

// Subscription API handlers
async function handleSubscriptionAPI(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const url = new URL(request.url);
  
  if (request.method === 'POST' && url.pathname === '/api/subscriptions') {
    const body = await request.json() as { user_id: string; plan_type: string; mercadopago_subscription_id?: string };
    
    const subscription = await env.AUTH_DB.prepare(`
      INSERT INTO subscriptions (user_id, plan_type, mercadopago_subscription_id, status)
      VALUES (?, ?, ?, 'pending')
      RETURNING id
    `).bind(body.user_id, body.plan_type, body.mercadopago_subscription_id || null).first();

    // Create default features for the subscription
    const planFeatures = {
      start: { music_limit: 1, producer_sessions: 0, domain_registration: 0 },
      plus: { music_limit: 2, producer_sessions: 1, domain_registration: 0 },
      premium: { music_limit: 4, producer_sessions: 4, domain_registration: 1 },
    };

    const features = planFeatures[body.plan_type as keyof typeof planFeatures];
    
    await env.AUTH_DB.prepare(`
      INSERT INTO subscription_features (subscription_id, feature_type, feature_value)
      VALUES (?, 'music_limit', ?), (?, 'producer_sessions', ?), (?, 'domain_registration', ?)
    `).bind(
      subscription.id, features.music_limit,
      subscription.id, features.producer_sessions,
      subscription.id, features.domain_registration
    ).run();

    return new Response(JSON.stringify({ subscription_id: subscription.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/subscriptions/')) {
    const userId = url.pathname.split('/')[3];
    const subscription = await getUserSubscription(env, userId);
    
    return new Response(JSON.stringify(subscription), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

// Producer session API handlers
async function handleProducerSessionAPI(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const url = new URL(request.url);
  
  if (request.method === 'POST' && url.pathname === '/api/producer-sessions') {
    const body = await request.json() as { 
      subscription_id: string; 
      producer_name: string; 
      session_date: string; 
      notes?: string 
    };
    
    const session = await env.AUTH_DB.prepare(`
      INSERT INTO producer_sessions (subscription_id, producer_name, session_date, notes)
      VALUES (?, ?, ?, ?)
      RETURNING id
    `).bind(body.subscription_id, body.producer_name, body.session_date, body.notes || null).first();

    return new Response(JSON.stringify({ session_id: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/producer-sessions/')) {
    const subscriptionId = url.pathname.split('/')[3];
    const sessions = await env.AUTH_DB.prepare(`
      SELECT * FROM producer_sessions 
      WHERE subscription_id = ? 
      ORDER BY session_date DESC
    `).bind(subscriptionId).all();

    return new Response(JSON.stringify(sessions.results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

// Content access API handlers
async function handleContentAPI(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const url = new URL(request.url);
  
  if (request.method === 'POST' && url.pathname === '/api/content/access') {
    const body = await request.json() as { 
      user_id: string; 
      content_type: string; 
      content_id: string 
    };
    
    await env.AUTH_DB.prepare(`
      INSERT INTO content_access (user_id, content_type, content_id)
      VALUES (?, ?, ?)
    `).bind(body.user_id, body.content_type, body.content_id).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/content/')) {
    const userId = url.pathname.split('/')[3];
    const content = await env.AUTH_DB.prepare(`
      SELECT * FROM content_access 
      WHERE user_id = ? 
      ORDER BY accessed_at DESC
    `).bind(userId).all();

    return new Response(JSON.stringify(content.results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

// MercadoPago webhook handler
async function handleMercadoPagoWebhook(request: Request, env: Env, corsHeaders: Record<string, string>) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    
    // Handle subscription payment notifications
    if (body.type === 'subscription') {
      const subscriptionId = body.data.id;
      const status = body.action; // 'payment.created', 'payment.approved', etc.
      
      // Update subscription status based on payment
      if (status === 'payment.approved') {
        await env.AUTH_DB.prepare(`
          UPDATE subscriptions 
          SET status = 'active', updated_at = CURRENT_TIMESTAMP
          WHERE mercadopago_subscription_id = ?
        `).bind(subscriptionId).run();
        
        console.log(`Subscription ${subscriptionId} activated`);
      } else if (status === 'payment.cancelled' || status === 'payment.failed') {
        await env.AUTH_DB.prepare(`
          UPDATE subscriptions 
          SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
          WHERE mercadopago_subscription_id = ?
        `).bind(subscriptionId).run();
        
        console.log(`Subscription ${subscriptionId} cancelled`);
      }
    }
    
    return new Response('OK', { headers: corsHeaders });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
}
