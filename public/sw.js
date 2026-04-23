/**
 * ServiceWorker - AR.js 库本地缓存
 *
 * 策略：Cache First（优先缓存）
 * 首次联网加载后，AR.js 库被缓存，后续离线可正常使用
 *
 * 缓存列表：
 * - A-Frame 1.6.0
 * - AR.js 3.4.8
 */

var CACHE_NAME = 'campus-rpg-ar-libs-v1';
var AR_CDN_BASE = 'https://cdn.jsdelivr.net/npm/';
var AR_LIBS = [
    AR_CDN_BASE + '@ar-js-org/ar.js@3.4.8/aframe/build/aframe-ar.js',
    AR_CDN_BASE + 'aframe@1.6.0/dist/aframe-master.min.js',
    AR_CDN_BASE + 'aframe@1.6.0/dist/aframe-master.min.js.map'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return Promise.allSettled(
                AR_LIBS.map(function(url) { return cache.add(url); })
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(event) {
    var url = event.request.url;
    if (url.includes('cdn.jsdelivr.net') && (
        url.includes('ar.js') || url.includes('aframe')
    )) {
        event.respondWith(
            caches.match(event.request).then(function(cached) {
                if (cached) return cached;
                return fetch(event.request).then(function(resp) {
                    if (resp.ok) {
                        var clone = resp.clone();
                        caches.open(CACHE_NAME).then(function(cache) {
                            cache.put(event.request, clone);
                        });
                    }
                    return resp;
                });
            })
        );
    }
});
