/**
 * 校园RPG - AR统一入口
 * 按正确顺序动态加载所有AR模块，初始化各组件，绑定全局事件
 * @version 1.0.1
 */

var ARMain = (function () {
    'use strict';

    // 所有 AR 模块按依赖顺序排列
    var MODULE_LIST = [
        'js/game/ar/ARDebug.js',
        'js/game/ar/PixelSpriteGenerator.js',
        'js/game/ar/ARCore.js',
        'js/game/ar/ImageMarker.js',
        'js/game/ar/ARContentManager.js',
        'js/game/ar/VisionAR.js',
        'js/game/ar/VoiceNPC.js',
        'js/game/ar/ARIntegration.js',
        'js/game/ar/ARUI.js'
    ];

    var _loaded = false;
    var _loading = false;
    var _initialized = false;
    var _initCalled = false;

    // ============================================
    // 动态加载脚本（Promise 化）
    // ============================================
    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var existing = document.querySelector('script[src="' + src + '"]');
            if (existing) { resolve(); return; }
            var script = document.createElement('script');
            script.src = src;
            script.onload = function () { resolve(); };
            script.onerror = function () { reject(new Error('加载失败: ' + src)); };
            document.head.appendChild(script);
        });
    }

    // ============================================
    // 按顺序加载所有模块
    // ============================================
    async function loadAllModules() {
        if (_loaded) return;
        if (_loading) return;
        _loading = true;
        console.log('[ARMain] 开始加载AR模块...');
        try {
            for (var i = 0; i < MODULE_LIST.length; i++) {
                await loadScript(MODULE_LIST[i]);
                console.log('[ARMain] 已加载: ' + MODULE_LIST[i]);
            }
            _loaded = true;
            _loading = false;
            console.log('[ARMain] 所有AR模块加载完成');
        } catch (err) {
            _loading = false;
            console.error('[ARMain] AR模块加载失败:', err.message);
            if (typeof ARUI !== 'undefined' && typeof ARUI.showError === 'function') {
                ARUI.showError('AR资源加载失败，请检查网络后重试。', true);
            }
        }
    }

    // ============================================
    // 初始化所有 AR 模块
    // ============================================
    async function init() {
        if (_initCalled) return;
        _initCalled = true;

        // 先加载所有模块
        await loadAllModules();

        // 等下一个 tick，确保模块变量已挂载到 window
        await new Promise(function (resolve) { setTimeout(resolve, 0); });

        if (!_loaded) {
            console.warn('[ARMain] 模块加载失败，跳过初始化');
            return;
        }

        // 初始化各模块
        if (typeof ARDebug !== 'undefined' && ARDebug.init) ARDebug.init(false);
        if (typeof ARIntegration !== 'undefined' && ARIntegration.init) ARIntegration.init();
        if (typeof ARUI !== 'undefined' && ARUI.init) ARUI.init();

        // 语音助手初始化（不依赖AR场景，随时可用）
        if (typeof VoiceNPC !== 'undefined' && VoiceNPC.init) {
            VoiceNPC.init();
            console.log('[ARMain] VoiceNPC 语音助手已初始化');
        }

        // ARCore 依赖加载完成：初始化标记和内容系统
        document.addEventListener('ar-dependencies-loaded', function () {
            console.log('[ARMain] AR依赖加载完成，初始化标记系统...');
            var scene = document.getElementById('ar-scene');
            if (scene) {
                if (typeof ImageMarker !== 'undefined' && ImageMarker.loadMarkers) ImageMarker.loadMarkers(scene);
                if (typeof ARContentManager !== 'undefined' && ARContentManager.init) ARContentManager.init(scene);
                if (typeof ARCore !== 'undefined' && ARCore.initVisionAR) ARCore.initVisionAR();
            }
        });

        // AR 打开事件：初始化标记和内容
        document.addEventListener('ar-opened', function () {
            console.log('[ARMain] AR场景已打开');
            var scene = document.getElementById('ar-scene');
            if (scene && scene.hasLoaded) {
                if (typeof ImageMarker !== 'undefined' && ImageMarker.loadMarkers) ImageMarker.loadMarkers(scene);
                if (typeof ARContentManager !== 'undefined' && ARContentManager.init) ARContentManager.init(scene);
                if (typeof ARCore !== 'undefined' && ARCore.initVisionAR) ARCore.initVisionAR();
            } else if (scene) {
                scene.addEventListener('loaded', function () {
                    if (typeof ImageMarker !== 'undefined' && ImageMarker.loadMarkers) ImageMarker.loadMarkers(scene);
                    if (typeof ARContentManager !== 'undefined' && ARContentManager.init) ARContentManager.init(scene);
                    if (typeof ARCore !== 'undefined' && ARCore.initVisionAR) ARCore.initVisionAR();
                }, { once: true });
            }
        });

        // AR 关闭事件：清理所有资源
        document.addEventListener('ar-closed', function () {
            console.log('[ARMain] AR场景已关闭，清理资源...');
            if (typeof ARContentManager !== 'undefined' && ARContentManager.destroyAllARContent) ARContentManager.destroyAllARContent();
            if (typeof ImageMarker !== 'undefined' && ImageMarker.destroy) ImageMarker.destroy();
            if (typeof ARDebug !== 'undefined' && ARDebug.log) ARDebug.log('info', 'AR会话结束');
        });

        // 认证错误
        document.addEventListener('ar-auth-error', function () {
            if (typeof ARUI !== 'undefined' && typeof ARUI.showError === 'function') {
                ARUI.showError('登录已过期，请重新登录后使用AR功能。', true);
            }
        });

        // 离线同步完成
        document.addEventListener('ar-offline-synced', function (e) {
            console.log('[ARMain] 离线数据同步完成: ' + e.detail.count + ' 条');
        });

        console.log('[ARMain] AR系统初始化完成');
        _initialized = true;
    }

    return {
        init: init,
        loadAllModules: loadAllModules,
        isLoaded: function () { return _loaded; }
    };
})();

// ============================================
// 启动 AR 系统
// ============================================
(function bootstrap() {
    var attempts = 0;
    var maxAttempts = 20; // 最多重试20次（2秒），确保覆盖所有脚本加载场景

    function tryInit() {
        attempts++;
        if (typeof ARMain !== 'undefined' && ARMain.init) {
            ARMain.init();
        } else if (attempts < maxAttempts) {
            // 模块尚未加载完成（defer脚本时序），50ms后重试
            setTimeout(tryInit, 100);
        } else {
            console.warn('[ARMain] 初始化超时（' + attempts + '次尝试），AR功能不可用');
        }
    }

    // DOM 已就绪（defer脚本默认此时执行），直接尝试
    setTimeout(tryInit, 0);
})();

window.ARMain = ARMain;
