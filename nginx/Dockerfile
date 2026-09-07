FROM nginx:1.27-alpine

# Remover configurações default
RUN rm /etc/nginx/conf.d/default.conf

# Copiar arquivos de configuração customizados
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/

# Página de erro customizada
RUN echo '{"error":"Node Unavailable","message":"O container de destino na Tailnet está offline ou inacessível."}' > /usr/share/nginx/html/50x.html

EXPOSE 80 443

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
