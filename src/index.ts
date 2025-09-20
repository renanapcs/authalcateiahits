import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string, enum as enumType, number } from "valibot";

// This value should be shared between the OpenAuth server Worker and other
// client Workers that you connect to it, so the types and schema validation are
// consistent.
const subjects = createSubjects({
  user: object({
    id: string(),
    email: string(),
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
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : env.FRONTEND_DOMAIN || 'https://alcateiahits.org',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      return Response.json({
        message: "OAuth flow complete!",
        params: Object.fromEntries(url.searchParams.entries()),
      });
    }

    // The real OpenAuth server code starts here:
    return issuer({
      storage: CloudflareStorage({
        namespace: env.AUTH_STORAGE,
      }),
      subjects,
      providers: {
        password: PasswordProvider(
          PasswordUI({
            // eslint-disable-next-line @typescript-eslint/require-await
            sendCode: async (email, code) => {
              // This is where you would email the verification code to the
              // user, e.g. using Resend:
              // https://resend.com/docs/send-with-cloudflare-workers
              console.log(`Sending code ${code} to ${email}`);
            },
            copy: {
              input_code: "Code (check Worker logs)",
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
        
        return ctx.subject("user", {
          id: userId,
          email: value.email,
          subscription: subscription,
        });
      },
    }).fetch(request, env, ctx);
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
