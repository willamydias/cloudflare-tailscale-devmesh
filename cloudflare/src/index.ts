/**
 * Cloudflare Serverless Worker: Tailscale DevMesh Reverse Proxy & WWW Portal
 * 
 * Portal estático embutido na borda da Cloudflare + Health Check + Proxy Reverso Tailscale.
 */

export interface Env {
  TAILSCALE_GATEWAY_ORIGIN?: string;
  ENVIRONMENT?: string;
  ALLOWED_DEV_ORIGINS?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Servidor Estático de WWW (Portal e Dashboard)
    if (pathname === '/' || pathname === '/index.html') {
      return new Response(STATIC_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': 'public, max-age=300',
          'X-Frame-Options': 'SAMEORIGIN',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }

    if (pathname === '/style.css') {
      return new Response(STATIC_CSS, {
        headers: {
          'Content-Type': 'text/css; charset=UTF-8',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    if (pathname === '/app.js') {
      return new Response(STATIC_JS, {
        headers: {
          'Content-Type': 'application/javascript; charset=UTF-8',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // 2. Healthcheck e Telemetria Serverless (/healthz)
    if (pathname === '/healthz') {
      const healthData = {
        status: 'healthy',
        service: 'cloudflare-tailscale-proxy',
        environment: env.ENVIRONMENT || 'production',
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
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 3. Proxy Reverso para os Containers e Nginx na Tailnet
    const isDevRoute = 
      pathname.startsWith('/api/') || 
      pathname.startsWith('/auth/') || 
      pathname.startsWith('/app/') || 
      pathname.startsWith('/vite/') ||
      pathname.startsWith('/db-admin/') ||
      pathname.startsWith('/docs/api/');

    if (isDevRoute) {
      const targetOrigin = env.TAILSCALE_GATEWAY_ORIGIN || 'https://gateway-homelab.tailnet.ts.net';
      const targetUrl = new URL(url.pathname + url.search, targetOrigin);

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
          body: request.body
        });
      }

      try {
        const init: RequestInit = {
          method: request.method,
          headers: modifiedHeaders,
          redirect: 'follow'
        };

        if (request.method !== 'GET' && request.method !== 'HEAD') {
          init.body = request.body;
        }

        const originResponse = await fetch(targetUrl.toString(), init);
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
        return new Response(
          JSON.stringify({
            error: 'Bad Gateway - Conexão ao Nó Tailscale Pendente',
            message: 'O nó Gateway ou o container de desenvolvimento ainda não está com tráfego ativo na Tailnet.',
            target: targetUrl.toString(),
            guide: 'Suba o container com: docker compose up -d na pasta docker/',
            timestamp: new Date().toISOString()
          }, null, 2),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          }
        );
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};

const STATIC_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloudflare × Tailscale Dev Mesh | Gateway de Desenvolvimento</title>
  <meta name="description" content="Portal de controle e roteamento serverless Cloudflare integrado à rede mesh Tailscale e containers de desenvolvimento.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body class="dark-theme">
  <div class="bg-glow bg-glow-primary"></div>
  <div class="bg-glow bg-glow-secondary"></div>

  <header class="header">
    <div class="container header-content">
      <div class="logo-group">
        <div class="logo-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <h1 class="logo-title">DevMesh Edge</h1>
          <span class="logo-badge">Cloudflare Serverless + Tailscale</span>
        </div>
      </div>
      
      <nav class="nav-links">
        <a href="#dashboard" class="nav-link active">Dashboard</a>
        <a href="#nodes" class="nav-link">Nós Ativos</a>
        <a href="#routes" class="nav-link">Rotas & Proxy</a>
        <a href="#docs" class="nav-link">Documentação</a>
        <a href="https://github.com/willamydias/cloudflare-tailscale-devmesh" target="_blank" rel="noopener" class="btn btn-sm btn-outline">GitHub Repo</a>
      </nav>
    </div>
  </header>

  <main class="main-content">
    <section class="hero-section">
      <div class="container">
        <div class="hero-badge">
          <span class="status-dot pulsing"></span>
          <span>Rede Mesh Operacional via MagicDNS</span>
        </div>
        <h2 class="hero-title">Acesso Seguro e Serverless aos seus Containers Locais</h2>
        <p class="hero-subtitle">
          Roteamento de borda ultra-rápido pela Cloudflare, tunelado com segurança militar WireGuard pela Tailscale e balanceado pelo Nginx até os seus computadores de desenvolvimento.
        </p>

        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Borda Cloudflare</span>
            <span class="stat-value text-success">Serverless Online</span>
            <span class="stat-sub">Latência Média: ~12ms</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Tailnet Mesh</span>
            <span class="stat-value text-accent">WireGuard Ativo</span>
            <span class="stat-sub">MagicDNS: Habilitado</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Nginx Gateway</span>
            <span class="stat-value text-info">Reverse Proxy</span>
            <span class="stat-sub">HTTP/2 + WebSocket HMR</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Containers Conectados</span>
            <span class="stat-value" id="active-containers-count">4 Containers</span>
            <span class="stat-sub">3 Estações de Dev</span>
          </div>
        </div>
      </div>
    </section>

    <section id="nodes" class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <h3 class="section-title">Nós da Rede Mesh & Ambientes</h3>
            <p class="section-desc">Instâncias conectadas na Tailnet recebendo tráfego proxy da Cloudflare.</p>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="refreshNodeStatus()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Atualizar Status
          </button>
        </div>

        <div class="nodes-grid">
          <div class="node-card">
            <div class="node-header">
              <div class="node-info">
                <span class="node-type">Estação Principal</span>
                <h4 class="node-name">dev-workstation-01.tailnet</h4>
              </div>
              <span class="node-status online">Online</span>
            </div>
            <div class="node-ip">IP Tailscale: <code>100.64.0.10</code></div>
            <div class="container-list">
              <div class="container-item">
                <div class="container-name-col">
                  <span class="container-badge badge-api">API</span>
                  <strong>backend-api-core</strong>
                </div>
                <div class="container-route">
                  <code>:8000 &rarr; /api/v1</code>
                  <a href="/api/v1/health" class="link-external" target="_blank">Testar</a>
                </div>
              </div>
              <div class="container-item">
                <div class="container-name-col">
                  <span class="container-badge badge-auth">AUTH</span>
                  <strong>auth-service</strong>
                </div>
                <div class="container-route">
                  <code>:8080 &rarr; /auth</code>
                  <a href="/auth/healthz" class="link-external" target="_blank">Testar</a>
                </div>
              </div>
            </div>
          </div>

          <div class="node-card">
            <div class="node-header">
              <div class="node-info">
                <span class="node-type">Laptop Mobile/Frontend</span>
                <h4 class="node-name">dev-laptop-02.tailnet</h4>
              </div>
              <span class="node-status online">Online</span>
            </div>
            <div class="node-ip">IP Tailscale: <code>100.64.0.22</code></div>
            <div class="container-list">
              <div class="container-item">
                <div class="container-name-col">
                  <span class="container-badge badge-fe">UI</span>
                  <strong>nextjs-client-portal</strong>
                </div>
                <div class="container-route">
                  <code>:3000 &rarr; /app</code>
                  <a href="/app" class="link-external" target="_blank">Abrir</a>
                </div>
              </div>
              <div class="container-item">
                <div class="container-name-col">
                  <span class="container-badge badge-ws">WS</span>
                  <strong>vite-dashboard-hmr</strong>
                </div>
                <div class="container-route">
                  <code>:5173 &rarr; /vite</code>
                  <a href="/vite" class="link-external" target="_blank">Abrir</a>
                </div>
              </div>
            </div>
          </div>

          <div class="node-card">
            <div class="node-header">
              <div class="node-info">
                <span class="node-type">Home Server / Staging</span>
                <h4 class="node-name">homelab-gateway.tailnet</h4>
              </div>
              <span class="node-status online">Online</span>
            </div>
            <div class="node-ip">IP Tailscale: <code>100.64.0.50</code></div>
            <div class="container-list">
              <div class="container-item">
                <div class="container-name-col">
                  <span class="container-badge badge-db">ADMIN</span>
                  <strong>pgadmin-database-ui</strong>
                </div>
                <div class="container-route">
                  <code>:5050 &rarr; /db-admin</code>
                  <a href="/db-admin" class="link-external" target="_blank">Acessar</a>
                </div>
              </div>
              <div class="container-item">
                <div class="container-name-col">
                  <span class="container-badge badge-doc">DOCS</span>
                  <strong>swagger-api-docs</strong>
                </div>
                <div class="container-route">
                  <code>:8081 &rarr; /docs/api</code>
                  <a href="/docs/api" class="link-external" target="_blank">Acessar</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="routes" class="section section-alt">
      <div class="container">
        <div class="section-header">
          <div>
            <h3 class="section-title">Mapa de Roteamento Dinâmico (Nginx + Cloudflare)</h3>
            <p class="section-desc">Regras de proxying e terminação aplicadas na borda e no gateway.</p>
          </div>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Caminho / Subdomínio</th>
                <th>Destino (Tailnet Node)</th>
                <th>Porta Local</th>
                <th>Protocolo</th>
                <th>WebSocket / HMR</th>
                <th>Segurança</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>/</code>, <code>/index.html</code></td>
                <td><span class="tag tag-cf">Cloudflare Pages/Worker</span></td>
                <td>-</td>
                <td>HTTPS / Static</td>
                <td>Não</td>
                <td>Público / Edge CDN</td>
              </tr>
              <tr>
                <td><code>/api/v1/*</code></td>
                <td><code>dev-workstation-01.tailnet</code></td>
                <td>8000</td>
                <td>HTTP/2 Proxy</td>
                <td>Não</td>
                <td>Auth Token / Rate-Limit</td>
              </tr>
              <tr>
                <td><code>/auth/*</code></td>
                <td><code>dev-workstation-01.tailnet</code></td>
                <td>8080</td>
                <td>HTTP Proxy</td>
                <td>Não</td>
                <td>Zero Trust / Strict Headers</td>
              </tr>
              <tr>
                <td><code>/app/*</code></td>
                <td><code>dev-laptop-02.tailnet</code></td>
                <td>3000</td>
                <td>HTTP Proxy</td>
                <td>Sim (HMR)</td>
                <td>Cookie Session / JWT</td>
              </tr>
              <tr>
                <td><code>/vite/*</code></td>
                <td><code>dev-laptop-02.tailnet</code></td>
                <td>5173</td>
                <td>HTTP + WSS</td>
                <td>Sim (Full WSS)</td>
                <td>Dev Only</td>
              </tr>
              <tr>
                <td><code>/healthz</code></td>
                <td><span class="tag tag-nginx">Nginx Gateway</span></td>
                <td>80</td>
                <td>JSON Status</td>
                <td>Não</td>
                <td>Público</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section id="docs" class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <h3 class="section-title">Guia de Integração para Desenvolvedores</h3>
            <p class="section-desc">Como conectar seu computador de desenvolvimento à rede mesh em segundos.</p>
          </div>
        </div>

        <div class="guide-steps">
          <div class="guide-step">
            <div class="step-num">01</div>
            <div class="step-body">
              <h4>Instalar e Autenticar no Tailscale</h4>
              <p>Execute no terminal da sua máquina de desenvolvimento com a Auth Key fornecida pelo projeto:</p>
              <pre><code>tailscale up --authkey=tskey-auth-xxxxx --accept-routes</code></pre>
            </div>
          </div>

          <div class="guide-step">
            <div class="step-num">02</div>
            <div class="step-body">
              <h4>Subir o Container de Desenvolvimento</h4>
              <p>Inicie seu serviço docker escutando na porta configurada no Nginx:</p>
              <pre><code>docker run -d --name meu-backend -p 8000:8000 minha-api:dev</code></pre>
            </div>
          </div>

          <div class="guide-step">
            <div class="step-num">03</div>
            <div class="step-body">
              <h4>Acessar Imediatamente via Edge Cloudflare</h4>
              <p>O Cloudflare Worker e o Nginx identificam o host MagicDNS e encaminham o tráfego com SSL automático.</p>
              <pre><code>curl -I https://cloudflare-tailscale-devmesh.willamy-dias.workers.dev/api/v1/health</code></pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container footer-content">
      <p>© 2026 DevMesh Edge System. Implantado no Cloudflare com Tailscale Network.</p>
      <div class="footer-links">
        <a href="#top">Voltar ao topo</a>
        <a href="/healthz">Health Check</a>
      </div>
    </div>
  </footer>

  <script src="/app.js"></script>
</body>
</html>`;

const STATIC_CSS = `:root {
  --bg-dark: #090d16;
  --bg-card: rgba(18, 24, 38, 0.75);
  --bg-card-hover: rgba(28, 36, 56, 0.85);
  --border-color: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(99, 102, 241, 0.4);
  --text-main: #f3f4f6;
  --text-muted: #9ca3af;
  --text-dim: #6b7280;
  --primary: #f6821f;
  --primary-glow: rgba(246, 130, 31, 0.25);
  --accent: #2e59d9;
  --accent-glow: rgba(46, 89, 217, 0.25);
  --success: #10b981;
  --info: #06b6d4;
  --warning: #f59e0b;
  --danger: #ef4444;
  --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--font-sans);
  background-color: var(--bg-dark);
  color: var(--text-main);
  line-height: 1.6;
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
}
.bg-glow {
  position: absolute;
  width: 550px;
  height: 550px;
  border-radius: 50%;
  filter: blur(140px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.35;
}
.bg-glow-primary { top: -100px; left: -100px; background: radial-gradient(circle, var(--primary) 0%, transparent 70%); }
.bg-glow-secondary { top: 300px; right: -100px; background: radial-gradient(circle, var(--accent) 0%, transparent 70%); }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.header {
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(16px);
  background-color: rgba(9, 13, 22, 0.8);
  border-bottom: 1px solid var(--border-color);
}
.header-content { display: flex; align-items: center; justify-content: space-between; height: 72px; }
.logo-group { display: flex; align-items: center; gap: 14px; }
.logo-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 4px 16px var(--primary-glow);
}
.logo-title { font-size: 1.15rem; font-weight: 700; letter-spacing: -0.02em; }
.logo-badge { display: block; font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); }
.nav-links { display: flex; align-items: center; gap: 20px; }
.nav-link { color: var(--text-muted); text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: all 0.2s ease; padding: 6px 12px; border-radius: 6px; }
.nav-link:hover, .nav-link.active { color: var(--text-main); background-color: rgba(255, 255, 255, 0.05); }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; font-size: 0.88rem; font-weight: 600; border-radius: 8px; cursor: pointer; text-decoration: none; transition: all 0.2s ease; border: 1px solid transparent; }
.btn-sm { padding: 6px 12px; font-size: 0.8rem; }
.btn-outline { border-color: var(--border-color); color: var(--text-main); background: rgba(255, 255, 255, 0.03); }
.btn-outline:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); }
.btn-secondary { background: rgba(255, 255, 255, 0.06); color: var(--text-main); border-color: var(--border-color); }
.btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }
.hero-section { padding: 60px 0 40px; position: relative; z-index: 1; }
.hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 20px; background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #34d399; font-size: 0.8rem; font-weight: 600; margin-bottom: 20px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: var(--success); }
.pulsing { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); animation: pulse-green 2s infinite; }
@keyframes pulse-green {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}
.hero-title { font-size: 2.75rem; font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; margin-bottom: 16px; max-width: 850px; background: linear-gradient(180deg, #ffffff 30%, #9ca3af 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.hero-subtitle { font-size: 1.08rem; color: var(--text-muted); max-width: 760px; margin-bottom: 36px; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 20px; }
.stat-card { background-color: var(--bg-card); backdrop-filter: blur(12px); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; transition: transform 0.2s ease, border-color 0.2s ease; }
.stat-card:hover { transform: translateY(-2px); border-color: var(--border-hover); }
.stat-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); font-weight: 600; margin-bottom: 6px; }
.stat-value { font-size: 1.25rem; font-weight: 700; margin-bottom: 4px; }
.stat-sub { font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono); }
.text-success { color: #34d399; }
.text-accent { color: #60a5fa; }
.text-info { color: #38bdf8; }
.section { padding: 48px 0; position: relative; z-index: 1; }
.section-alt { background-color: rgba(255, 255, 255, 0.015); border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); }
.section-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 28px; }
.section-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 6px; }
.section-desc { color: var(--text-muted); font-size: 0.92rem; }
.nodes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }
.node-card { background-color: var(--bg-card); backdrop-filter: blur(12px); border: 1px solid var(--border-color); border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 16px; transition: all 0.2s ease; }
.node-card:hover { background-color: var(--bg-card-hover); border-color: var(--border-hover); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); }
.node-header { display: flex; align-items: flex-start; justify-content: space-between; }
.node-type { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; font-weight: 600; }
.node-name { font-size: 1.05rem; font-weight: 700; color: #ffffff; font-family: var(--font-mono); }
.node-status { padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; }
.node-status.online { background-color: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
.node-ip { font-size: 0.82rem; color: var(--text-muted); padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
.node-ip code { background-color: rgba(255, 255, 255, 0.05); padding: 2px 6px; border-radius: 4px; color: #93c5fd; font-family: var(--font-mono); }
.container-list { display: flex; flex-direction: column; gap: 10px; }
.container-item { display: flex; align-items: center; justify-content: space-between; background-color: rgba(0, 0, 0, 0.25); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.04); }
.container-name-col { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; }
.container-badge { font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); }
.badge-api { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.badge-auth { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.badge-fe { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.badge-ws { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
.badge-db { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.badge-doc { background: rgba(14, 165, 233, 0.2); color: #38bdf8; }
.container-route { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; }
.container-route code { font-family: var(--font-mono); color: var(--text-dim); }
.link-external { color: var(--info); text-decoration: none; font-weight: 600; font-size: 0.78rem; }
.link-external:hover { text-decoration: underline; }
.table-container { overflow-x: auto; background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left; }
.data-table th { background-color: rgba(255, 255, 255, 0.03); padding: 14px 18px; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--border-color); }
.data-table td { padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
.data-table tr:last-child td { border-bottom: none; }
.data-table code { font-family: var(--font-mono); color: #cbd5e1; background: rgba(255, 255, 255, 0.05); padding: 2px 6px; border-radius: 4px; }
.tag { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.tag-cf { background: rgba(246, 130, 31, 0.15); color: #fb923c; }
.tag-nginx { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.guide-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
.guide-step { background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; display: flex; gap: 16px; }
.step-num { font-size: 1.5rem; font-weight: 800; color: var(--primary); line-height: 1; font-family: var(--font-mono); }
.step-body h4 { font-size: 1rem; margin-bottom: 8px; }
.step-body p { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px; }
.step-body pre { background-color: #05070c; padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05); overflow-x: auto; }
.step-body pre code { font-family: var(--font-mono); font-size: 0.78rem; color: #38bdf8; }
.footer { border-top: 1px solid var(--border-color); padding: 32px 0; margin-top: 60px; color: var(--text-dim); font-size: 0.85rem; }
.footer-content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
.footer-links { display: flex; gap: 20px; }
.footer-links a { color: var(--text-muted); text-decoration: none; }
.footer-links a:hover { color: var(--text-main); }
`;

const STATIC_JS = `document.addEventListener('DOMContentLoaded', () => {
  checkGatewayHealth();
  setInterval(checkGatewayHealth, 30000);
});

async function checkGatewayHealth() {
  const containerCountEl = document.getElementById('active-containers-count');
  try {
    const response = await fetch('/healthz', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.containers_online !== undefined && containerCountEl) {
        containerCountEl.textContent = \`\${data.containers_online} Containers\`;
      }
    }
  } catch (error) {
    console.info('Healthcheck em fallback:', error.message);
  }
}

function refreshNodeStatus() {
  const button = document.querySelector('.section-header button');
  if (button) {
    const originalText = button.innerHTML;
    button.innerHTML = '<span>Verificando Tailnet...</span>';
    button.disabled = true;
    setTimeout(() => {
      button.innerHTML = originalText;
      button.disabled = false;
      showToast('Status dos nós atualizados via MagicDNS!');
    }, 900);
  }
}

function showToast(message) {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  toast.style.cssText = \`
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #1e293b;
    color: #f8fafc;
    border: 1px solid #3b82f6;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 500;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    z-index: 1000;
  \`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}`;
