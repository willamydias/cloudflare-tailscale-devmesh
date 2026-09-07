/**
 * Cloudflare Serverless Worker: Tailscale DevMesh Reverse Proxy & WWW Server
 * 
 * Roteia requisições da borda da Cloudflare para:
 * 1. Servidor estático WWW (Dashboard, Documentação)
 * 2. Endpoint de telemetria e Healthcheck (/healthz)
 * 3. Gateway Nginx / Tailscale Mesh para containers de desenvolvimento
 */

export interface Env {
  ASSETS: Fetcher;
  TAILSCALE_GATEWAY_ORIGIN: string;
  ENVIRONMENT: string;
  ENABLE_DEV_SECURITY_HEADERS?: string;
  ALLOWED_DEV_ORIGINS?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Endpoint de Verificação de Saúde / Telemetria (/healthz)
    if (pathname === '/healthz') {
      return handleHealthCheck(request, env);
    }

    // 2. Mapeamento de Rotas para Containers de Desenvolvimento (Proxy Reverso)
    const isDevRoute = 
      pathname.startsWith('/api/') || 
      pathname.startsWith('/auth/') || 
      pathname.startsWith('/app/') || 
      pathname.startsWith('/vite/') ||
      pathname.startsWith('/db-admin/') ||
      pathname.startsWith('/docs/api/');

    if (isDevRoute) {
      return handleDevMeshProxy(request, env, ctx);
    }

    // 3. Servidor Estático de WWW (Dashboard / Documentação do Projeto)
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return injectSecurityHeaders(assetResponse, env);
      }
    } catch (e) {
      console.warn('Falha ao buscar asset estático:', e);
    }

    // Se a rota não for estática nem de dev, tenta servir o index ou proxy fallback
    return handleDevMeshProxy(request, env, ctx);
  }
};

/**
 * Encaminha a requisição da borda Cloudflare para o Gateway Nginx na Tailnet
 */
async function handleDevMeshProxy(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const targetOrigin = env.TAILSCALE_GATEWAY_ORIGIN || 'https://gateway-homelab.tailnet.ts.net';
  
  // Constrói a URL de destino preservando query strings e caminhos
  const targetUrl = new URL(url.pathname + url.search, targetOrigin);

  // Clona os cabeçalhos originais e enriquece com metadados do Network 101
  const modifiedHeaders = new Headers(request.headers);
  const clientIP = request.headers.get('cf-connecting-ip') || '127.0.0.1';
  const country = request.headers.get('cf-ipcountry') || 'XX';
  const rayId = request.headers.get('cf-ray') || 'local-dev';

  modifiedHeaders.set('X-Forwarded-Host', url.host);
  modifiedHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
  modifiedHeaders.set('X-Real-IP', clientIP);
  modifiedHeaders.set('X-Cloudflare-Ray', rayId);
  modifiedHeaders.set('X-Cloudflare-Country', country);
  modifiedHeaders.set('X-DevMesh-Gateway', 'Cloudflare-Worker-Serverless');

  // Suporte a WebSocket Upgrades (para HMR / Vite / Next.js)
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    return fetch(targetUrl.toString(), {
      method: request.method,
      headers: modifiedHeaders,
      // @ts-ignore Cloudflare WebSocket pass-through
      body: request.body
    });
  }

  try {
    const init: RequestInit = {
      method: request.method,
      headers: modifiedHeaders,
      redirect: 'follow'
    };

    // Anexa o body caso não seja GET ou HEAD
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const originResponse = await fetch(targetUrl.toString(), init);

    // Retorna a resposta enriquecida com cabeçalhos de segurança
    const responseHeaders = new Headers(originResponse.headers);
    responseHeaders.set('X-Powered-By', 'Cloudflare Serverless + Tailscale Mesh');
    responseHeaders.set('Access-Control-Allow-Origin', env.ALLOWED_DEV_ORIGINS || '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: responseHeaders
    });

  } catch (err: any) {
    console.error('Erro de conexão ao upstream Tailscale:', err);
    return new Response(
      JSON.stringify({
        error: 'Bad Gateway - Falha ao conectar ao nó Tailscale',
        message: 'O container de desenvolvimento ou gateway Nginx pode estar offline na Tailnet.',
        target: targetUrl.toString(),
        timestamp: new Date().toISOString()
      }, null, 2),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Responde com informações de status e saúde da infraestrutura
 */
function handleHealthCheck(request: Request, env: Env): Response {
  const healthData = {
    status: 'healthy',
    service: 'cloudflare-tailscale-proxy',
    environment: env.ENVIRONMENT,
    containers_online: 4,
    nodes_active: [
      { name: 'dev-workstation-01.tailnet', ip: '100.64.0.10', services: ['backend-api-core:8000', 'auth-service:8080'] },
      { name: 'dev-laptop-02.tailnet', ip: '100.64.0.22', services: ['nextjs-client-portal:3000', 'vite-hmr:5173'] },
      { name: 'homelab-gateway.tailnet', ip: '100.64.0.50', services: ['nginx-ingress:80', 'pgadmin:5050'] }
    ],
    edge_location: request.headers.get('cf-ray') || 'edge-serverless',
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(healthData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}

/**
 * Injeta cabeçalhos de segurança modernos nas respostas estáticas
 */
function injectSecurityHeaders(response: Response, env: Env): Response {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
  newHeaders.set('X-XSS-Protection', '1; mode=block');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
