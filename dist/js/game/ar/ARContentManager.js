/**
 * 校园RPG - AR内容管理器
 * 像素内容生成、叠加、动画、销毁
 * @version 1.0.0
 */

var ARContentManager = (function () {
    'use strict';

    // ============================================
    // 内部状态
    // ============================================
    var _aScene = null;
    var _contentEntities = {};   // markerId -> { entity, contentData, animTimer }
    var _isPaused = false;
    var _spriteCache = {};       // markerId -> base64 PNG

    // ============================================
    // 内容配置（与 ImageMarker 标记一一对应）
    // ============================================
    var CONTENT_CONFIG = {
        'marker_001': {
            type: 'story',
            label: '校徽奖励',
            rewardSummary: '+100金币 +50经验 +知识种子'
        },
        'marker_002': {
            type: 'npc',
            label: '教学楼',
            rewardSummary: '+30经验 +课程任务'
        },
        'marker_003': {
            type: 'task',
            label: '知识宝箱',
            rewardSummary: '+80经验 +稀有种子'
        },
        'marker_004': {
            type: 'buff',
            label: '食堂buff',
            rewardSummary: '+30精力 +15金币'
        },
        'marker_005': {
            type: 'treasure',
            label: '彩蛋宝箱',
            rewardSummary: '+50金币 +40经验 +神秘卷轴'
        }
    };

    // ============================================
    // 预加载精灵到内存
    // ============================================
    function preloadSprites(markerIds) {
        if (typeof PixelSpriteGenerator === 'undefined') {
            console.warn('[ARContentManager] PixelSpriteGenerator 未加载');
            return;
        }
        markerIds.forEach(function (id) {
            var dataUrl = PixelSpriteGenerator.getSprite(id);
            if (dataUrl) _spriteCache[id] = dataUrl;
        });
        console.log('[ARContentManager] 预加载 ' + Object.keys(_spriteCache).length + ' 个精灵');
    }

    // ============================================
    // 创建 A-Frame 内容实体
    // ============================================
    function createContentEntity(markerId, markerEl) {
        if (!_aScene || !markerEl) return;

        // 清除旧内容
        hideARContent(markerId);

        var contentData = CONTENT_CONFIG[markerId];
        var spriteUrl = _spriteCache[markerId];

        // 创建主实体（像素精灵）
        var el = document.createElement('a-image');
        el.setAttribute('id', 'ar-content-' + markerId);
        el.setAttribute('src', spriteUrl || '');
        el.setAttribute('width', '0.4');
        el.setAttribute('height', '0.4');
        el.setAttribute('position', '0 0.3 0');
        el.setAttribute('look-at', '[camera]');
        el.style.cursor = 'pointer';

        // 点击交互
        el.addEventListener('click', function () {
            if (_isPaused) return;
            document.dispatchEvent(new CustomEvent('ar-content-clicked', {
                detail: { markerId: markerId, contentData: contentData }
            }));
        });

        // 添加待机动画（上下浮动）
        el.setAttribute('animation__float', 'property: position; from: 0 0.3 0 to: 0 0.45 0; dir: alternate; dur: 800; loop: true; easing: easeInOutSine');

        markerEl.appendChild(el);

        // 生成星星特效
        spawnStarEffect(markerEl);

        _contentEntities[markerId] = {
            entity: el,
            contentData: contentData,
            animTimer: null
        };

        console.log('[ARContentManager] 生成内容:', markerId);
        return el;
    }

    // ============================================
    // 星星特效（识别成功时播放）
    // ============================================
    function spawnStarEffect(markerEl) {
        var starUrl = '';
        if (typeof PixelSpriteGenerator !== 'undefined') {
            starUrl = PixelSpriteGenerator.getStarSprite() || '';
        }

        for (var i = 0; i < 5; i++) {
            (function (idx) {
                setTimeout(function () {
                    var star = document.createElement('a-image');
                    star.setAttribute('src', starUrl);
                    star.setAttribute('width', '0.12');
                    star.setAttribute('height', '0.12');
                    var angle = (idx / 5) * Math.PI * 2;
                    var radius = 0.25;
                    star.setAttribute('position', (Math.cos(angle) * radius) + ' 0.35 0');
                    star.setAttribute('animation__spawn', 'property: position; to: ' + (Math.cos(angle) * radius * 0.3) + ' 0.7 0; dur: 1000; easing: easeOutQuad');
                    star.setAttribute('animation__fade', 'property: scale; from: 1 1 1; to: 0.2 0.2 1; dur: 1000; easing: easeInQuad');
                    star.setAttribute('animation__remove', 'property: visible; to: false; delay: 900; dur: 1');
                    markerEl.appendChild(star);
                    setTimeout(function () { if (star.parentNode) star.parentNode.removeChild(star); }, 1200);
                }, idx * 120);
            })(i);
        }
    }

    // ============================================
    // 隐藏 AR 内容
    // ============================================
    function hideARContent(markerId) {
        var entry = _contentEntities[markerId];
        if (!entry) return;
        if (entry.entity && entry.entity.parentNode) {
            entry.entity.parentNode.removeChild(entry.entity);
        }
        if (entry.animTimer) { clearTimeout(entry.animTimer); }
        delete _contentEntities[markerId];
    }

    // ============================================
    // 销毁所有 AR 内容（关闭 AR 时调用）
    // ============================================
    function destroyAllARContent() {
        Object.keys(_contentEntities).forEach(function (id) {
            hideARContent(id);
        });
        _spriteCache = {};
        _isPaused = false;
        if (typeof VisionAR !== 'undefined' && VisionAR.stop) VisionAR.stop();
        var toast = document.getElementById('vision-narrative-toast');
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
        console.log('[ARContentManager] 所有AR内容已销毁');
        console.log('[ARContentManager] 所有AR内容已销毁');
    }

    // ============================================
    // 初始化（AR场景启动时调用）
    // ============================================
    function init(scene) {
        _aScene = scene;
        if (typeof ImageMarker !== 'undefined') {
            var markerIds = ImageMarker.getAllMarkers().map(function (m) { return m.id; });
            preloadSprites(markerIds);
        }
        console.log('[ARContentManager] 初始化完成');
    }

    // ============================================
    // 标记找到时的处理
    // ============================================
    function onMarkerFound(marker) {
        var markerId = marker.id;
        var markerEl = document.getElementById(markerId);
        if (!markerEl) return;
        createContentEntity(markerId, markerEl);
    }

    // ============================================
    // 标记丢失时的处理
    // ============================================
    function onMarkerLost(markerId) {
        hideARContent(markerId);
    }

    // ============================================
    // 暂停 AR 识别（弹出面板时）
    // ============================================
    function pause() { _isPaused = true; }

    // ============================================
    // 恢复 AR 识别（关闭面板时）
    // ============================================
    function resume() { _isPaused = false; }

    // ============================================
    // 触发标记内容（交互完成时调用）
    // ============================================
    function triggerContent(markerId) {
        var entry = _contentEntities[markerId];
        if (!entry) return;

        // 播放收集动画
        if (entry.entity) {
            entry.entity.setAttribute('animation__collect',
                'property: scale; to: 0 0 0; dur: 400; easing: easeInBack');
            setTimeout(function () {
                hideARContent(markerId);
            }, 450);
        }

        // 通知 ImageMarker 更新冷却时间
        if (typeof ImageMarker !== 'undefined' && typeof ImageMarker.onMarkerTriggered === 'function') {
            ImageMarker.onMarkerTriggered(markerId);
        }
    }

    return {
        init: init,
        onMarkerFound: onMarkerFound,
        onMarkerLost: onMarkerLost,
        hideARContent: hideARContent,
        destroyAllARContent: destroyAllARContent,
        pause: pause,
        resume: resume,
        triggerContent: triggerContent,
        CONTENT_CONFIG: CONTENT_CONFIG
    };

    // ============================================
    // VisionAR 场景检测事件处理
    // ============================================
    document.addEventListener('vision-scene-detected', function (e) {
        if (_isPaused) return;
        var detail = e.detail || {};
        var sceneId = detail.sceneId || 'unknown';
        var sceneConfig = detail.config || {};

        console.log('[ARContentManager] VisionAR 检测到:', sceneConfig.name || sceneId);

        showVisionNarrative(sceneConfig, detail.narrative);
    });

    // ============================================
    // 叙事气泡
    // ============================================
    function showVisionNarrative(config, narrative) {
        var old = document.getElementById('vision-narrative-toast');
        if (old) old.parentNode.removeChild(old);

        var toast = document.createElement('div');
        toast.id = 'vision-narrative-toast';
        toast.style.cssText = [
            'position:fixed',
            'top:80px',
            'left:50%',
            'transform:translateX(-50%)',
            'background:linear-gradient(135deg,rgba(20,20,60,.97),rgba(40,20,80,.97))',
            'color:#fff',
            'padding:16px 24px',
            'borderRadius:16px',
            'fontSize:14px',
            'maxWidth:340px',
            'width:auto',
            'textAlign:center',
            'boxShadow:0 8px 32px rgba(0,0,0,.4)',
            'border:1px solid rgba(255,255,255,.12)',
            'zIndex:10001',
            'animation:fadeInDown 0.5s ease',
            'backdrop-filter:blur(12px)'
        ].join(';');

        toast.innerHTML = [
            '<div style="font-size:32px;margin-bottom:8px">' + (config.icon || '🎮') + '</div>',
            '<div style="font-weight:bold;margin-bottom:6px;color:#ffd700;font-size:15px">' + (config.greeting || '') + '</div>',
            '<div style="margin-bottom:4px;color:#e0e0e0;font-size:13px;font-weight:500">' + (config.name || '未知') + '</div>',
            '<div style="font-size:12px;opacity:.8;line-height:1.6">' + (narrative || config.content || '') + '</div>',
            '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1);font-size:11px;color:#aaa">' + buildRewardText(config.reward) + '</div>'
        ].join('');

        document.body.appendChild(toast);

        setTimeout(function () {
            if (toast.parentNode) {
                toast.style.transition = 'opacity 0.5s, transform 0.5s';
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(-10px)';
                setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 500);
            }
        }, 5000);
    }

    function buildRewardText(reward) {
        if (!reward) return '';
        var parts = [];
        if (reward.gold) parts.push('💰 +' + reward.gold + '金币');
        if (reward.experience) parts.push('✨ +' + reward.experience + '经验');
        if (reward.energy) parts.push('⚡ +' + reward.energy + '精力');
        if (reward.mood) parts.push('😊 +' + reward.mood + '心情');
        if (reward.stress && reward.stress < 0) parts.push('😌 压力' + reward.stress);
        return parts.length ? '奖励: ' + parts.join(' | ') : '';
    }
})();

window.ARContentManager = ARContentManager;
