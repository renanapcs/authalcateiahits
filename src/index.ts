import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string, union, number, boolean, optional, literal } from "valibot";

// Schema para validação de dados
const subjects = createSubjects({
  user: object({
    id: string(),
    email: string(),
    name: optional(string()),
    email_verified: optional(object({
      verified: boolean(),
      verification_code: optional(string()),
      verification_expires_at: optional(string()),
    })),
    subscription: optional(object({
      id: string(),
      plan_type: union([literal('start'), literal('plus'), literal('premium')]),
      status: union([literal('active'), literal('cancelled'), literal('expired'), literal('pending')]),
      features: object({
        music_limit: number(),
        producer_sessions: number(),
        domain_registration: number(),
      }),
    })),
  }),
});

// Função para criar instância do OpenAuth
function createAuth(env: Env) {
  return issuer({
    subjects,
    storage: new CloudflareStorage({
      kv: env.AUTH_STORAGE,
    }),
    providers: [
      new PasswordProvider({
        ui: new PasswordUI({
          title: "Alcatéia Hits",
          description: "Entre na sua conta para acessar recursos exclusivos",
          logo: "https://alcateiahits.org/src/img/loboalpha80px.png",
        }),
      }),
    ],
  });
}

// Interfaces para tipos TypeScript
interface Env {
  AUTH_DB: D1Database;
  AUTH_STORAGE: KVNamespace;
  FRONTEND_DOMAIN: string;
  AUTH_DOMAIN: string;
  ALLOWED_ORIGINS: string;
  MERCADOPAGO_ACCESS_TOKEN: string;
  MERCADOPAGO_PUBLIC_KEY: string;
}

// Função para configurar CORS
function setCorsHeaders(response: Response, origin: string | null, env: Env): Response {
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || [
    'https://alcateiahits.org',
    'https://www.alcateiahits.org',
    'http://localhost:80',
    'http://localhost:3000'
  ];
  
  let allowedOrigin = env.FRONTEND_DOMAIN || 'https://alcateiahits.org';
  if (origin && allowedOrigins.includes(origin)) {
    allowedOrigin = origin;
  }
  
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Função para criar assinatura
async function createSubscription(env: Env, userId: string, planType: string, mercadopagoId?: string) {
  const subscriptionId = crypto.randomUUID();
  
  // Criar assinatura
  await env.AUTH_DB.prepare(`
    INSERT INTO subscriptions (id, user_id, plan_type, status, mercadopago_subscription_id, expires_at)
    VALUES (?, ?, ?, 'pending', ?, datetime('now', '+1 month'))
  `).bind(subscriptionId, userId, planType, mercadopagoId).run();
  
  // Criar features da assinatura
  const features = {
    start: { music_limit: 1, producer_sessions: 0, domain_registration: 0 },
    plus: { music_limit: 2, producer_sessions: 1, domain_registration: 0 },
    premium: { music_limit: 4, producer_sessions: 4, domain_registration: 1 }
  };
  
  const planFeatures = features[planType as keyof typeof features];
  
  for (const [featureType, value] of Object.entries(planFeatures)) {
    await env.AUTH_DB.prepare(`
      INSERT INTO subscription_features (subscription_id, feature_type, feature_value, used_value)
      VALUES (?, ?, ?, 0)
    `).bind(subscriptionId, featureType, value).run();
  }
  
  return subscriptionId;
}

// Função para obter assinatura do usuário
async function getUserSubscription(env: Env, userId: string) {
  const subscription = await env.AUTH_DB.prepare(`
    SELECT s.*, 
           sf.feature_type, sf.feature_value, sf.used_value
    FROM subscriptions s
    LEFT JOIN subscription_features sf ON s.id = sf.subscription_id
    WHERE s.user_id = ? AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1
  `).bind(userId).all();
  
  if (!subscription.results.length) return null;
  
  const sub = subscription.results[0] as any;
  const features = subscription.results.reduce((acc: any, row: any) => {
    acc[row.feature_type] = {
      limit: row.feature_value,
      used: row.used_value
    };
    return acc;
  }, {});
  
  return {
    id: sub.id,
    plan_type: sub.plan_type,
    status: sub.status,
    features,
    expires_at: sub.expires_at
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return setCorsHeaders(new Response(null, { status: 200 }), origin, env);
    }
    
    try {
      // Rotas da API
      if (url.pathname.startsWith('/api/')) {
        const path = url.pathname.replace('/api/', '');
        
        // Webhook do MercadoPago
        if (path === 'webhooks/mercadopago') {
          if (request.method !== 'POST') {
            return setCorsHeaders(new Response('Method not allowed', { status: 405 }), origin, env);
          }
          
          const webhookData = await request.json();
          
          // Processar webhook do MercadoPago
          if (webhookData.type === 'subscription.payment_approved') {
            const subscriptionId = webhookData.data.id;
            
            // Atualizar status da assinatura
            await env.AUTH_DB.prepare(`
              UPDATE subscriptions 
              SET status = 'active', updated_at = CURRENT_TIMESTAMP
              WHERE mercadopago_subscription_id = ?
            `).bind(subscriptionId).run();
          }
          
          return setCorsHeaders(new Response('OK', { status: 200 }), origin, env);
        }
        
        // Criar assinatura
        if (path === 'subscriptions' && request.method === 'POST') {
          const { userId, planType } = await request.json();
          
          if (!userId || !planType) {
            return setCorsHeaders(new Response('Missing required fields', { status: 400 }), origin, env);
          }
          
          const subscriptionId = await createSubscription(env, userId, planType);
          
          return setCorsHeaders(new Response(JSON.stringify({ 
            subscriptionId,
            message: 'Subscription created successfully' 
          }), {
            headers: { 'Content-Type': 'application/json' }
          }), origin, env);
        }
        
        // Obter assinatura do usuário
        if (path.startsWith('subscriptions/') && request.method === 'GET') {
          const userId = path.split('/')[1];
          const subscription = await getUserSubscription(env, userId);
          
          return setCorsHeaders(new Response(JSON.stringify(subscription), {
            headers: { 'Content-Type': 'application/json' }
          }), origin, env);
        }
        
        // Agendar sessão com produtor
        if (path === 'producer-sessions' && request.method === 'POST') {
          const { subscriptionId, producerName, sessionDate, notes } = await request.json();
          
          const sessionId = crypto.randomUUID();
          
          await env.AUTH_DB.prepare(`
            INSERT INTO producer_sessions (id, subscription_id, producer_name, session_date, notes)
            VALUES (?, ?, ?, ?, ?)
          `).bind(sessionId, subscriptionId, producerName, sessionDate, notes).run();
          
          return setCorsHeaders(new Response(JSON.stringify({ 
            sessionId,
            message: 'Session scheduled successfully' 
          }), {
            headers: { 'Content-Type': 'application/json' }
          }), origin, env);
        }
        
        // Listar sessões do usuário
        if (path.startsWith('producer-sessions/') && request.method === 'GET') {
          const subscriptionId = path.split('/')[1];
          
          const sessions = await env.AUTH_DB.prepare(`
            SELECT * FROM producer_sessions 
            WHERE subscription_id = ? 
            ORDER BY session_date DESC
          `).bind(subscriptionId).all();
          
          return setCorsHeaders(new Response(JSON.stringify(sessions.results), {
            headers: { 'Content-Type': 'application/json' }
          }), origin, env);
        }
        
        // Registrar acesso a conteúdo
        if (path === 'content/access' && request.method === 'POST') {
          const { userId, contentType, contentId } = await request.json();
          
          const accessId = crypto.randomUUID();
          
          await env.AUTH_DB.prepare(`
            INSERT INTO content_access (id, user_id, content_type, content_id)
            VALUES (?, ?, ?, ?)
          `).bind(accessId, userId, contentType, contentId).run();
          
          return setCorsHeaders(new Response(JSON.stringify({ 
            accessId,
            message: 'Content access recorded' 
          }), {
            headers: { 'Content-Type': 'application/json' }
          }), origin, env);
        }
        
        return setCorsHeaders(new Response('Not found', { status: 404 }), origin, env);
      }
      
      // Rotas do OpenAuth
      const auth = createAuth(env);
      const response = await auth.fetch(request, env, ctx);
      return setCorsHeaders(response, origin, env);
      
    } catch (error) {
      console.error('Error:', error);
      return setCorsHeaders(new Response('Internal server error', { status: 500 }), origin, env);
    }
  },
};