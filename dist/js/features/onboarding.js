/**
 * 校园RPG - 首次使用引导模块
 * 引导新用户了解核心功能
 */

const Onboarding = {
    STEPS: [
        {
            target: null,
            title: '欢迎来到校园RPG！',
            content: '在这里，你的大学生活将变成一场精彩的游戏冒险！🎮\n\n「阿游」——校园RPG主脑，将作为你的专属AI助手，陪你一起成长！',
            icon: '🎮'
        },
        {
            target: '#gold-display',
            title: '角色状态',
            content: '顶部显示你的等级和金币数量。通过完成任务、签到、探索校园来获取经验和金币，提升等级！',
            icon: '⭐'
        },
        {
            target: '.status-section',
            title: '四大状态值',
            content: '⚡能量：决定你能完成多少任务\n🎯专注：影响番茄钟效率\n😊心情：影响学习状态\n😰压力：过高会降低效率',
            icon: '📊'
        },
        {
            target: '.action-grid',
            title: '核心功能',
            content: '在这里你可以：\n📋管理任务（主线/支线/日常）\n🏆解锁成就\n🎒使用道具\n🍅使用番茄钟提升专注力',
            icon: '🎯'
        },
        {
            target: '.npc-section',
            title: 'NPC互动',
            content: '漩涡鸣人老师和宇智波佐助助教将陪伴你的校园生活。与他们互动可以提升好感度，解锁特殊对话！',
            icon: '🍥'
        },
        {
            target: '.quick-btn-signin',
            title: '每日签到',
            content: '每天签到可以获得经验值和金币奖励！连续签到天数越长，奖励越丰厚哦！🔥',
            icon: '📅'
        },
        {
            target: '#exploration-btn',
            title: '校园探索 🆕',
            content: '全新功能！点击探索按钮，打开校园地图，发现校园中的各个地点。\n\n每个地点都有独特的Buff、隐藏事件和探索成就！\n\n与AI「阿游」一起，揭开校园的秘密吧！',
            icon: '🗺️'
        }
    ],

    _currentStep: 0,
    _overlay: null,
    _tooltip: null,
    _spotlight: null,

    /**
     * 检查是否需要显示引导
     */
    shouldShow() {
        const user = AppState?.user || Auth?.getUser();
        if (!user) return false;
        // 如果已完成探索成就中的"初次探索"或已解锁任何成就，认为用户已熟悉
        const hasSeenOnboarding = localStorage.getItem('campus_rpg_onboarding_seen');
        return !hasSeenOnboarding;
    },

    /**
     * 开始引导
     */
    start() {
        if (!this.shouldShow()) return;

        this._currentStep = 0;
        this._createOverlay();
        this._showStep(0);
    },

    /**
     * 创建遮罩层
     */
    _createOverlay() {
        if (this._overlay) return;

        const overlay = document.createElement('div');
        overlay.id = 'onboarding-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 9990;
            background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(overlay);
        this._overlay = overlay;

        // 点击遮罩可跳过
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.next();
        });
    },

    /**
     * 显示指定步骤
     */
    _showStep(index) {
        const step = this.STEPS[index];
        if (!step) {
            this.finish();
            return;
        }

        // 清除旧高亮
        this._clearSpotlight();

        if (step.target) {
            this._showSpotlight(step.target);
        }

        this._renderTooltip(step, index);
    },

    /**
     * 高亮目标元素
     */
    _showSpotlight(selector) {
        const target = document.querySelector(selector);
        if (!target) return;

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
            const rect = target.getBoundingClientRect();
            const padding = 6;

            const spotlight = document.createElement('div');
            spotlight.id = 'onboarding-spotlight';
            spotlight.style.cssText = `
                position: fixed;
                left: ${rect.left - padding}px;
                top: ${rect.top - padding}px;
                width: ${rect.width + padding * 2}px;
                height: ${rect.height + padding * 2}px;
                border: 3px solid #667eea;
                border-radius: 12px;
                box-shadow: 0 0 0 9999px rgba(0,0,0,0.65);
                animation: spotlightPulse 2s ease-in-out infinite;
                z-index: 9991;
                pointer-events: none;
                transition: all 0.4s ease;
            `;
            document.body.appendChild(spotlight);
            this._spotlight = spotlight;

            // 添加脉冲动画
            const style = document.createElement('style');
            style.id = 'onboarding-style';
            style.textContent = `
                @keyframes spotlightPulse {
                    0%, 100% { box-shadow: 0 0 0 4px rgba(102,126,234,0.4), 0 0 0 9999px rgba(0,0,0,0.65); }
                    50% { box-shadow: 0 0 0 8px rgba(102,126,234,0.2), 0 0 0 9999px rgba(0,0,0,0.65); }
                }
            `;
            if (!document.getElementById('onboarding-style')) {
                document.head.appendChild(style);
            }
        }, 300);
    },

    /**
     * 清除高亮
     */
    _clearSpotlight() {
        this._spotlight?.remove();
        this._spotlight = null;
    },

    /**
     * 渲染引导提示框
     */
    _renderTooltip(step, index) {
        this._tooltip?.remove();

        const tooltip = document.createElement('div');
        tooltip.id = 'onboarding-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            bottom: 40px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #1a1a2e, #252540);
            border: 1px solid rgba(102,126,234,0.4);
            border-radius: 16px;
            padding: 20px 24px;
            max-width: 420px;
            width: 90vw;
            z-index: 9992;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            animation: tooltipIn 0.4s cubic-bezier(0.34,1.56,0.64,1);
        `;

        const progressDots = this.STEPS.map((_, i) =>
            `<div style="width:8px;height:8px;border-radius:50%;background:${i === index ? '#667eea' : 'rgba(102,126,234,0.3)'};transition:all 0.3s;"></div>`
        ).join('<div style="width:8px;"></div>');

        tooltip.innerHTML = `
            <style>
                @keyframes tooltipIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                }
            </style>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <span style="font-size:32px;">${step.icon}</span>
                <h3 style="margin:0;font-size:18px;font-weight:700;color:#fff;">${step.title}</h3>
            </div>
            <div style="color:#cbd5e1;font-size:14px;line-height:1.7;white-space:pre-line;margin-bottom:16px;">
                ${step.content}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;gap:4px;align-items:center;">
                    ${progressDots}
                </div>
                <div style="display:flex;gap:8px;">
                    ${index > 0 ? `<button id="onb-prev" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#94a3b8;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;">上一步</button>` : ''}
                    <button id="onb-next" style="background:linear-gradient(135deg,#667eea,#764ba2);border:none;color:#fff;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">
                        ${index === this.STEPS.length - 1 ? '开始探索！' : '下一步'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(tooltip);
        this._tooltip = tooltip;

        // 绑定按钮
        document.getElementById('onb-next')?.addEventListener('click', () => this.next());
        document.getElementById('onb-prev')?.addEventListener('click', () => this.prev());
    },

    /**
     * 下一步
     */
    next() {
        this._currentStep++;
        if (this._currentStep >= this.STEPS.length) {
            this.finish();
        } else {
            this._showStep(this._currentStep);
        }
    },

    /**
     * 上一步
     */
    prev() {
        if (this._currentStep > 0) {
            this._currentStep--;
            this._showStep(this._currentStep);
        }
    },

    /**
     * 完成引导
     */
    finish() {
        this._clearSpotlight();
        this._tooltip?.remove();
        this._overlay?.remove();

        this._tooltip = null;
        this._overlay = null;
        this._spotlight = null;

        // 标记已完成
        localStorage.setItem('campus_rpg_onboarding_seen', 'true');

        // 显示欢迎提示
        showNotification('欢迎开始你的校园冒险！点击右下角聊天按钮与阿游对话', 'success');

        // 播放探索音效
        if (window.SoundManager) {
            SoundManager.play('discover');
        }
    },

    /**
     * 重置引导（用于调试）
     */
    reset() {
        localStorage.removeItem('campus_rpg_onboarding_seen');
    }
};

// 导出
window.Onboarding = Onboarding;
