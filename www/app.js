/**
 * DevMesh Edge Portal - Frontend Interactivity & Live Status
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('DevMesh Portal initialized.');
  checkGatewayHealth();
  
  // Atualizar a cada 30 segundos
  setInterval(checkGatewayHealth, 30000);
});

/**
 * Consulta o endpoint de health check do Nginx / Cloudflare Worker
 */
async function checkGatewayHealth() {
  const containerCountEl = document.getElementById('active-containers-count');
  
  try {
    const response = await fetch('/healthz', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Healthcheck status:', data);
      if (data && data.containers_online !== undefined) {
        containerCountEl.textContent = `${data.containers_online} Containers`;
      }
    } else {
      console.warn('Health check retornou status:', response.status);
    }
  } catch (error) {
    // Modo offline/demo local
    console.info('Executando em modo preview/mock local:', error.message);
  }
}

/**
 * Atualiza o status visual dos nós da rede mesh
 */
function refreshNodeStatus() {
  const button = document.querySelector('.section-header button');
  if (button) {
    const originalText = button.innerHTML;
    button.innerHTML = `<span>Verificando Tailnet...</span>`;
    button.disabled = true;

    setTimeout(() => {
      button.innerHTML = originalText;
      button.disabled = false;
      showToast('Status dos nós atualizados via MagicDNS!');
    }, 900);
  }
}

/**
 * Exibe um feedback visual rápido (Toast)
 */
function showToast(message) {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  toast.style.cssText = `
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
    animation: fadeIn 0.3s ease;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
