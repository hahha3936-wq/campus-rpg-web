/**
 * 校园RPG - 功能可用性守卫模块
 *
 * 职责：网络断开时，自动给依赖网络的功能添加灰化标记和提示
 * 不修改原有功能逻辑，仅叠加 UI 层
 *
 * 标记规则：
 * - AI对话（chat-widget）：#chat-toggle-btn 或 .chat-toggle-btn
 * - AR VisionAR：.ar-vision-btn 或 #vision-ar-btn
 * - 数据同步：已有 SyncStatusBar（网络断开时自动显示）
 */
const FeatureGuard = (() => {
    function _init() {
        window.addEventListener('network-change', function(e) {
            if (!e.detail.online) {
                _guardAll();
            } else {
                _restoreAll();
            }
        });

        if (window.isOnline === false) {
            setTimeout(_guardAll, 300);
        }
    }

    function _guardAll() {
        _guardChat();
        _guardVisionAR();
    }

    function _restoreAll() {
        _restoreChat();
        _restoreVisionAR();
    }

    // ========== AI 对话（chat-widget）灰化 ==========
    function _guardChat() {
        var btn = document.getElementById('chat-toggle-btn') ||
                  document.querySelector('.chat-toggle-btn') ||
                  document.querySelector('[data-feature="chat"]');
        if (!btn) return;

        if (btn.hasAttribute('data-offline-guard')) return;
        btn.setAttribute('data-offline-guard', 'true');
        btn.style.opacity = '0.45';
        btn.style.pointerEvents = 'none';
        btn.title = 'AI对话 - 在线后可用';

        var badge = document.createElement('span');
        badge.id = 'chat-offline-badge';
        badge.style.cssText = [
            'position:absolute',
            'top:-4px',
            'right:-4px',
            'background:#EF7D57',
            'color:#fff',
            'font-size:9px',
            'font-family:"Press Start 2P",monospace',
            'padding:2px 4px',
            'border-radius:2px',
            'border:1px solid #5D275D',
            'line-height:1.2',
            'pointer-events:none',
            'white-space:nowrap',
            'z-index:10'
        ].join(';');
        badge.textContent = '离线';
        btn.style.position = 'relative';
        if (!btn.querySelector('#chat-offline-badge')) {
            btn.appendChild(badge);
        }
    }

    function _restoreChat() {
        var btn = document.getElementById('chat-toggle-btn') ||
                  document.querySelector('.chat-toggle-btn') ||
                  document.querySelector('[data-feature="chat"]');
        if (btn) {
            btn.removeAttribute('data-offline-guard');
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
            btn.title = '';
            var badge = btn.querySelector('#chat-offline-badge');
            if (badge) badge.remove();
        }
    }

    // ========== VisionAR 灰化 ==========
    function _guardVisionAR() {
        var btns = document.querySelectorAll('.ar-vision-btn, #vision-ar-btn, [data-feature="vision-ar"]');
        btns.forEach(function(btn) {
            if (btn.hasAttribute('data-offline-guard')) return;
            btn.setAttribute('data-offline-guard', 'true');
            btn.style.opacity = '0.45';
            btn.style.pointerEvents = 'none';
            btn.title = '场景识别 - 在线后可用';
        });
    }

    function _restoreVisionAR() {
        var btns = document.querySelectorAll('[data-offline-guard]');
        btns.forEach(function(btn) {
            btn.removeAttribute('data-offline-guard');
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
            btn.title = '';
        });
    }

    _init();
    return {};
})();

window.FeatureGuard = FeatureGuard;
