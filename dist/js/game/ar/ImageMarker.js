/**
 * 校园RPG - 图像标记配置管理
 * NFT标记注册、识别事件、冷却管理
 * @version 1.0.0
 */

var ImageMarker = (function () {
    'use strict';

    // ============================================
    // 5个标记配置（演示模式使用占位符URL，后续替换真实NFT特征文件）
    // ============================================
    var markers = [
        {
            id: 'marker_001',
            name: '校徽标记',
            description: '扫描校徽解锁校园主线剧情',
            // 演示模式：markerUrl 指向占位图片，后续替换为 NFT 特征文件路径
            markerUrl: 'assets/ar/markers/marker_001/demo.png',
            markerNFT: null, // 正式模式：'assets/ar/markers/marker_001/marker_001'
            isEnabled: true,
            contentType: 'story',  // story | npc | treasure | task
            dialog: '欢迎来到校园开放世界！我是你的向导，点击领取你的新手大礼包！',
            reward: { gold: 100, experience: 50, seed: 'common_knowledge' },
            cooldown: 3600 // 冷却时间1小时
        },
        {
            id: 'marker_002',
            name: '教学楼标记',
            description: '触发教授NPC对话与课程任务',
            markerUrl: 'assets/ar/markers/marker_002/demo.png',
            markerNFT: null,
            isEnabled: true,
            contentType: 'npc',
            npcId: 'naruto',
            taskId: 'ar_math_class',
            dialog: '同学，来上高数课了！完成课后复习任务，就能获得A+知识结晶！',
            reward: { experience: 30, task: 'ar_math_class' },
            cooldown: 3600
        },
        {
            id: 'marker_003',
            name: '图书馆标记',
            description: '解锁知识矿洞副本与深度学习任务',
            markerUrl: 'assets/ar/markers/marker_003/demo.png',
            markerNFT: null,
            isEnabled: true,
            contentType: 'task',
            taskId: 'ar_library_deep',
            dialog: '安静的知识殿堂！在图书馆自习30分钟，即可解锁深层知识矿洞！',
            reward: { experience: 80, seed: 'rare_knowledge' },
            cooldown: 3600
        },
        {
            id: 'marker_004',
            name: '食堂标记',
            description: '解锁干饭人buff与精力恢复道具',
            markerUrl: 'assets/ar/markers/marker_004/demo.png',
            markerNFT: null,
            isEnabled: true,
            contentType: 'buff',
            dialog: '干饭时间到！好好吃饭才能好好学习！精力恢复+30，还有额外金币奖励！',
            reward: { energy: 30, gold: 15 },
            cooldown: 1800 // 食堂标记冷却30分钟
        },
        {
            id: 'marker_005',
            name: '公告栏标记',
            description: '解锁限时任务与隐藏彩蛋',
            markerUrl: 'assets/ar/markers/marker_005/demo.png',
            markerNFT: null,
            isEnabled: true,
            contentType: 'treasure',
            dialog: '公告栏有新消息！限时任务开启，还有隐藏彩蛋等你发现！',
            reward: { gold: 50, experience: 40, rareItem: 'secret_scroll' },
            cooldown: 7200 // 公告栏冷却2小时
        }
    ];

    // ============================================
    // 内部状态
    // ============================================
    var _states = {};         // markerId -> { lastTriggerTime, unlocked }
    var _loadedMarkers = [];  // 已注册到AR场景的标记实体
    var _aScene = null;       // A-Frame 场景引用

    // ============================================
    // 从本地存储恢复状态
    // ============================================
    function _loadStates() {
        try {
            var stored = localStorage.getItem('ar_marker_states');
            if (stored) _states = JSON.parse(stored);
        } catch (e) { _states = {}; }
        markers.forEach(function (m) {
            if (!_states[m.id]) _states[m.id] = { lastTriggerTime: 0, unlocked: false };
        });
    }

    function _saveStates() {
        try { localStorage.setItem('ar_marker_states', JSON.stringify(_states)); } catch (e) {}
    }

    // ============================================
    // 冷却时间检查
    // ============================================
    function checkCooldown(markerId) {
        var marker = markers.find(function (m) { return m.id === markerId; });
        if (!marker) return { onCooldown: false };
        var state = _states[markerId];
        if (!state) return { onCooldown: false };
        var elapsed = (Date.now() / 1000) - state.lastTriggerTime;
        var remaining = marker.cooldown - elapsed;
        return {
            onCooldown: remaining > 0,
            remaining: Math.max(0, Math.ceil(remaining))
        };
    }

    // ============================================
    // 更新标记最后触发时间
    // ============================================
    function _updateLastTrigger(markerId) {
        if (!_states[markerId]) _states[markerId] = { lastTriggerTime: 0, unlocked: false };
        _states[markerId].lastTriggerTime = Date.now() / 1000;
        _saveStates();
    }

    // ============================================
    // 获取标记当前状态
    // ============================================
    function getMarkerState(markerId) {
        if (!_states[markerId]) return 'undiscovered';
        var cooldown = checkCooldown(markerId);
        if (_states[markerId].unlocked && !cooldown.onCooldown) return 'ready';
        if (cooldown.onCooldown) return 'cooldown';
        return 'discovered';
    }

    function getAllMarkersState() {
        return markers.map(function (m) {
            return { id: m.id, name: m.name, state: getMarkerState(m.id) };
        });
    }

    // ============================================
    // 注册标记到AR场景（演示模式：监听摄像头帧，检测图片匹配）
    // ============================================
    function loadMarkers(scene) {
        _aScene = scene;
        _loadStates();

        var container = document.getElementById('ar-markers-container');
        if (!container) {
            console.warn('[ImageMarker] 未找到 ar-markers-container，等待场景加载');
            return;
        }

        markers.forEach(function (marker) {
            if (!marker.isEnabled) return;

            // 演示模式：使用预训练的 Hiro 标记
            // 后续替换为 NFT 标记：type='nft', url='.../marker_001'
            var el = document.createElement('a-marker');
            el.setAttribute('id', marker.id);
            el.setAttribute('preset', 'hiro'); // Hiro 是 AR.js 内置的标准演示标记
            el.setAttribute('smooth', 'true');
            el.setAttribute('smoothCount', '5');
            el.setAttribute('smoothTolerance', '.01');
            el.setAttribute('smoothThreshold', '2');

            // 标记找到时触发
            el.addEventListener('markerFound', function () {
                console.log('[ImageMarker] 识别到:', marker.name);
                var cd = checkCooldown(marker.id);
                if (cd.onCooldown) {
                    document.dispatchEvent(new CustomEvent('ar-marker-cooldown', {
                        detail: { markerId: marker.id, remaining: cd.remaining }
                    }));
                    return;
                }
                document.dispatchEvent(new CustomEvent('ar-marker-found', { detail: { marker: marker } }));
            });

            // 标记丢失时触发
            el.addEventListener('markerLost', function () {
                console.log('[ImageMarker] 标记丢失:', marker.name);
                document.dispatchEvent(new CustomEvent('ar-marker-lost', { detail: { markerId: marker.id } }));
            });

            container.appendChild(el);
            _loadedMarkers.push({ id: marker.id, el: el });
        });

        console.log('[ImageMarker] ' + markers.length + ' 个标记注册完成');
    }

    // ============================================
    // 获取标记配置
    // ============================================
    function getMarkerConfig(markerId) {
        return markers.find(function (m) { return m.id === markerId; }) || null;
    }

    function getAllMarkers() {
        return markers.slice();
    }

    // ============================================
    // 手动解锁标记（调试/管理员）
    // ============================================
    function unlockMarker(markerId) {
        if (!_states[markerId]) _states[markerId] = { lastTriggerTime: 0, unlocked: false };
        _states[markerId].unlocked = true;
        _states[markerId].lastTriggerTime = 0;
        _saveStates();
    }

    // ============================================
    // 重置冷却时间
    // ============================================
    function resetMarkerCooldown(markerId) {
        if (!_states[markerId]) _states[markerId] = { lastTriggerTime: 0, unlocked: false };
        _states[markerId].lastTriggerTime = 0;
        _saveStates();
    }

    // ============================================
    // 触发标记内容后调用（由 ARContentManager 触发）
    // ============================================
    function onMarkerTriggered(markerId) {
        _updateLastTrigger(markerId);
        document.dispatchEvent(new CustomEvent('ar-marker-triggered', {
            detail: { markerId: markerId, timestamp: Date.now() }
        }));
    }

    // ============================================
    // 销毁（关闭AR时调用）
    // ============================================
    function destroy() {
        _loadedMarkers.forEach(function (m) {
            if (m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el);
        });
        _loadedMarkers = [];
        _aScene = null;
    }

    return {
        loadMarkers: loadMarkers,
        getMarkerConfig: getMarkerConfig,
        getAllMarkers: getAllMarkers,
        getMarkerState: getMarkerState,
        getAllMarkersState: getAllMarkersState,
        checkCooldown: checkCooldown,
        unlockMarker: unlockMarker,
        resetMarkerCooldown: resetMarkerCooldown,
        onMarkerTriggered: onMarkerTriggered,
        destroy: destroy
    };
})();

window.ImageMarker = ImageMarker;
