# 🔒 Configuração do Tailscale Mesh e ACLs de Segurança

Este guia explica como provisionar o nó Gateway e conectar com segurança múltiplos computadores de desenvolvimento à sua rede privada (**Tailnet**).

---

## 1. Gerando uma Auth Key Efêmera e com Tag

No console administrativo do Tailscale ([Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys)):

1. Clique em **Generate auth key**.
2. Marque as opções:
   - **Reusable:** Permite reutilizar a chave em múltiplos containers.
   - **Ephemeral:** O nó é removido automaticamente da Tailnet quando o container for destruído.
   - **Tags:** Atribua a tag `tag:serverless-proxy`.
3. Copie a chave gerada (`tskey-auth-xxxxx`) para o seu arquivo `.env`.

---

## 2. Configurando as Regras de Controle de Acesso (ACLs)

No painel **Access Controls** do Tailscale, adicione a seguinte política para permitir que o Gateway acesse apenas as portas autorizadas de desenvolvimento:

```json
{
  "tagOwners": {
    "tag:serverless-proxy": ["autogroup:admin"],
    "tag:dev-workstation": ["autogroup:admin"]
  },
  "acls": [
    // Permite que o Gateway acesse os containers de desenvolvimento nas portas 8000, 8080, 3000, 5173 e 5050
    {
      "action": "accept",
      "src": ["tag:serverless-proxy"],
      "dst": [
        "tag:dev-workstation:8000",
        "tag:dev-workstation:8080",
        "tag:dev-workstation:3000",
        "tag:dev-workstation:5173",
        "tag:dev-workstation:5050"
      ]
    }
  ]
}
```

---

## 3. Conectando as Estações de Desenvolvimento

Em cada computador físico onde você roda seus containers Docker de desenvolvimento:

### No Windows / macOS / Linux:
```bash
# Autenticar com a tag de desenvolvedor
tailscale up --advertise-tags=tag:dev-workstation --accept-routes
```

### Verificando o IP Tailscale e MagicDNS da sua máquina:
```bash
tailscale ip -4
tailscale status
```

O IP retornado (ex: `100.64.0.10`) ou o hostname MagicDNS (ex: `dev-workstation-01.tailnet.ts.net`) deve ser referenciado no arquivo `nginx/conf.d/dev-mesh.conf`.
