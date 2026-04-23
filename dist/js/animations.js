/**
 * 校园RPG - 动画控制模块
 * 负责各种游戏化动画效果的播放
 */

const Animations = {
    // ============================================
    // 基础动画
    // ============================================
    
    /**
     * 淡入动画
     */
    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.display = 'block';
        
        let start = null;
        const animate = (timestamp) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            const opacity = Math.min(progress / duration, 1);
            
            element.style.opacity = opacity;
            
            if (progress < duration) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    },
    
    /**
     * 淡出动画
     */
    fadeOut(element, duration = 300) {
        let start = null;
        const startOpacity = parseFloat(getComputedStyle(element).opacity) || 1;
        
        const animate = (timestamp) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            const opacity = startOpacity * (1 - progress / duration);
            
            element.style.opacity = Math.max(opacity, 0);
            
            if (progress < duration) {
                requestAnimationFrame(animate);
            } else {
                element.style.display = 'none';
            }
        };
        
        requestAnimationFrame(animate);
    },
    
    /**
     * 弹跳动画
     */
    bounce(element, times = 3) {
        let count = 0;
        const originalTransform = element.style.transform;
        
        const bounceAnimation = () => {
            if (count >= times) {
                element.style.transform = originalTransform;
                return;
            }
            
            element.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                element.style.transform = originalTransform;
                count++;
                setTimeout(bounceAnimation, 100);
            }, 100);
        };
        
        bounceAnimation();
    },
    
    /**
     * 脉冲动画
     */
    pulse(element) {
        element.classList.add('animate-pulse');
        setTimeout(() => element.classList.remove('animate-pulse'), 2000);
    },
    
    /**
     * 摇晃动画
     */
    shake(element) {
        element.classList.add('animate-shake');
        setTimeout(() => element.classList.remove('animate-shake'), 500);
    },
    
    // ============================================
    // 游戏特效
    // ============================================
    
    /**
     * 经验值飞涨动画
     */
    expGainPopup(amount, x, y) {
        const popup = document.createElement('div');
        popup.className = 'exp-popup';
        popup.textContent = `+${amount} 经验`;
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
        
        document.body.appendChild(popup);
        
        setTimeout(() => popup.remove(), 1000);
    },
    
    /**
     * 金币飞涨动画
     */
    goldGainPopup(amount, x, y) {
        const popup = document.createElement('div');
        popup.className = 'gold-popup';
        popup.textContent = `+${amount} 金币`;
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
        
        document.body.appendChild(popup);
        
        setTimeout(() => popup.remove(), 1000);
    },
    
    /**
     * 等级提升特效
     */
    levelUp(level) {
        const overlay = document.createElement('div');
        overlay.className = 'level-up-overlay';
        overlay.innerHTML = `
            <div class="level-up-content">
                <div class="level-up-title">🎉 等级提升!</div>
                <div class="level-up-number">Lv.${level}</div>
                <div class="level-up-rewards">
                    <span class="level-up-reward">💰 +50 金币</span>
                    <span class="level-up-reward">🎁 神秘礼物</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // 播放音效
        this.playSound('levelup');
        
        setTimeout(() => overlay.remove(), 3000);
    },
    
    /**
     * 任务完成动画
     */
    taskComplete(taskName) {
        const overlay = document.createElement('div');
        overlay.className = 'task-complete-overlay';
        overlay.innerHTML = `
            <div class="task-complete-icon">✅</div>
            <div class="task-complete-text">${taskName} 完成!</div>
        `;
        
        document.body.appendChild(overlay);
        this.playSound('complete');
        
        setTimeout(() => overlay.remove(), 1500);
    },
    
    /**
     * 成就解锁通知
     */
    achievementUnlock(achievementName, icon = '🏆') {
        const notification = document.createElement('div');
        notification.className = 'achievement-unlock-notification';
        notification.innerHTML = `
            <div class="achievement-unlock-icon">${icon}</div>
            <div class="achievement-unlock-title">✨ 成就解锁!</div>
            <div class="achievement-unlock-name">${achievementName}</div>
        `;
        
        document.body.appendChild(notification);
        this.playSound('achievement');
        
        setTimeout(() => notification.remove(), 3000);
    },
    
    /**
     * 数字滚动动画
     */
    countUp(element, start, end, duration = 1000) {
        const startTime = performance.now();
        const diff = end - start;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // 使用缓动函数
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + diff * easeProgress);
            
            element.textContent = current;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    },
    
    /**
     * 进度条动画
     */
    animateProgressBar(element, from, to, duration = 500) {
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = from + (to - from) * progress;
            element.style.width = `${current}%`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    },
    
    /**
     * 随机事件转盘动画
     */
    spinWheel(element, callback) {
        let rotation = 0;
        const totalRotation = 1800 + Math.random() * 1800; // 旋转5-10圈
        
        const startTime = performance.now();
        const duration = 3000;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // 缓出效果
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            rotation = totalRotation * easeProgress;
            
            element.style.transform = `rotate(${rotation}deg)`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // 旋转结束，触发回调
                if (callback) callback();
            }
        };
        
        requestAnimationFrame(animate);
    },
    
    // ============================================
    // 粒子效果
    // ============================================
    
    /**
     * 创建粒子爆发
     */
    particleBurst(x, y, count = 10, color = '#667eea') {
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            particle.style.background = color;
            particle.style.width = `${Math.random() * 10 + 5}px`;
            particle.style.height = particle.style.width;
            
            const angle = (Math.PI * 2 / count) * i;
            const velocity = Math.random() * 100 + 50;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity;
            
            document.body.appendChild(particle);
            
            let posX = x;
            let posY = y;
            let opacity = 1;
            
            const animate = () => {
                posX += vx * 0.016;
                posY += vy * 0.016 + 2; // 添加重力
                opacity -= 0.02;
                
                particle.style.left = `${posX}px`;
                particle.style.top = `${posY}px`;
                particle.style.opacity = opacity;
                
                if (opacity > 0) {
                    requestAnimationFrame(animate);
                } else {
                    particle.remove();
                }
            };
            
            requestAnimationFrame(animate);
        }
    },
    
    /**
     * 星星闪烁效果
     */
    starBurst(x, y) {
        this.particleBurst(x, y, 20, '#ffd700');
    },
    
    // ============================================
    // 按钮效果
    // ============================================
    
    /**
     * 涟漪效果
     */
    ripple(event, element) {
        const rect = element.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'ripple-effect';
        
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
        
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    },
    
    /**
     * 按钮点击反馈
     */
    buttonClick(element) {
        this.ripple(event, element);
        this.pulse(element);
    },
    
    // ============================================
    // 音效系统
    // ============================================
    
    sounds: {},
    
    /**
     * 初始化音效
     */
    initSounds() {
        // 使用 Web Audio API 创建简单音效
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        this.audioContext = new AudioContext();
        
        // 预定义音效
        this.soundGenerators = {
            click: () => this.playTone(800, 0.1, 'sine'),
            success: () => this.playTone(523, 0.2, 'sine'),
            complete: () => this.playChord([523, 659, 784], 0.3),
            levelup: () => this.playMelody([523, 659, 784, 1047], 0.15),
            achievement: () => this.playChord([392, 523, 659], 0.4),
            error: () => this.playTone(200, 0.3, 'sawtooth'),
            coin: () => this.playTone(1200, 0.05, 'sine'),
            exp: () => this.playTone(880, 0.1, 'sine')
        };
    },
    
    /**
     * 播放单音
     */
    playTone(frequency, duration, type = 'sine') {
        if (!this.audioContext) this.initSounds();
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    },
    
    /**
     * 播放和弦
     */
    playChord(frequencies, duration) {
        frequencies.forEach(freq => {
            setTimeout(() => this.playTone(freq, duration, 'sine'), 0);
        });
    },
    
    /**
     * 播放旋律
     */
    playMelody(frequencies, noteDuration) {
        frequencies.forEach((freq, index) => {
            setTimeout(() => this.playTone(freq, noteDuration, 'sine'), index * noteDuration * 1000);
        });
    },
    
    /**
     * 播放音效
     */
    playSound(soundName) {
        if (!AppState.settings.sound) return;
        if (this.soundGenerators && this.soundGenerators[soundName]) {
            this.soundGenerators[soundName]();
        }
    },
    
    // ============================================
    // 工具方法
    // ============================================
    
    /**
     * 延迟执行
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    /**
     * 顺序执行动画
     */
    async sequence(animations) {
        for (const anim of animations) {
            await anim();
            await this.delay(100);
        }
    }
};

// 导出
window.Animations = Animations;

// ============================================
// 快捷调用函数
// ============================================

/**
 * 播放点击音效
 */
function playClickSound() {
    Animations.playSound('click');
}

/**
 * 播放成功音效
 */
function playSuccessSound() {
    Animations.playSound('success');
}

/**
 * 播放完成音效
 */
function playCompleteSound() {
    Animations.playSound('complete');
}

/**
 * 播放等级提升音效
 */
function playLevelUpSound() {
    Animations.playSound('levelup');
}

/**
 * 播放成就解锁音效
 */
function playAchievementSound() {
    Animations.playSound('achievement');
}

/**
 * 创建点击涟漪效果
 */
function addRippleEffect(event, element) {
    Animations.ripple(event, element);
}
