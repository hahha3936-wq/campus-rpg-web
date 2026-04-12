/**
 * 校园RPG - AR调试工具
 * 识别日志、性能监控、错误上报
 * @version 1.0.0
 */

var ARDebug = (function () {
    'use strict';

    // ============================================
    // 内部状态
    // ============================================
    var _logs = [];
    var _maxLogs = 100;
    var _enabled = false;
    var _panel = null;
    var _startTime = 0;

    // ============================================
    // 记录日志
    // ============================================
    function log(type, msg, data) {
        var entry = {
            ts: Date.now(),
            type: type,  // info | warn | error | marker
            msg: msg,
            data: data || null
        };
        _logs.push(entry);
        if (_logs.length > _maxLogs) _logs.shift();

        // 控制台输出
        var prefix = '[ARDebug][' + type.toUpperCase() + ']';
        if (type === 'error') {
            console.error(prefix, msg, data || '');
        } else if (type === 'warn') {
            console.warn(prefix, msg, data || '');
        } else {
            console.log(prefix, msg, data || '');
        }

        // 更新面板
        if (_enabled && _panel) _updatePanel();
    }

    // ============================================
    // 更新调试面板
    // ============================================
    function _updatePanel() {
        if (!_panel) return;
        var body = _panel.querySelector('.ar-debug-body');
        if (!body) return;
        body.innerHTML = _logs.slice(-20).map(function (e) {
            var time = new Date(e.ts).toLocaleTimeString('zh-CN');
            var icon = { info: 'ℹ️', warn: '⚠️', error: '❌', marker: '📍' }[e.type] || '📝';
            return '<div class="ar-debug-entry ar-debug-' + e.type + '">' + icon + ' ' + time + ' ' + e.msg + '</div>';
        }).join('');
    }

    // ============================================
    // 性能统计
    // ============================================
    function getStats() {
        var markers = window.ImageMarker ? ImageMarker.getAllMarkersState() : [];
        var ready = markers.filter(function (m) { return m.state === 'ready' || m.state === 'discovered'; }).length;
        var cooldown = markers.filter(function (m) { return m.state === 'cooldown'; }).length;
        return {
            uptime: _startTime ? Math.floor((Date.now() - _startTime) / 1000) + 's' : '0s',
            totalMarkers: markers.length,
            ready: ready,
            cooldown: cooldown,
            logCount: _logs.length
        };
    }

    // ============================================
    // 创建调试面板（开发模式）
    // ============================================
    function _createPanel() {
        if (_panel) return;
        _panel = document.createElement('div');
        _panel.id = 'ar-debug-panel';
        _panel.innerHTML =
            '<div class="ar-debug-header" style="background:#1D2B53;color:#FFF1E8;padding:6px 10px;font-size:12px;cursor:move;user-select:none;font-family:monospace;">' +
                '<span>AR调试面板</span>' +
                '<span id="ar-debug-toggle" style="float:right;cursor:pointer;">收起</span>' +
            '</div>' +
            '<div class="ar-debug-body" style="background:#000;color:#C2C3C7;font-family:monospace;font-size:11px;max-height:200px;overflow-y:auto;padding:6px;"></div>';
        document.body.appendChild(_panel);

        // 面板拖动
        var header = _panel.querySelector('.ar-debug-header');
        var dragging = false, ox, oy;
        header.addEventListener('mousedown', function (e) { dragging = true; ox = e.clientX - _panel.offsetLeft; oy = e.clientY - _panel.offsetTop; });
        document.addEventListener('mousemove', function (e) {
            if (dragging) { _panel.style.left = (e.clientX - ox) + 'px'; _panel.style.top = (e.clientY - oy) + 'px'; }
        });
        document.addEventListener('mouseup', function () { dragging = false; });

        document.getElementById('ar-debug-toggle').addEventListener('click', function () {
            var body = _panel.querySelector('.ar-debug-body');
            body.style.display = body.style.display === 'none' ? '' : 'none';
        });
    }

    // ============================================
    // 初始化
    // ============================================
    function init(enabled) {
        _enabled = enabled || false;
        _startTime = Date.now();
        if (_enabled) _createPanel();
        log('info', 'AR调试工具初始化完成', { enabled: _enabled });
    }

    function enable() {
        _enabled = true;
        _createPanel();
    }

    function disable() {
        _enabled = false;
        if (_panel) { _panel.style.display = 'none'; }
    }

    function clearLogs() {
        _logs = [];
        if (_panel) _updatePanel();
    }

    function getLogs() {
        return _logs.slice();
    }

    return {
        init: init,
        log: log,
        enable: enable,
        disable: disable,
        clearLogs: clearLogs,
        getStats: getStats,
        getLogs: getLogs
    };
})();

window.ARDebug = ARDebug;
