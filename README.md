# 🌐 Cloudflare Serverless + Tailscale Mesh Proxy & Nginx Dev Bridge

Um sistema de proxy reverso e gateway híbrido que conecta a borda da **Cloudflare (Serverless Functions + Static Hosting)** à rede privada **Tailscale (Mesh VPN com WireGuard)** e ao **Nginx**, permitindo acesso público seguro aos containers de desenvolvimento rodando em diferentes computadores físicos e homelabs.

---

## 🚀 Arquitetura do Sistema

```
[ Usuários & Navegadores Externos ]
                │
                ▼ (HTTPS Edge / CDN)
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare Serverless & Edge Hosting                        │
│  ├── Servidor Estático WWW (Dashboard, Status, Docs)         │
│  └── Cloudflare Worker (Proxy Reverso Serverless & Gateway)  │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼ (Túnel Criptografado WireGuard)
┌──────────────────────────────────────────────────────────────┐
│  Rede Mesh Tailscale (Tailnet + MagicDNS: 100.x.y.z)         │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Nginx Reverse Proxy & Traffic Director                      │
│  ├── Mapeamento Dinâmico de Portas e Upstreams               │
│  ├── Suporte a WebSockets / Live Reloading (Vite/Next.js)    │
│  └── Logging Avançado e Diagnósticos de Rede (/network-101)  │
└──────────────┬───────────────────┬───────────────────────────┘
               ▼                   ▼                           ▼
     [ Dev Workstation 01 ]  [ Dev Laptop 02 ]      [ Homelab Server 03 ]
      - Backend API (:8000)   - Frontend App (:3000) - pgAdmin (:5050)
      - Auth Service (:8080)  - Vite HMR (:5173)     - Swagger Docs (:8081)
```

---

## 📂 Estrutura do Repositório

```bash
cloudflare-tailscale-proxy/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD: Lint, teste de sintaxe Nginx e deploy na Cloudflare
├── cloudflare/
│   ├── src/
│   │   └── index.ts            # Cloudflare Worker (Proxy Serverless + Health Check)
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml           # Configuração de deploy e assets estáticos
├── docker/
│   └── docker-compose.yml      # Stack do Gateway (Nginx + Nó Tailscale)
├── nginx/
│   ├── conf.d/
│   │   └── dev-mesh.conf       # Roteamento dos computadores e containers
│   ├── Dockerfile              # Imagem Alpine otimizada com health check
│   └── nginx.conf              # Configuração global com logs estruturados
├── www/
│   ├── app.js                  # Lógica interativa e health check no frontend
│   ├── index.html              # Servidor estático WWW (Portal e Dashboard)
│   └── style.css               # Estilos modernos em Dark Mode
├── .env.example                # Template de variáveis de ambiente
├── DEPLOY.md                   # Guia passo a passo de implantação no GitHub e Cloudflare
├── NETWORK_GUIDE.md            # Boas práticas e diagnósticos de rede (/network-101)
├── TAILSCALE_SETUP.md          # Configuração de chaves e ACLs na Tailnet
└── README.md
```

---

## ⚡ Início Rápido Local

### 1. Clonar e Configurar Variáveis
```bash
cp .env.example .env
# Edite o .env com sua TAILSCALE_AUTHKEY e credenciais da Cloudflare
```

### 2. Subir o Gateway Local (Tailscale + Nginx)
```bash
cd docker
docker compose up -d
```

### 3. Testar o Worker Cloudflare Localmente
```bash
cd ../cloudflare
npm install
npm run dev
```

Abra o navegador em `http://localhost:8787` para visualizar o portal estático e testar as rotas de proxy.

---

## 🛡️ Segurança & Recursos

- **Zero Port-Forwarding:** Nenhuma porta do roteador doméstico precisa ser aberta. O Tailscale cria conexões de saída diretas e seguras (NAT traversal).
- **Terminação SSL na Borda:** A Cloudflare gerencia automaticamente os certificados SSL/TLS modernos.
- **Suporte Total a WebSockets:** Hot Module Reloading (HMR) transparente para Vite, Next.js, Webpack e React.
- **Healthcheck e Telemetria Integrados:** Endpoint `/healthz` fornecendo estado em tempo real dos nós e latências de upstream.
- **Deploy Contínuo no GitHub Actions:** Ao enviar commits para `main`, a validação é executada e o deploy no Cloudflare ocorre automaticamente.
