# 🚀 Guia de Implantação e Deploy Contínuo (GitHub & Cloudflare)

Este documento detalha o procedimento para criar o novo repositório no **GitHub**, configurar os secrets de CI/CD e implantar a infraestrutura na **Cloudflare**.

---

## 1. Criando o Novo Repositório no GitHub

Execute no terminal dentro da pasta do projeto:

```bash
cd c:\Users\dell\cloudflare-tailscale-proxy

# Inicializar Git
git init -b main

# Adicionar todos os arquivos
git add .
git commit -m "feat: initial release of cloudflare tailscale proxy devmesh"

# Criar e vincular ao novo repositório remoto via GitHub CLI (gh)
gh repo create cloudflare-tailscale-devmesh --public --source=. --push
```

*(Ou crie manualmente em `https://github.com/new` e adicione o remote com `git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git`)*

---

## 2. Configurando Secrets no GitHub Actions

Acesse seu repositório no GitHub: **Settings &rarr; Secrets and variables &rarr; Actions &rarr; New repository secret**

Adicione os seguintes segredos:

| Nome do Secret | Descrição | Onde Obter |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Token de API com permissão para criar e editar Workers | [Cloudflare Dashboard &rarr; API Tokens](https://dash.cloudflare.com/profile/api-tokens) (Template *Edit Cloudflare Workers*) |
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare | Na URL do painel ou na barra lateral da página inicial do Cloudflare |
| `TAILSCALE_AUTHKEY` *(Opcional para runners)* | Chave de autorização de nós na Tailnet | [Tailscale Admin &rarr; Keys](https://login.tailscale.com/admin/settings/keys) |

---

## 3. Disparando o Deploy Automatizado

Assim que os secrets forem adicionados, qualquer commit enviado para a branch `main` disparará o workflow `.github/workflows/deploy.yml`:

```bash
git push origin main
```

O GitHub Actions executará:
1. Validação de tipagem e integridade do Worker TypeScript.
2. Teste de sintaxe da configuração Nginx via Docker (`nginx -t`).
3. Deploy da aplicação estática WWW e das rotas serverless na Cloudflare via **Wrangler**.

---

## 4. Deploy Manual via Wrangler CLI (Opcional)

Se preferir fazer deploy direto da sua máquina local:

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler deploy
```
