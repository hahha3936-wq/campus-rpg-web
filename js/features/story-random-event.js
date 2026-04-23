/**
 * 校园RPG - 剧情随机事件与时间彩蛋系统
 * 随机事件触发、时间彩蛋检查、剧情事件通知
 */

(function() {
    'use strict';

    const StoryRandomEvent = {
        _cooldown: false,
        _eventCache: null,
        _checkInterval: null,
        _triggeredToday: new Set(),

        /**
         * 初始化事件系统
         */
        init() {
            // 每5分钟检查一次时间彩蛋
            this._checkInterval = setInterval(() => {
                this._checkTimeEasterEgg();
            }, 5 * 60 * 1000);

            // 页面加载时检查一次
            this._checkTimeEasterEgg();
        },

        /**
         * 销毁事件系统
         */
        destroy() {
            if (this._checkInterval) {
                clearInterval(this._checkInterval);
                this._checkInterval = null;
            }
        },

        /**
         * 加载剧情事件数据
         */
        async _loadEvents() {
            if (this._eventCache) return this._eventCache;
            try {
                const resp = await fetch('data/story_events.json');
                if (resp.ok) {
                    this._eventCache = await resp.json();
                    return this._eventCache;
                }
            } catch (e) {
                console.error('[StoryRandomEvent] 加载事件数据失败:', e);
            }
            return null;
        },

        /**
         * 检查时间彩蛋
         * 特定时间段自动触发
         */
        _checkTimeEasterEgg() {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();
            const timeKey = `${hour}:${minute}`;

            // 防重复触发：同一个分钟只触发一次
            if (this._triggeredToday.has(timeKey)) return;

            // 早自习彩蛋 7:00-7:05
            if (hour === 7 && minute < 5) {
                this._triggerTimeEvent('evt_time_001');
                this._triggeredToday.add(timeKey);
                return;
            }

            // 深夜食堂 22:00-22:05
            if (hour === 22 && minute < 5) {
                this._triggerTimeEvent('evt_time_002');
                this._triggeredToday.add(timeKey);
                return;
            }

            // 深夜自习 23:00-23:05
            if (hour === 23 && minute < 5) {
                this._triggerTimeEvent('evt_time_006');
                this._triggeredToday.add(timeKey);
                return;
            }
        },

        async _triggerTimeEvent(eventId) {
            const data = await this._loadEvents();
            if (!data) return;
            const event = (data.events || []).find(e => e.event_id === eventId);
            if (event) {
                this._showEventNotification(event);
            }
        },

        /**
         * 触发随机事件（10%概率）
         */
        async triggerRandomEvent(force = false) {
            if (this._cooldown) return null;
            if (!force && Math.random() > 0.1) return null;

            this._cooldown = true;
            setTimeout(() => { this._cooldown = false; }, 30000); // 30秒冷却

            const data = await this._loadEvents();
            if (!data) return null;

            // 过滤可用事件（检查cooldown和条件）
            const now = new Date();
            const hour = now.getHours();
            const available = (data.events || []).filter(e => {
                if (e.category !== 'random') return false;
                if (e.trigger_chance < 0.05) return false;
                // 检查时间条件
                const cond = e.trigger_conditions || {};
                if (cond.time) {
                    const [start, end] = cond.time.split('-');
                    const h = parseInt(start);
                    if (hour < h || hour > parseInt(end)) return false;
                }
                return true;
            });

            if (available.length === 0) return null;

            const event = available[Math.floor(Math.random() * available.length)];
            return this._showEventNotification(event);
        },

        /**
         * 显示事件通知
         */
        _showEventNotification(event) {
            const categoryColors = {
                'random': '#FFA300',
                'time': '#29ADFF',
                'exploration': '#00E436',
                'npc': '#B13E53',
                'achievement': '#FFCD75',
                'festival': '#FF6B6B'
            };
            const color = categoryColors[event.category] || '#FFA300';

            const notification = document.createElement('div');
            notification.id = 'sre-notification';
            notification.style.cssText = [
                'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:11050;',
                'width:90vw;max-width:400px;',
                `background:#1D2B53;border:3px solid ${color};border-radius:4px;`,
                'box-shadow:4px 4px 0 #000,0 0 25px ' + color + '40;',
                'animation:sreSlideDown 0.4s cubic-bezier(0.34,1.56,0.64,1);',
                'font-family:"Noto Sans SC",sans-serif;cursor:pointer;'
            ].join('');
            notification.innerHTML = `
                <style>
                @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
                @keyframes sreSlideDown{from{opacity:0;transform:translateX(-50%) translateY(-30px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}
                .sre-header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:2px solid ${color}30;}
                .sre-icon{font-size:20px;}
                .sre-label{font-size:8px;color:${color};font-family:'Press Start 2P',monospace;}
                .sre-body{padding:12px 14px;}
                .sre-name{font-size:13px;color:#F4F4F4;font-weight:700;margin-bottom:6px;}
                .sre-desc{font-size:11px;color:#C2C3C7;line-height:1.7;}
                .sre-effects{margin-top:8px;font-size:10px;color:#00E436;line-height:1.7;}
                </style>
                <div class="sre-header">
                    <span class="sre-icon">\uD83C\uDFB2</span>
                    <span class="sre-label">${event.category === 'time' ? '时间彩蛋' : event.category === 'festival' ? '节日事件' : '随机事件'}</span>
                </div>
                <div class="sre-body">
                    <div class="sre-name">${event.name}</div>
                    <div class="sre-desc">${event.description}</div>
                    ${event.dialogue ? `<div style="font-size:11px;color:${color};margin-top:6px;font-style:italic;">"${event.dialogue.text}"</div>` : ''}
                    <div class="sre-effects">${this._formatEffects(event.effects)}</div>
                </div>`;
            document.body.appendChild(notification);

            // 点击事件关闭并应用效果
            notification.addEventListener('click', async () => {
                notification.style.animation = 'sreSlideDown 0.2s reverse ease';
                setTimeout(() => notification.remove(), 200);
                await this._applyEventEffects(event);
            });

            // 5秒后自动关闭
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'sreSlideDown 0.2s reverse ease';
                    setTimeout(() => notification.remove(), 200);
                }
            }, 6000);
        },

        _formatEffects(effects) {
            if (!effects) return '';
            let parts = [];
            if (effects.experience) parts.push(`\u2B50 经验+${effects.experience}`);
            if (effects.gold) parts.push(`\uD83D\uDCB0 金币${effects.gold > 0 ? '+' : ''}${effects.gold}`);
            if (effects.focus) parts.push(`\uD83C\uDFAF 专注+${effects.focus}`);
            if (effects.mood) parts.push(`\uD83D\uDE0A 心情+${effects.mood}`);
            if (effects.stress) parts.push(`\uD83D\uDCA1 压力${effects.stress > 0 ? '+' : ''}${effects.stress}`);
            if (effects.reward) {
                if (effects.reward.type === 'item') parts.push(`\uD83C\uDF81 获得道具：${effects.reward.description || effects.reward.id}`);
                if (effects.reward.type === 'buff') parts.push(`\u2728 获得Buff：${effects.reward.name}`);
                if (effects.reward.type === 'clue') parts.push(`\uD83D\uDCDD 获得线索`);
            }
            return parts.join(' | ');
        },

        async _applyEventEffects(event) {
            const effects = event.effects;
            if (!effects) return;

            // 应用属性变化
            try {
                if (effects.experience || effects.gold) {
                    await window.Auth.apiFetch('/api/user/experience', {
                        method: 'POST',
                        body: JSON.stringify({ experience: effects.experience || 0, gold: effects.gold || 0 })
                    });
                }
                if (effects.focus !== undefined || effects.mood !== undefined || effects.stress !== undefined) {
                    await window.Auth.apiFetch('/api/user/stats', {
                        method: 'POST',
                        body: JSON.stringify({
                            energy: effects.focus !== undefined ? effects.focus : 0,
                            mood: effects.mood || 0,
                            stress: effects.stress || 0
                        })
                    });
                }
            } catch (e) {
                console.error('[StoryRandomEvent] 应用事件效果失败:', e);
            }

            // 收集线索
            if (event.story_clue && window.StoryClue) {
                await window.StoryClue.collect(event.story_clue);
            }

            // 刷新UI
            if (window.AppState && window.AppState.refresh) {
                window.AppState.refresh();
            }
        },

        /**
         * 获取所有可用事件
         */
        async getAvailableEvents() {
            const data = await this._loadEvents();
            if (!data) return [];
            const now = new Date();
            const hour = now.getHours();
            return (data.events || []).filter(e => {
                if (e.category !== 'random') return false;
                const cond = e.trigger_conditions || {};
                if (cond.time) {
                    const [start, end] = cond.time.split('-');
                    if (hour < parseInt(start) || hour > parseInt(end)) return false;
                }
                return true;
            });
        }
    };

    window.StoryRandomEvent = StoryRandomEvent;
})();
