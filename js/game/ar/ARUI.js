/**
 * 校园RPG - AR界面模块
 * AR入口按钮、内部UI、异常提示、像素风格
 * @version 1.0.0
 */

var ARUI = (function () {
    'use strict';

    // ============================================
    // 内部状态
    // ============================================
    var _btnAR = null;         // AR入口按钮
    var _arContainer = null;   // AR内部UI容器
    var _panel = null;         // 当前交互面板
    var _errorModal = null;    // 错误提示框
    var _initialized = false;
    var _lostRetryCount = 0;    // 标记丢失重试次数
    var _lostRetryTimer = null; // 重试计时器
    var _lostRetryMax = 3;     // 最大重试次数

    // ============================================
    // DB32 像素风格 CSS（动态注入）
    // ============================================
    var PIXEL_STYLE_ID = 'ar-pixel-style';

    function injectStyles() {
        if (document.getElementById(PIXEL_STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = PIXEL_STYLE_ID;
        style.textContent = [
            '/* AR 像素风格基础 */',
            '#ar-btn-entry {',
            '  position: fixed; bottom: 90px; right: 20px; z-index: 998;',
            '  background: #1D2B53; color: #FFF1E8;',
            '  border: 3px solid #FFF1E8;',
            '  padding: 8px 14px; font-size: 13px; font-family: monospace;',
            '  cursor: pointer; image-rendering: pixelated;',
            '  box-shadow: 4px 4px 0 #000;',
            '  display: flex; align-items: center; gap: 6px;',
            '  transition: transform 0.1s;',
            '}',
            '#ar-btn-entry:hover { transform: scale(1.05); }',
            '#ar-btn-entry:active { transform: scale(0.95) translate(2px, 2px); box-shadow: 2px 2px 0 #000; }',
            '#ar-btn-entry::before { content: ""; display: inline-block; width: 12px; height: 12px; background: #29ADFF; border: 2px solid #FFF1E8; }',
            '',
            '/* AR 内部 UI */',
            '#ar-ui-container { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 10000; }',
            '#ar-btn-back {',
            '  position: fixed; top: 16px; left: 16px; z-index: 10001; pointer-events: all;',
            '  background: #7E2553; color: #FFF1E8;',
            '  border: 3px solid #FFF1E8;',
            '  padding: 6px 12px; font-size: 12px; font-family: monospace;',
            '  cursor: pointer; image-rendering: pixelated;',
            '  box-shadow: 3px 3px 0 #000;',
            '}',
            '#ar-btn-back:hover { background: #FF004D; }',
            '#ar-scan-tip {',
            '  position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); z-index: 10001; pointer-events: none;',
            '  background: rgba(29,43,83,0.9); color: #FFF1E8;',
            '  border: 2px solid #29ADFF;',
            '  padding: 8px 20px; font-size: 13px; font-family: monospace;',
            '  text-align: center; image-rendering: pixelated;',
            '}',
            '#ar-hint-tip {',
            '  position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); z-index: 10001; pointer-events: none;',
            '  background: rgba(126,37,83,0.9); color: #FFCCAA;',
            '  border: 2px solid #FF77A8;',
            '  padding: 6px 16px; font-size: 12px; font-family: monospace;',
            '  text-align: center; display: none;',
            '}',
            '',
            '/* AR 交互面板 */',
            '#ar-content-panel {',
            '  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10002;',
            '  background: #1D2B53; color: #FFF1E8;',
            '  border: 4px solid #FFF1E8;',
            '  padding: 20px; min-width: 280px; max-width: 360px;',
            '  font-family: monospace; font-size: 13px;',
            '  box-shadow: 6px 6px 0 #000; image-rendering: pixelated;',
            '  pointer-events: all;',
            '}',
            '#ar-content-panel .ar-panel-title {',
            '  font-size: 16px; color: #FFEC27; margin-bottom: 12px; border-bottom: 2px solid #29ADFF; padding-bottom: 8px;',
            '  display: flex; align-items: center; gap: 8px;',
            '}',
            '#ar-content-panel .ar-panel-body { color: #C2C3C7; margin-bottom: 16px; line-height: 1.6; }',
            '#ar-content-panel .ar-panel-reward { background: rgba(0,0,0,0.3); padding: 8px; margin: 8px 0; border-left: 3px solid #00E436; }',
            '#ar-content-panel .ar-panel-reward .reward-item { color: #FFEC27; }',
            '#ar-content-panel .ar-panel-actions { display: flex; gap: 10px; justify-content: flex-end; }',
            '#ar-panel-btn-confirm, #ar-panel-btn-close {',
            '  padding: 6px 16px; font-size: 12px; font-family: monospace;',
            '  cursor: pointer; border: 2px solid; image-rendering: pixelated;',
            '}',
            '#ar-panel-btn-confirm { background: #008751; color: #FFF1E8; border-color: #00E436; }',
            '#ar-panel-btn-close { background: transparent; color: #C2C3C7; border-color: #5F574F; }',
            '#ar-panel-btn-confirm:hover { background: #00E436; }',
            '#ar-panel-btn-close:hover { border-color: #FFF1E8; color: #FFF1E8; }',
            '',
            '/* AR 错误提示 */',
            '#ar-error-modal {',
            '  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10003;',
            '  background: #1D2B53; color: #FFF1E8;',
            '  border: 4px solid #FF004D;',
            '  padding: 24px; min-width: 300px; max-width: 400px;',
            '  font-family: monospace; font-size: 13px; text-align: center;',
            '  box-shadow: 6px 6px 0 #000; image-rendering: pixelated;',
            '  pointer-events: all;',
            '}',
            '#ar-error-modal .ar-error-title { color: #FF004D; font-size: 15px; margin-bottom: 12px; }',
            '#ar-error-modal .ar-error-msg { color: #FFCCAA; margin-bottom: 16px; line-height: 1.6; }',
            '#ar-error-btn {',
            '  background: #FF004D; color: #FFF1E8; border: 3px solid #FFF1E8;',
            '  padding: 8px 24px; font-size: 13px; font-family: monospace; cursor: pointer;',
            '  box-shadow: 3px 3px 0 #000; image-rendering: pixelated;',
            '}',
            '#ar-error-btn:hover { background: #FF77A8; }',
            '#ar-overlay {',
            '  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;',
            '  background: rgba(0,0,0,0.5); z-index: 10001; pointer-events: none;',
            '}',
            '',
            '/* AR 底部提示条（识别状态专用，统一 showARHint 使用） */',
            '#ar-hint-bar {',
            '  position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);',
            '  z-index: 10002; pointer-events: none;',
            '  max-width: 90vw; min-width: 200px;',
            '  padding: 8px 20px; font-size: 11px; font-family: monospace;',
            '  text-align: center; white-space: nowrap;',
            '  image-rendering: pixelated;',
            '  box-shadow: 4px 4px 0 rgba(0,0,0,0.5);',
            '  animation: hintBarIn 0.2s ease;',
            '}',
            '#ar-hint-bar.scanning {',
            '  background: rgba(41,173,255,0.9); color: #FFF1E8; border: 2px solid #FFF1E8;',
            '}',
            '#ar-hint-bar.success {',
            '  background: rgba(0,135,81,0.95); color: #A7F070; border: 2px solid #A7F070;',
            '}',
            '#ar-hint-bar.retrying {',
            '  background: rgba(126,37,83,0.95); color: #FFCCAA; border: 2px solid #FF77A8;',
            '}',
            '#ar-hint-bar.lost {',
            '  background: rgba(255,0,77,0.9); color: #FFF1E8; border: 2px solid #FF77A8;',
            '}',
            '#ar-hint-bar.cooldown {',
            '  background: rgba(93,39,93,0.95); color: #FFCD75; border: 2px solid #B13E53;',
            '}',
            '#ar-hint-bar::before { content: attr(data-prefix); margin-right: 6px; }',
            '@keyframes hintBarIn {',
            '  from { opacity: 0; transform: translateX(-50%) translateY(10px); }',
            '  to   { opacity: 1; transform: translateX(-50%) translateY(0); }',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // ============================================
    // 创建 AR 入口按钮
    // ============================================
    function _createEntryButton() {
        if (_btnAR) return;
        injectStyles();
        _btnAR = document.createElement('button');
        _btnAR.id = 'ar-btn-entry';
        _btnAR.innerHTML = '<span>AR探索</span>';
        _btnAR.title = 'AR校园探索 - 扫描标记解锁惊喜';
        _btnAR.style.display = 'none';
        _btnAR.addEventListener('click', _onEntryClick);
        document.body.appendChild(_btnAR);
    }

    // ============================================
    // 创建 AR 内部 UI
    // ============================================
    function _createARInternalUI() {
        if (_arContainer) return;
        _arContainer = document.createElement('div');
        _arContainer.id = 'ar-ui-container';
        _arContainer.innerHTML =
            '<div id="ar-overlay"></div>' +
            '<button id="ar-btn-back" title="返回游戏">[ 返回 ]</button>' +
            '<div id="ar-scan-tip">📷 对准校园标记扫描解锁惊喜</div>' +
            '<div id="ar-hint-tip"></div>';
        document.body.appendChild(_arContainer);

        document.getElementById('ar-btn-back').addEventListener('click', _onBackClick);

        // 10秒后显示帮助提示
        setTimeout(function () {
            var hint = document.getElementById('ar-hint-tip');
            if (hint) {
                hint.textContent = '💡 请确保光线充足，标记完整在画面中';
                hint.style.display = 'block';
            }
        }, 10000);
    }

    // ============================================
    // 显示 / 隐藏内部 UI
    // ============================================
    function showInternalUI() {
        if (!_arContainer) _createARInternalUI();
        _arContainer.style.display = 'block';
        document.getElementById('ar-overlay').style.display = 'block';
    }

    function hideInternalUI() {
        if (_arContainer) _arContainer.style.display = 'none';
    }

    // ============================================
    // 显示扫描提示
    // ============================================
    function showScanTip(msg) {
        var tip = document.getElementById('ar-scan-tip');
        if (tip) tip.textContent = msg || '📷 对准校园标记扫描解锁惊喜';
    }

    // ============================================
    // 统一识别状态提示条
    // type: scanning | success | retrying | lost | cooldown
    // duration: 自动消失时间(ms)，0 表示不自动消失
    // ============================================
    var _PREFIX_MAP = {
        scanning: '📷',
        success:  '🎉',
        retrying: '🔄',
        lost:     '❌',
        cooldown: '⏰'
    };

    function showARHint(type, msg, duration) {
        var bar = document.getElementById('ar-hint-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ar-hint-bar';
            document.body.appendChild(bar);
        }
        // 清除所有类型 class
        ['scanning', 'success', 'retrying', 'lost', 'cooldown'].forEach(function (c) {
            bar.classList.remove(c);
        });
        bar.classList.add(type);
        bar.setAttribute('data-prefix', _PREFIX_MAP[type] || '');
        bar.textContent = msg;

        if (duration > 0) {
            clearTimeout(bar._hideTimer);
            bar._hideTimer = setTimeout(function () {
                bar.style.opacity = '0';
                setTimeout(function () { bar.style.opacity = ''; }, 200);
            }, duration);
        }
    }

    function hideARHint() {
        var bar = document.getElementById('ar-hint-bar');
        if (bar && bar.parentNode) {
            bar.parentNode.removeChild(bar);
        }
    }

    // ============================================
    // 显示交互面板
    // ============================================
    function showContentPanel(config) {
        // 关闭旧面板
        hideContentPanel();
        ARContentManager.pause();

        _panel = document.createElement('div');
        _panel.id = 'ar-content-panel';

        var rewardHtml = '';
        if (config.reward) {
            var items = [];
            if (config.reward.gold) items.push('<div class="reward-item">+ ' + config.reward.gold + ' 金币</div>');
            if (config.reward.experience) items.push('<div class="reward-item">+ ' + config.reward.experience + ' 经验</div>');
            if (config.reward.energy) items.push('<div class="reward-item">+ ' + config.reward.energy + ' 精力</div>');
            if (config.reward.seed) items.push('<div class="reward-item">+ ' + config.reward.seed + ' 种子</div>');
            if (config.reward.rareItem) items.push('<div class="reward-item">+ ' + config.reward.rareItem + ' 道具</div>');
            if (items.length > 0) {
                rewardHtml = '<div class="ar-panel-reward">' + items.join('') + '</div>';
            }
        }

        _panel.innerHTML =
            '<div class="ar-panel-title">' + (config.icon || '🎁') + ' ' + (config.title || 'AR发现') + '</div>' +
            '<div class="ar-panel-body">' + (config.dialog || '') + rewardHtml + '</div>' +
            '<div class="ar-panel-actions">' +
            '<button id="ar-panel-btn-close">返回</button>' +
            '<button id="ar-panel-btn-confirm">' + (config.actionLabel || '领取奖励') + '</button>' +
            '</div>';
        document.body.appendChild(_panel);

        document.getElementById('ar-panel-btn-confirm').addEventListener('click', function () {
            if (config.onConfirm) config.onConfirm();
            hideContentPanel();
        });
        document.getElementById('ar-panel-btn-close').addEventListener('click', function () {
            if (config.onClose) config.onClose();
            hideContentPanel();
        });
    }

    function hideContentPanel() {
        if (_panel && _panel.parentNode) {
            _panel.parentNode.removeChild(_panel);
        }
        _panel = null;
        ARContentManager.resume();
    }

    // ============================================
    // 显示错误提示
    // ============================================
    function showError(msg, showBackButton) {
        if (_errorModal) hideError();
        injectStyles();
        _errorModal = document.createElement('div');
        _errorModal.id = 'ar-error-modal';
        _errorModal.innerHTML =
            '<div class="ar-error-title">⚠️ AR 出错</div>' +
            '<div class="ar-error-msg">' + msg + '</div>' +
            '<button id="ar-error-btn">' + (showBackButton ? '返回游戏' : '关闭') + '</button>';
        document.body.appendChild(_errorModal);
        document.getElementById('ar-error-btn').addEventListener('click', function () {
            hideError();
            ARCore.closeAR();
        });
    }

    function hideError() {
        if (_errorModal && _errorModal.parentNode) {
            _errorModal.parentNode.removeChild(_errorModal);
        }
        _errorModal = null;
    }

    // ============================================
    // 显示冷却提示
    // ============================================
    function showCooldownTip(markerName, remaining) {
        // 冷却时间超过 6 小时（约 21600 秒）视为"今天已解锁"场景
        if (remaining > 21600) {
            showARHint('cooldown', '该标记今日已解锁，明天再来吧', 4000);
        } else {
            var mins = Math.floor(remaining / 60);
            var secs = remaining % 60;
            showARHint('cooldown', markerName + ' 冷却中 (' + mins + '分' + secs + '秒)', 3000);
        }
    }

    // ============================================
    // 入口按钮点击
    // ============================================
    async function _onEntryClick() {
        var env = ARCore.checkEnvironment();
        if (!env.ok) {
            showError(env.msg, true);
            return;
        }
        // 记录AR开启时间，用于识别耗时统计
        ARUI._arStartTime = Date.now();
        var ok = await ARCore.openAR();
        if (!ok) return;
        showInternalUI();
        showARHint('scanning', '请对准校园标记，保持画面稳定', 0);
        _setupAREvents();
    }

    function showEntryButton() {
        if (_btnAR) _btnAR.style.display = '';
    }

    function hideEntryButton() {
        if (_btnAR) _btnAR.style.display = 'none';
    }

    // ============================================
    // 导航栏 AR 按钮点击（暴露给外部调用）
    // ============================================
    async function toggleAR() {
        await _onEntryClick();
    }

    // ============================================
    // 返回按钮点击
    // ============================================
    function _onBackClick() {
        _lostRetryCount = 0;
        clearTimeout(_lostRetryTimer);
        _lostRetryTimer = null;
        ARCore.closeAR();
        hideInternalUI();
        hideContentPanel();
        hideError();
        hideARHint();
        _teardownAREvents();
    }

    // ============================================
    // 绑定 AR 事件
    // ============================================
    function _setupAREvents() {
        // AR 错误事件
        document.addEventListener('ar-error', _onARError);
        // 标记找到事件
        document.addEventListener('ar-marker-found', _onMarkerFound);
        // 标记丢失事件
        document.addEventListener('ar-marker-lost', _onMarkerLost);
        // 冷却事件
        document.addEventListener('ar-marker-cooldown', _onMarkerCooldown);
        // 内容点击事件
        document.addEventListener('ar-content-clicked', _onContentClicked);
    }

    function _teardownAREvents() {
        document.removeEventListener('ar-error', _onARError);
        document.removeEventListener('ar-marker-found', _onMarkerFound);
        document.removeEventListener('ar-marker-lost', _onMarkerLost);
        document.removeEventListener('ar-marker-cooldown', _onMarkerCooldown);
        document.removeEventListener('ar-content-clicked', _onContentClicked);
    }

    // ============================================
    // 事件处理
    // ============================================
    function _onARError(e) {
        showError(e.detail.message, true);
    }

    function _onMarkerFound(e) {
        var marker = e.detail.marker;
        // 重置丢失重试计数
        _lostRetryCount = 0;
        clearTimeout(_lostRetryTimer);
        _lostRetryTimer = null;
        // 显示识别成功提示，2秒后自动消失
        showARHint('success', '识别成功！解锁AR内容', 2000);
        showScanTip('✅ 发现: ' + marker.name + ' - 点击领取奖励！');
        ARContentManager.onMarkerFound(marker);

        // 埋点：AR识别成功（使用AR开启时间作为识别起点）
        if (typeof BehaviorTrack !== 'undefined') {
            var startTime = ARUI._arStartTime || Date.now();
            BehaviorTrack.trackARMarkerFound(marker.id, Date.now() - startTime);
        }
    }

    function _onMarkerLost(e) {
        _lostRetryCount++;
        if (_lostRetryCount <= _lostRetryMax) {
            showARHint('retrying', '标记丢失，正在重试 (' + _lostRetryCount + '/' + _lostRetryMax + ')', 2500);
            clearTimeout(_lostRetryTimer);
            _lostRetryTimer = setTimeout(function () {
                _lostRetryCount = Math.min(_lostRetryCount, _lostRetryMax);
            }, 5000);
        } else {
            showARHint('lost', '请移动到光线充足的地方重试', 0);
        }
        ARContentManager.onMarkerLost(e.detail.markerId);
    }

    function _onMarkerCooldown(e) {
        var marker = ImageMarker.getMarkerConfig(e.detail.markerId);
        showCooldownTip(marker ? marker.name : '标记', e.detail.remaining);
    }

    async function _onContentClicked(e) {
        var markerId = e.detail.markerId;
        var contentData = e.detail.contentData;
        var marker = ImageMarker.getMarkerConfig(markerId);

        if (!marker) return;

        // 震动反馈（移动端）
        if (navigator.vibrate) navigator.vibrate(50);

        // 显示交互面板
        showContentPanel({
            icon: _getContentIcon(marker.contentType),
            title: marker.name,
            dialog: marker.dialog,
            reward: marker.reward,
            onConfirm: async function () {
                // 触发内容：动画 + 发放奖励
                ARContentManager.triggerContent(markerId);

                // 调用集成模块发放奖励
                if (typeof ARIntegration !== 'undefined') {
                    await ARIntegration.unlockMarkerReward(markerId);
                    await ARIntegration.logBehavior('reward_claimed', markerId);
                    await ARIntegration.checkARAchievements();
                }

                // 如果有任务，同步任务
                if (marker.taskId && typeof ARIntegration !== 'undefined') {
                    await ARIntegration.syncARTask(marker.taskId);
                }

                showScanTip('🎉 奖励已发放！继续探索吧！');
            }
        });
    }

    function _getContentIcon(type) {
        return { story: '📜', npc: '👨‍🏫', task: '📋', treasure: '🎁', buff: '🍔' }[type] || '🎁';
    }

    // ============================================
    // 初始化
    // ============================================
    function init() {
        if (_initialized) return;
        injectStyles();
        _createEntryButton();
        _initialized = true;
        console.log('[ARUI] AR界面模块初始化完成');
    }

    function destroy() {
        clearTimeout(_lostRetryTimer);
        _lostRetryCount = 0;
        if (_btnAR && _btnAR.parentNode) _btnAR.parentNode.removeChild(_btnAR);
        if (_arContainer && _arContainer.parentNode) _arContainer.parentNode.removeChild(_arContainer);
        if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
        if (_errorModal && _errorModal.parentNode) _errorModal.parentNode.removeChild(_errorModal);
        var hintBar = document.getElementById('ar-hint-bar');
        if (hintBar && hintBar.parentNode) hintBar.parentNode.removeChild(hintBar);
        _btnAR = null;
        _arContainer = null;
        _panel = null;
        _errorModal = null;
        _initialized = false;
    }

    return {
        init: init,
        destroy: destroy,
        toggleAR: toggleAR,
        showEntryButton: showEntryButton,
        hideEntryButton: hideEntryButton,
        showContentPanel: showContentPanel,
        hideContentPanel: hideContentPanel,
        showError: showError,
        hideError: hideError,
        showScanTip: showScanTip,
        showCooldownTip: showCooldownTip,
        showARHint: showARHint,
        hideARHint: hideARHint,
        showInternalUI: showInternalUI,
        hideInternalUI: hideInternalUI
    };
})();

window.ARUI = ARUI;
