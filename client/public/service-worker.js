// Service Worker para PWA
// Gerencia cache de recursos e funcionalidades offline

// IMPORTANTE:
// - Evitar servir index.html antigo (isso “congela” o bundle antigo do Vite e causa bugs como payload undefined no login)
// - Manter cache seguro para assets, mas sempre buscar a navegação pela rede
// - Reduzir logs barulhentos no console

const CACHE_NAME = 'notifique-me-v2';
const RUNTIME_CACHE = 'notifique-me-runtime-v2';

// Se quiser debug do SW, altere para true.
const DEBUG = false;

// Recursos para cache na instalação
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/badge-72x72.png',
];

// Instalação do service worker
self.addEventListener('install', (event) => {
  if (DEBUG) console.log('[Service Worker] Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      if (DEBUG) console.log('[Service Worker] Fazendo cache de recursos');
      return cache.addAll(PRECACHE_URLS);
    })
  );
  
  // Ativar imediatamente
  self.skipWaiting();
});

// Ativação do service worker
self.addEventListener('activate', (event) => {
  if (DEBUG) console.log('[Service Worker] Ativando...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
          })
          .map((cacheName) => {
            if (DEBUG) console.log('[Service Worker] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  
  // Tomar controle imediatamente
  return self.clients.claim();
});

// Interceptar requisições
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ✅ Sempre buscar navegações pela rede para evitar index.html/bundle antigo.
  // (Isso resolve bugs "fantasma" causados por cache do SW em deploys)
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put('/index.html', responseClone);
          });
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || caches.match(request);
        })
    );
    return;
  }

  // ✅ Cache API não suporta métodos diferentes de GET
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // Ignorar requisições não-HTTP
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Estratégia: Network First para API, Cache First para recursos estáticos
  if (url.pathname.startsWith('/api/')) {
    // Network First para API
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clonar resposta para cache
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Retornar do cache se offline
          return caches.match(request);
        })
    );
  } else {
    // ✅ Stale-While-Revalidate para recursos estáticos
    // - Serve rápido do cache
    // - Atualiza em background para evitar ficar preso em versões antigas
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            // Não cachear respostas inválidas
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });

            return response;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});

// Sincronização em background
self.addEventListener('sync', (event) => {
  if (DEBUG) console.log('[Service Worker] Sincronização em background:', event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

// Função para sincronizar notificações
async function syncNotifications() {
  try {
    // Implementar lógica de sincronização
    if (DEBUG) console.log('[Service Worker] Sincronizando notificações...');
    
    // Buscar notificações pendentes do IndexedDB
    // Enviar para o servidor
    // Atualizar status local
    
    return Promise.resolve();
  } catch (error) {
    console.error('[Service Worker] Erro ao sincronizar:', error);
    return Promise.reject(error);
  }
}

// Listener para mensagens do cliente
self.addEventListener('message', (event) => {
  // Evita spam no console em produção.
  if (DEBUG) console.log('[Service Worker] Mensagem recebida:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(RUNTIME_CACHE).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Push notification listener
self.addEventListener('push', (event) => {
  if (DEBUG) console.log('[Service Worker] Push recebido:', event);
  
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Nova Notificação', body: event.data.text() };
    }
  }
  
  const title = data.title || 'Notifique-me';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192x192.png',
    badge: '/badge-72x72.png',
    image: data.image,
    data: data.data || {},
    tag: data.tag || 'default',
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: 'Abrir',
      },
      {
        action: 'close',
        title: 'Fechar',
      },
    ],
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click listener
self.addEventListener('notificationclick', (event) => {
  if (DEBUG) console.log('[Service Worker] Notificação clicada:', event);
  
  event.notification.close();
  
  const { action, notification } = event;
  const data = notification.data;
  
  if (action === 'close') {
    return;
  }
  
  const urlToOpen = data.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Procurar janela já aberta
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Abrir nova janela
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Notification close listener
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notificação fechada:', event);
});
