/**
 * 校园RPG - 离线状态全局提示组件
 *
 * 样式与项目像素风统一：
 * - 使用 DB32 复古调色板（--info: #73EFF7）
 * - 2px 圆角 + 像素风边框
 * - Press Start 2P 像素字体风格
 * - 固定在顶部，不遮挡核心功能
 */
const OfflineBanner = (() => {
    var _banner = null;

    function _createBanner() {
        _banner = document.createElement('div');
        _banner.id = 'offline-banner';
        Object.assign(_banner.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            zIndex: '10001',
            display: 'none',
            textAlign: 'center',
            padding: '8px 16px',
            fontSize: '12px',
            fontFamily: "'Press Start 2P', 'Noto Sans SC', monospace",
            letterSpacing: '0.5px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            borderBottom: '3px solid #5D275D',
            background: 'linear-gradient(180deg, #29366F 0%, #1a2248 100%)',
            color: '#FFCD75',
            lineHeight: '1.5'
        });

        var icon = document.createElement('span');
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" ' +
            'style="vertical-align:middle;margin-right:8px;image-rendering:pixelated;">' +
            '<rect x="1" y="10" width="3" height="3" fill="#EF7D57"/>' +
            '<rect x="5.5" y="7" width="3" height="6" fill="#EF7D57"/>' +
            '<rect x="10" y="3" width="3" height="10" fill="#EF7D57"/>' +
            '</svg>';
        icon.style.display = 'inline-block';

        var text = document.createElement('span');
        text.id = 'offline-banner-text';
        text.textContent = '当前处于离线模式，核心功能可正常使用';

        _banner.appendChild(icon);
        _banner.appendChild(text);
        document.body.insertBefore(_banner, document.body.firstChild);
    }

    function _show() {
        if (!_banner) _createBanner();
        if (_banner.style.display === 'flex') return;
        _banner.style.display = 'flex';
        _banner.style.alignItems = 'center';
        _banner.style.justifyContent = 'center';
        _banner.style.opacity = '1';
    }

    function _hide() {
        if (!_banner) return;
        _banner.style.opacity = '0';
        _banner.style.transition = 'opacity 0.5s';
        setTimeout(function() {
            if (_banner) _banner.style.display = 'none';
        }, 500);
    }

    window.addEventListener('network-change', function(e) {
        if (!e.detail.online) {
            _show();
        } else {
            _hide();
        }
    });

    if (window.isOnline === false) {
        setTimeout(_show, 100);
    }

    return { show: _show, hide: _hide };
})();

window.OfflineBanner = OfflineBanner;
