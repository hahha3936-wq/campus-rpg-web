/**
 * API 根地址：解决「页面不在 Flask 同源（如 Live Server :5500）时 /api 请求打到静态服务器返回 HTML」的问题。
 * 优先级：window.__CAMPUS_RPG_API_BASE__ > meta[name=campus-rpg-api-base] > 常见开发端口回退到 5000
 */
(function () {
    'use strict';

    function trimSlash(s) {
        return String(s).replace(/\/+$/, '');
    }

    function fromWindow() {
        var w = window.__CAMPUS_RPG_API_BASE__;
        if (typeof w === 'string' && w.trim()) return trimSlash(w.trim());
        return null;
    }

    function fromMeta() {
        try {
            var m = document.querySelector('meta[name="campus-rpg-api-base"]');
            if (m) {
                var c = (m.getAttribute('content') || '').trim();
                if (c) return trimSlash(c);
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function devPortFallback() {
        var p = String(location.port || '');
        if (p === '5000' || p === '') return '';
        var devPorts = ['5500', '5501', '8080', '3000', '5173', '4173', '8888'];
        if (devPorts.indexOf(p) !== -1) return 'http://127.0.0.1:5000';
        return '';
    }

    var base = fromWindow() || fromMeta() || devPortFallback();
    window.CAMPUS_RPG_API_BASE = base;

    window.apiUrl = function apiUrl(path) {
        if (!path) return base;
        var p = String(path);
        if (p.indexOf('http://') === 0 || p.indexOf('https://') === 0) return p;
        if (p.charAt(0) !== '/') p = '/' + p;
        return base + p;
    };
})();
