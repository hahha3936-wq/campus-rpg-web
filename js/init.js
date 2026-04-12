/**
 * 校园RPG - 全局初始化模块
 * 所有页面加载时自动恢复用户设置（主题等）
 */

(function() {
    'use strict';

    /**
     * 恢复深色模式设置
     * 从 localStorage 读取并应用到 body
     */
    function restoreDarkMode() {
        const savedDark = localStorage.getItem('darkMode');
        if (savedDark === '1') {
            document.body.classList.add('dark-mode');
            // 同时勾选设置面板中的开关（如果存在）
            const toggle = document.getElementById('darkmode-toggle');
            if (toggle) toggle.checked = true;
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    /**
     * 恢复动画设置
     */
    function restoreAnimation() {
        const savedAnimation = localStorage.getItem('animation');
        if (savedAnimation === '0') {
            document.body.classList.add('no-animation');
            const toggle = document.getElementById('animation-toggle');
            if (toggle) toggle.checked = false;
        }
    }

    /**
     * 恢复音量设置
     */
    function restoreSound() {
        const savedSound = localStorage.getItem('sound');
        if (savedSound === '0') {
            if (window.SoundManager) {
                SoundManager.toggle(false);
            }
        }
    }

    /**
     * 绑定设置开关的事件监听
     * 必须在 DOM 加载完成后执行
     */
    function bindSettingsListeners() {
        // 深色模式开关
        const darkToggle = document.getElementById('darkmode-toggle');
        if (darkToggle) {
            darkToggle.addEventListener('change', function() {
                const isDark = this.checked;
                document.body.classList.toggle('dark-mode', isDark);
                localStorage.setItem('darkMode', isDark ? '1' : '0');
            });
        }

        // 动画开关
        const animToggle = document.getElementById('animation-toggle');
        if (animToggle) {
            animToggle.addEventListener('change', function() {
                const hasAnim = this.checked;
                document.body.classList.toggle('no-animation', !hasAnim);
                localStorage.setItem('animation', hasAnim ? '1' : '0');
            });
        }

        // 音效开关
        const soundToggle = document.getElementById('sound-toggle');
        if (soundToggle) {
            soundToggle.addEventListener('change', function() {
                const hasSound = this.checked;
                localStorage.setItem('sound', hasSound ? '1' : '0');
                if (window.SoundManager) {
                    SoundManager.toggle(hasSound);
                }
            });
        }
    }

    /**
     * 执行所有初始化
     */
    function init() {
        restoreDarkMode();
        restoreAnimation();
        restoreSound();
        bindSettingsListeners();
    }

    // DOM 加载完成后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 导出到全局
    window.AppInit = { restoreDarkMode, restoreAnimation, restoreSound, bindSettingsListeners, init };
})();
