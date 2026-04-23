/**
 * 校园RPG - 同步状态提示组件
 * 显示同步进度、同步结果提示
 */

const SyncStatusBar = (() => {
    let _bar = null;
    let _timer = null;

    function _init() {
        window.addEventListener('sync-status-change', function(e) {
            _showStatus(e.detail.status);
        });

        window.addEventListener('sync-conflict', function(e) {
            _showConflictModal(e.detail.conflicts, e.detail.resolver);
        });
    }

    function _showStatus(status) {
        if (!_bar) {
            _bar = document.createElement('div');
            _bar.id = 'sync-status-bar';
            Object.assign(_bar.style, {
                position: 'fixed',
                bottom: '80px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '8px 20px',
                borderRadius: '20px',
                fontSize: '14px',
                zIndex: '9999',
                transition: 'opacity 0.3s',
                opacity: '0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                color: '#fff',
                fontWeight: '500'
            });
            document.body.appendChild(_bar);
        }

        var messages = {
            syncing:  { text: '正在同步数据...', bg: '#3498db' },
            success:  { text: '数据同步完成', bg: '#27ae60' },
            error:    { text: '同步失败，将自动重试', bg: '#e74c3c' },
            idle:     { text: '', bg: 'transparent' }
        };

        var m = messages[status] || messages.idle;
        if (!m.text) {
            _fadeOut();
            return;
        }

        clearTimeout(_timer);
        _bar.textContent = m.text;
        _bar.style.background = m.bg;
        _bar.style.opacity = '1';

        if (status === 'success') {
            _timer = setTimeout(_fadeOut, 3000);
        }
    }

    function _fadeOut() {
        if (_bar) _bar.style.opacity = '0';
    }

    function _showConflictModal(conflicts, resolver) {
        if (document.getElementById('sync-conflict-modal')) return;

        var modal = document.createElement('div');
        modal.id = 'sync-conflict-modal';
        modal.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'width:100%',
            'height:100%',
            'background:rgba(0,0,0,0.5)',
            'z-index:10000',
            'display:flex',
            'align-items:center',
            'justify-content:center'
        ].join(';');

        var box = document.createElement('div');
        box.style.cssText = [
            'background:#fff',
            'border-radius:12px',
            'padding:24px',
            'max-width:400px',
            'width:90%',
            'color:#333'
        ].join(';');

        var listHTML = '';
        conflicts.forEach(function(c) {
            listHTML += '<div style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">' +
                '<b>' + (c.type || '') + '</b>：' + (c.entity_id || '') + '</div>';
        });

        box.innerHTML = '<h3 style="margin:0 0 16px;font-size:16px;">数据冲突</h3>' +
            '<p style="margin:0 0 12px;color:#666;font-size:13px;">' +
            '检测到 ' + conflicts.length + ' 项数据冲突，请选择保留哪方数据：' +
            '</p>' +
            '<div id="conflict-list" style="max-height:200px;overflow-y:auto;margin-bottom:16px;">' +
            listHTML + '</div>' +
            '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
            '<button id="conflict-local" style="padding:8px 16px;border:none;border-radius:6px;' +
            'background:#3498db;color:#fff;cursor:pointer;">保留本地</button>' +
            '<button id="conflict-server" style="padding:8px 16px;border:none;border-radius:6px;' +
            'background:#2ecc71;color:#fff;cursor:pointer;">使用云端</button>' +
            '</div>';

        modal.appendChild(box);
        document.body.appendChild(modal);

        box.querySelector('#conflict-local').onclick = function() {
            document.body.removeChild(modal);
            resolver(conflicts.map(function(c) { return Object.assign({}, c, { resolution: 'local' }); }));
        };
        box.querySelector('#conflict-server').onclick = function() {
            document.body.removeChild(modal);
            resolver(conflicts.map(function(c) { return Object.assign({}, c, { resolution: 'server' }); }));
        };
    }

    _init();
    return { showStatus: _showStatus };
})();

window.SyncStatusBar = SyncStatusBar;
