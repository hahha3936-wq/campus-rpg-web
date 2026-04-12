/**
 * 校园RPG Service Worker
 * 提供离线缓存支持
 */
const CACHE_NAME = 'campus-rpg-v8';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/main.css',
  '/css/components.css',
  '/css/animations.css',
  '/css/chat-widget.css',
  '/js/app.js',
  '/js/api.js',
  '/js/components.js',
  '/js/animations.js',
  '/js/chat-widget.js',
  '/data/user_data.json',
  '/data/task_data.json',
  '/data/achievement_data.json',
];

// 安装：缓存静态资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// 请求拦截：开发模式下直接网络优先，避免缓存旧文件
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过非 GET 请求
  if (request.method !== 'GET') return;

  // API 请求（/api/）：仅在在线时使用网络
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: '离线状态，无法请求API' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // JS 和 CSS 文件：始终从网络获取，不使用缓存（确保开发时始终加载最新代码）
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(fetch(request));
    return;
  }

  // 多页导航请求（*.html，不含首页）：直接放行
  if (request.mode === 'navigate' && url.pathname.endsWith('.html') && url.pathname !== '/index.html') {
    return;
  }

  // 首页和静态资源：缓存优先，失败时回退网络
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// 推送通知（预留）
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '校园RPG';
  const options = {
    body: data.body || '你有新消息！',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'campus-rpg-notify',
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知点击
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
