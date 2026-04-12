/**
 * 校园RPG - 音效系统
 * 基于 Web Audio API 的程序化音效
 */

const SoundManager = {
    ctx: null,
    enabled: true,
    _initialized: false,

    /**
     * 初始化音频上下文（需用户交互后才能调用）
     */
    init() {
        if (this._initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._initialized = true;
            this.enabled = AppState.settings?.sound !== false;
        } catch (e) {
            console.warn('音效系统初始化失败:', e);
        }
    },

    /**
     * 播放音效
     * @param {string} type - 音效类型
     */
    play(type) {
        if (!this.enabled || !this.ctx) return;

        // 用户交互后恢复上下文
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        switch (type) {
            case 'levelup':    this._levelUp(); break;
            case 'complete':   this._complete(); break;
            case 'achievement': this._achievement(); break;
            case 'explore':    this._explore(); break;
            case 'buff':       this._buff(); break;
            case 'hidden_event': this._hiddenEvent(); break;
            case 'click':      this._click(); break;
            case 'signin':     this._signin(); break;
            case 'discover':   this._discover(); break;
            default:           this._click(); break;
        }
    },

    /**
     * 升级音效
     */
    _levelUp() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.1);
        osc.frequency.setValueAtTime(784, now + 0.2);
        osc.frequency.setValueAtTime(1047, now + 0.3);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

        osc.start(now);
        osc.stop(now + 0.6);
    },

    /**
     * 任务完成音效
     */
    _complete() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1100, now + 0.08);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.start(now);
        osc.stop(now + 0.3);
    },

    /**
     * 成就解锁音效
     */
    _achievement() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const freqs = [523, 659, 784, 1047, 1319];

        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.12);

            gain.gain.setValueAtTime(0, now + i * 0.12);
            gain.gain.linearRampToValueAtTime(0.25, now + i * 0.12 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.4);

            osc.start(now + i * 0.12);
            osc.stop(now + i * 0.12 + 0.5);
        });
    },

    /**
     * 探索发现音效
     */
    _explore() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // 神秘感的上行音效
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(220, now);
        osc1.frequency.exponentialRampToValueAtTime(440, now + 0.5);
        osc2.frequency.setValueAtTime(330, now);
        osc2.frequency.exponentialRampToValueAtTime(660, now + 0.5);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.7);
        osc2.stop(now + 0.7);
    },

    /**
     * Buff 激活音效
     */
    _buff() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1000, now + 0.1);
        osc.frequency.setValueAtTime(1200, now + 0.2);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.4);
    },

    /**
     * 隐藏事件发现音效
     */
    _hiddenEvent() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const freqs = [300, 450, 600, 450, 900];

        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = i % 2 === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);

            gain.gain.setValueAtTime(0.2, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.25);

            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.3);
        });
    },

    /**
     * 按钮点击音效
     */
    _click() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        osc.start(now);
        osc.stop(now + 0.08);
    },

    /**
     * 签到音效
     */
    _signin() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const freqs = [523, 659, 784, 659, 784];

        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.15);

            gain.gain.setValueAtTime(0.18, now + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.3);

            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.35);
        });
    },

    /**
     * 新地点发现音效
     */
    _discover() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // 清脆的上升音效
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(392, now);
        osc1.frequency.exponentialRampToValueAtTime(784, now + 0.3);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(523, now);
        osc2.frequency.exponentialRampToValueAtTime(1047, now + 0.3);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.5);
        osc2.stop(now + 0.5);
    },

    /**
     * 开关音效
     */
    toggle(enabled) {
        this.enabled = enabled;
        if (enabled) this.play('click');
    }
};

// 导出
window.SoundManager = SoundManager;
