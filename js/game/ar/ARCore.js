/**
 * 校园RPG - AR核心引擎
 * 管理AR.js依赖加载、场景初始化、生命周期
 * @version 1.2.0
 */

var ARCore = (function () {
    'use strict';

    // ============================================
    // CDN 配置（AR.js 3.4.8 + A-Frame 1.6.0）
    // aframe-ar.js 包含 Marker Tracking + Location Based AR
    // ============================================
    var CDN_AFRAME = 'https://cdn.jsdelivr.net/npm/aframe@1.6.0/dist/aframe-master.min.js';
    var CDN_ARJS = 'https://cdn.jsdelivr.net/npm/@ar-js-org/ar.js@3.4.8/aframe/build/aframe-ar.js';

    // ============================================
    // 内部状态
    // ============================================
    var _depsLoaded = false;
    var _loading = false;
    var _scene = null;
    var _container = null;
    var _prevCanvasDisplay = null;
    var _prevContainerDisplay = null;
    var _prevUI = null;
    var _heartbeatTimer = null;

    // ============================================
    // 环境与权限检查
    // ============================================
    function checkEnvironment() {
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            return { ok: false, msg: 'AR功能需要HTTPS安全环境，请使用HTTPS链接访问' };
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return { ok: false, msg: '你的浏览器不支持摄像头AR功能，请使用Chrome/Edge/Safari最新版' };
        }
        return { ok: true };
    }

    // ============================================
    // 动态加载脚本（Promise 化）
    // ============================================
    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            if (document.querySelector('script[src="' + src + '"]')) {
                resolve();
                return;
            }
            var script = document.createElement('script');
            script.src = src;
            script.onload = function () { resolve(); };
            script.onerror = function () { reject(new Error('加载失败: ' + src)); };
            document.head.appendChild(script);
        });
    }

    // ============================================
    // 按顺序加载 AR 依赖
    // ============================================
    var _loadPromise = null;

    function loadDependencies() {
        if (_depsLoaded) { return Promise.resolve(); }
        if (_loadPromise) { return _loadPromise; }
        _loading = true;
        _loadPromise = new Promise(function (resolve, reject) {
            loadScript(CDN_AFRAME)
                .then(function () { return loadScript(CDN_ARJS); })
                .then(function () {
                    _depsLoaded = true;
                    _loading = false;
                    document.dispatchEvent(new CustomEvent('ar-dependencies-loaded'));
                    console.log('[ARCore] AR.js依赖加载成功 (A-Frame 1.6.0 + AR.js 3.4.8)');
                    resolve();
                })
                .catch(function (err) {
                    _loading = false;
                    _loadPromise = null;
                    console.error('[ARCore] AR.js依赖加载失败:', err.message);
                    reject(err);
                });
        });
        return _loadPromise;
    }

    // ============================================
    // 销毁 AR 场景（关闭时调用）
    // ============================================
    function destroyScene() {
        if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
        // 停止所有残留的 video 元素
        document.querySelectorAll('video').forEach(function(v) {
            if (v.srcObject) {
                v.srcObject.getTracks().forEach(function(t) { t.stop(); });
                v.srcObject = null;
            }
        });
        if (_scene && _scene.parentNode) { _scene.parentNode.remove(); }
        _scene = null;
        _container = null;
    }

    // ============================================
    // 隐藏 / 恢复游戏界面
    // ============================================
    function hideGameUI() {
        var canvas = document.querySelector('canvas');
        var mainContainer = document.getElementById('game-container') || document.querySelector('.main-container') || document.querySelector('main') || document.body;
        _prevCanvasDisplay = canvas ? canvas.style.display : null;
        _prevContainerDisplay = mainContainer.style.display;
        _prevUI = mainContainer;
        if (canvas) canvas.style.display = 'none';
        mainContainer.style.display = 'none';
    }

    function showGameUI() {
        if (_prevCanvasDisplay && document.querySelector('canvas')) document.querySelector('canvas').style.display = _prevCanvasDisplay;
        if (_prevUI) _prevUI.style.display = _prevContainerDisplay || '';
        _prevCanvasDisplay = null;
        _prevContainerDisplay = null;
        _prevUI = null;
    }

    // ============================================
    // 创建 AR 场景 DOM
    // AR.js 3.4.x 会自动处理摄像头，a-scene 自己创建和管理 video 元素
    // ============================================
    function createSceneDOM() {
        if (_container) return;

        // 外层容器（背景设为透明，让视频透出来）
        _container = document.createElement('div');
        _container.id = 'ar-container';
        _container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;display:none;background:transparent;overflow:hidden;';

        // 先追加到 body，再立即显示并触发 reflow
        // 这样 a-scene 初始化时能正确测量到容器尺寸
        document.body.appendChild(_container);
        _container.style.display = 'block';
        _container.offsetHeight; // 强制 reflow，确保尺寸已计算

        // ============================================
        // A-Frame 场景
        // 不使用 embedded，改为手动控制尺寸以确保全屏
        // videoConstraints 约束分辨率，防止低分辨率导致黑屏
        // ============================================
        _scene = document.createElement('a-scene');
        _scene.id = 'ar-scene';
        _scene.setAttribute('vr-mode-ui', 'enabled: false');
        _scene.setAttribute('renderer', 'logarithmicDepthBuffer: true; antialias: false; alpha: true;');
        _scene.setAttribute('arjs', 'sourceType: webcam; videoWidth: 640; videoHeight: 480; detectionMode: mono; trackingMethod: best; debugUIEnabled: false;');
        _scene.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

        // 相机（AR.js 需要）
        var camera = document.createElement('a-entity');
        camera.id = 'ar-camera';
        camera.setAttribute('camera', '');
        camera.setAttribute('look-controls', 'enabled: false');
        camera.setAttribute('position', '0 1.6 0');

        // 光照
        var lightAmbient = document.createElement('a-entity');
        lightAmbient.setAttribute('light', 'type: ambient; color: #FFF; intensity: 0.6;');

        var lightDir = document.createElement('a-entity');
        lightDir.setAttribute('light', 'type: directional; color: #FFF; intensity: 1.0;');
        lightDir.setAttribute('position', '1 2 1');

        // 标记容器（ImageMarker 模块会将 <a-marker> 挂到这里）
        var markersContainer = document.createElement('a-entity');
        markersContainer.id = 'ar-markers-container';

        _scene.appendChild(camera);
        _scene.appendChild(lightAmbient);
        _scene.appendChild(lightDir);
        _scene.appendChild(markersContainer);

        _container.appendChild(_scene);

        // 监听 a-scene 初始化完成
        _scene.addEventListener('loaded', function () {
            console.log('[ARCore] A-Frame 场景 loaded 事件触发');

            // 强制隐藏 a-scene 的默认背景色（A-Frame 1.6.0 可能有 CSS background）
            _scene.style.background = 'transparent';

            // 尝试立即找 video 元素（如果 AR.js 已经创建了的话）
            applyVideoFix();

            // 如果没找到，用 MutationObserver 监听 video 元素挂载
            var videoObserver = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var added = mutations[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        if (added[j].nodeName === 'VIDEO' || (added[j].querySelector && added[j].querySelector('video'))) {
                            applyVideoFix();
                            videoObserver.disconnect();
                            console.log('[ARCore] MutationObserver 检测到 video 并应用修复');
                            return;
                        }
                    }
                }
            });

            videoObserver.observe(document.body, { childList: true, subtree: true });

            // 3秒后自动断开 observer（兜底）
            setTimeout(function () { videoObserver.disconnect(); }, 3000);

            // 额外尝试：直接监听 AR.js 的视频就绪事件
            document.addEventListener('arjs-video-loaded', function () {
                console.log('[ARCore] arjs-video-loaded 事件触发，应用视频修复');
                applyVideoFix();
                videoObserver.disconnect();
            }, { once: true });
        });

        // ============================================
        // 修复 video 元素的样式和位置（抽取为独立函数）
        // ============================================
        function applyVideoFix() {
            // 多重选择器，确保找到正确的 video 元素
            var video = document.querySelector('#ar-scene video') ||
                         document.querySelector('video[autoplay]') ||
                         document.querySelector('video[playsinline]') ||
                         document.querySelector('video');
            if (!video) {
                console.warn('[ARCore] applyVideoFix: 仍未找到 video 元素');
                return;
            }

            // 强制覆盖所有可能的隐藏样式
            video.style.setProperty('position', 'fixed', 'important');
            video.style.setProperty('top', '0', 'important');
            video.style.setProperty('left', '0', 'important');
            video.style.setProperty('width', '100vw', 'important');
            video.style.setProperty('height', '100vh', 'important');
            video.style.setProperty('object-fit', 'cover', 'important');
            video.style.setProperty('z-index', '0', 'important');
            video.style.setProperty('display', 'block', 'important');
            video.style.setProperty('visibility', 'visible', 'important');
            video.style.setProperty('opacity', '1', 'important');

            // 将 video 移入 #ar-container（确保在 canvas 下方）
            if (_container) {
                var existing = _container.querySelector('video');
                if (!existing) {
                    _container.insertBefore(video, _container.firstChild);
                } else if (existing !== video) {
                    _container.insertBefore(video, _container.firstChild);
                }
            }

            // 确保 Three.js 场景背景透明
            if (_scene && _scene.object3D) {
                _scene.object3D.background = null;
            }
            _scene.style.background = 'transparent';

            // 确保 canvas 透明且在 video 上方
            var canvas = document.querySelector('#ar-scene canvas');
            if (canvas) {
                canvas.style.background = 'transparent';
                canvas.style.setProperty('z-index', '1', 'important');
                // 强制移除可能的默认背景
                canvas.style.setProperty('position', 'absolute', 'important');
                canvas.style.setProperty('top', '0', 'important');
                canvas.style.setProperty('left', '0', 'important');
                canvas.style.setProperty('width', '100%', 'important');
                canvas.style.setProperty('height', '100%', 'important');
            }

            console.log('[ARCore] 视频元素样式已修复: ' + video.videoWidth + 'x' + video.videoHeight);
        }

        console.log('[ARCore] AR场景DOM创建完成');
    }

    // ============================================
    // 打开 AR
    // ============================================
    async function openAR() {
        var env = checkEnvironment();
        if (!env.ok) {
            document.dispatchEvent(new CustomEvent('ar-error', { detail: { message: env.msg } }));
            return false;
        }
        try {
            // 1. 加载 AR.js 依赖（A-Frame + AR.js）
            console.log('[ARCore] 开始加载 AR.js 依赖...');
            await loadDependencies();
            console.log('[ARCore] 依赖加载完成');

            // 2. 隐藏游戏 UI
            hideGameUI();

            // 3. 创建场景 DOM（AR.js 自动处理摄像头申请）
            createSceneDOM();
            console.log('[ARCore] 场景 DOM 已创建，等待显示...');

            // 4. AR 容器已在 createSceneDOM 中显示

            // 5. 等待 A-Frame 场景加载完成
            // 场景初始化流程：A-Frame 解析DOM -> 请求摄像头 -> 场景ready
            console.log('[ARCore] 开始等待视频流...');
            return await waitForSceneReady();
        } catch (err) {
            console.error('[ARCore] AR启动失败:', err.message);
            document.dispatchEvent(new CustomEvent('ar-error', { detail: { message: err.message || 'AR启动失败' } }));
            return false;
        }
    }

    // ============================================
    // 等待场景就绪
    // ============================================
    function waitForSceneReady() {
        return new Promise(function (resolve) {
            var videoReady = false;
            var sceneReady = false;

            function checkDone() {
                if (videoReady && sceneReady) {
                    document.dispatchEvent(new CustomEvent('ar-opened'));
                    resolve(true);
                }
            }

            // 兜底1：直接轮询 <video> 元素的 readyState 和尺寸（最可靠的视频就绪检测）
            var _arVideoCheckTimer = setInterval(function () {
                var video = document.querySelector('#ar-scene video') ||
                             document.querySelector('video[autoplay]');
                if (video) {
                    console.log('[ARCore] 视频状态: readyState=' + video.readyState + ', ' +
                        'videoWidth=' + video.videoWidth + ', videoHeight=' + video.videoHeight +
                        ', clientWidth=' + video.clientWidth + ', clientHeight=' + video.clientHeight +
                        ', offsetWidth=' + video.offsetWidth + ', offsetHeight=' + video.offsetHeight +
                        ', srcObject=' + (video.srcObject ? 'connected' : 'null') +
                        ', paused=' + video.paused + ', hidden=' + video.hidden);
                }
                if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                    console.log('[ARCore] 视频流就绪（readyState=' + video.readyState + ', ' + video.videoWidth + 'x' + video.videoHeight + '）');
                    videoReady = true;
                    clearInterval(_arVideoCheckTimer);
                    checkDone();
                }
            }, 500);

            // 兜底2：10秒超时强制放行
            setTimeout(function () {
                if (!videoReady) {
                    console.log('[ARCore] 视频启动超时，强制通知就绪');
                    videoReady = true;
                    clearInterval(_arVideoCheckTimer);
                    checkDone();
                }
            }, 10000);

            // 原 arjs-video-loaded 事件（如果能触发则提前清除轮询）
            document.addEventListener('arjs-video-loaded', function () {
                console.log('[ARCore] AR.js 视频流就绪（via arjs-video-loaded）');
                videoReady = true;
                clearInterval(_arVideoCheckTimer);
                checkDone();
            }, { once: true });

            // 监听 A-Frame 场景就绪
            if (_scene && _scene.hasLoaded) {
                sceneReady = true;
                setTimeout(checkDone, 0);
            } else if (_scene) {
                _scene.addEventListener('loaded', function () {
                    sceneReady = true;
                    checkDone();
                }, { once: true });
            } else {
                sceneReady = true;
                setTimeout(checkDone, 500);
            }

            // 启动心跳检测
            startHeartbeat();
        });
    }

    // ============================================
    // 关闭 AR
    // ============================================
    function closeAR() {
        stopHeartbeat();
        destroyScene();
        showGameUI();
        document.dispatchEvent(new CustomEvent('ar-closed'));
        return true;
    }

    // ============================================
    // 心跳检测（防崩溃）
    // ============================================
    function startHeartbeat() {
        _heartbeatTimer = setInterval(function () {
            if (!_scene || !document.contains(_scene)) {
                closeAR();
                document.dispatchEvent(new CustomEvent('ar-error', { detail: { message: 'AR场景异常，已自动关闭' } }));
            }
        }, 5000);
    }

    function stopHeartbeat() {
        if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
    }

    // ============================================
    // 完全销毁（释放内存）
    // ============================================
    function destroy() {
        stopHeartbeat();
        destroyScene();
        showGameUI();
        _depsLoaded = false;
        _loading = false;
    }

    return {
        checkEnvironment: checkEnvironment,
        loadDependencies: loadDependencies,
        openAR: openAR,
        closeAR: closeAR,
        destroy: destroy,
        isLoaded: function () { return _depsLoaded; },
        getScene: function () { return _scene; },
        getContainer: function () { return _container; }
    };
})();

window.ARCore = ARCore;
