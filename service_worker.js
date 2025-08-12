const CACHE_NAME = 'wavemart-vms-v1.0.0';
const STATIC_CACHE_NAME = 'wavemart-vms-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'wavemart-vms-dynamic-v1.0.0';

// Files to cache for offline functionality
const STATIC_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// Runtime caching patterns
const CACHE_STRATEGIES = {
  images: 'cache-first',
  documents: 'network-first',
  api: 'network-first'
};

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Install event');
  
  event.waitUntil(
    Promise.all([
      // Cache static files
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      }),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate event');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME && 
                cacheName !== CACHE_NAME) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          // Update cache in background for HTML files
          if (request.destination === 'document') {
            updateCacheInBackground(request);
          }
          return cachedResponse;
        }

        // Fetch from network
        return fetch(request).then((networkResponse) => {
          // Don't cache if not successful
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          // Cache successful responses
          const responseToCache = networkResponse.clone();
          
          caches.open(getDynamicCacheName(request)).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        }).catch(() => {
          // Return offline fallback for HTML requests
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
          
          // Return a basic offline response for other requests
          return new Response('Offline - Content not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
    );
  }
});

// Background sync for offline data
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'vendor-data-sync') {
    event.waitUntil(syncVendorData());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');
  
  const options = {
    body: event.data ? event.data.text() : 'New vendor system notification',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-96x96.png',
    vibrate: [200, 100, 200],
    data: {
      url: './',
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: './icons/icon-96x96.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: './icons/icon-96x96.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Wavemart VMS', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event);
  
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.matchAll().then((clientList) => {
        // Focus existing client if available
        for (const client of clientList) {
          if (client.url === self.location.origin && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window if no client found
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
    );
  }
});

// Message handling for communication with main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);
  
  if (event.data && event.data.type === 'CACHE_UPDATE') {
    // Force cache update
    event.waitUntil(
      updateCache().then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

// Utility functions
function getDynamicCacheName(request) {
  if (request.destination === 'image') {
    return `${DYNAMIC_CACHE_NAME}-images`;
  }
  return DYNAMIC_CACHE_NAME;
}

function updateCacheInBackground(request) {
  return fetch(request).then((response) => {
    if (response && response.status === 200) {
      const responseClone = response.clone();
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        cache.put(request, responseClone);
      });
    }
  }).catch((error) => {
    console.log('Background cache update failed:', error);
  });
}

async function syncVendorData() {
  try {
    // This would sync local data with a backend when online
    console.log('Service Worker: Syncing vendor data');
    
    // Get stored data from IndexedDB
    const data = await getStoredVendorData();
    
    if (data && data.pendingSync) {
      // Simulate API sync (replace with actual endpoint)
      const response = await fetch('/api/vendor/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data.pendingSync)
      });
      
      if (response.ok) {
        // Clear pending sync data
        await clearPendingSyncData();
        console.log('Service Worker: Data synced successfully');
      }
    }
  } catch (error) {
    console.error('Service Worker: Sync failed', error);
  }
}

async function updateCache() {
  try {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.addAll(STATIC_FILES);
    console.log('Service Worker: Cache updated');
  } catch (error) {
    console.error('Service Worker: Cache update failed', error);
  }
}

// Placeholder functions for IndexedDB operations
async function getStoredVendorData() {
  // Implementation would use IndexedDB
  return null;
}

async function clearPendingSyncData() {
  // Implementation would clear IndexedDB pending data
  return true;
}