# 📡 Guia de Rede e Diagnósticos (/network-101)

Este guia prático ensina como auditar, diagnosticar e inspecionar os serviços de rede HTTP, HTTPS, WebSockets e túneis da infraestrutura **Cloudflare &times; Tailscale &times; Nginx**.

---

## 1. Mapeamento de Portas e Protocolos

| Serviço | Porta Local | Protocolo de Rede | Finalidade |
|---|---|---|---|
| **Nginx HTTP Gateway** | `80` | TCP (HTTP/1.1 & HTTP/2) | Recebimento de tráfego do Worker e túnel |
| **Nginx HTTPS / SSL** | `443` | TCP (TLS 1.3) | Terminação SSL (opcional local) |
| **Backend API Core** | `8000` | TCP (HTTP REST) | Endpoints de API dos microserviços |
| **Auth Service** | `8080` | TCP (HTTP JSON) | Autenticação e tokens |
| **Next.js Web App** | `3000` | TCP (HTTP + WS) | Frontend SSR com Fast Refresh |
| **Vite Dev Server** | `5173` | TCP (HTTP + WSS) | Frontend SPA com Hot Module Reloading |
| **pgAdmin Database UI** | `5050` | TCP (HTTP Web UI) | Painel de administração PostgreSQL |
| **Tailscale WireGuard** | `41641` | UDP | Túnel criptografado direto entre nós |

---

## 2. Comandos de Verificação e Testes de Conectividade

### 2.1 Verificando Respostas HTTP e Headers de Borda (/network-101)
```bash
# Testar endpoint estático WWW da Cloudflare
curl -Iv https://seu-proxy.workers.dev/

# Inspecionar cabeçalhos de segurança e Cloudflare Ray ID
curl -I https://seu-proxy.workers.dev/api/v1/health

# Testar o endpoint de saúde do Gateway Nginx
curl -s https://seu-proxy.workers.dev/healthz | jq .
```

### 2.2 Testando Conectividade da Tailnet
```bash
# Listar nós conectados e verificar latência
tailscale ping 100.64.0.10

# Testar resolução MagicDNS
nslookup dev-workstation-01.tailnet.ts.net 100.100.100.100

# Testar porta TCP específica no nó de dev
nc -zv 100.64.0.10 8000
```

---

## 3. Análise de Logs do Nginx para Depuração

Os logs do Nginx foram estruturados com métricas de tempo de upstream para identificar gargalos em containers locais lentos:

```bash
# Acompanhar logs de acesso em tempo real
docker logs -f devmesh-nginx-proxy

# Filtrar requisições que retornaram erro (HTTP 5xx ou 4xx)
docker logs devmesh-nginx-proxy 2>&1 | grep -E ' " 5[0-9]{2} | " 4[0-9]{2} '

# Analisar tempos de resposta de upstream (urt)
docker logs devmesh-nginx-proxy 2>&1 | grep "urt="
```

---

## 4. Resolução de Problemas Comuns (Troubleshooting)

| Sintoma | Causa Provável | Solução |
|---|---|---|
| `502 Bad Gateway` no Worker | Nó Gateway ou Nginx offline na Tailnet | Verifique `docker ps` e status do Tailscale no servidor gateway (`tailscale status`). |
| `504 Gateway Timeout` | Container de dev travado ou escutando apenas em `127.0.0.1` | Certifique-se de que o container escuta em `0.0.0.0` (todas as interfaces) e não apenas em `localhost`. |
| WebSocket quebra no Vite / Next.js | Cabeçalhos `Upgrade` e `Connection` ausentes | O Nginx e o Cloudflare Worker já estão configurados para repassar o upgrade de WebSocket. Verifique se o Vite está configurado com `hmr: { clientPort: 443 }`. |
