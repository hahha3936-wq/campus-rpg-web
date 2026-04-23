/**
 * 校园RPG - 剧情对话系统
 * 像素风格对话气泡、角色头像、NPC表情变化、分支选择
 */

(function() {
    'use strict';

    const StoryDialogue = {
        _queue: [],
        _currentIndex: 0,
        _isPlaying: false,
        _overlay: null,

        /**
         * 播放对话序列
         * @param {Array} dialogues - [{speaker, text, emotion}]
         * @param {Function} onComplete - 完成后回调
         * @param {Function} onChoice - 分支选择回调
         */
        play(dialogues, onComplete, onChoice) {
            if (!dialogues || dialogues.length === 0) {
                if (onComplete) onComplete();
                return;
            }
            this._queue = dialogues;
            this._currentIndex = 0;
            this._onComplete = onComplete;
            this._onChoice = onChoice;
            this._showDialogue(dialogues[0]);
        },

        _showDialogue(dlg) {
            if (this._overlay) this._overlay.remove();

            const overlay = document.createElement('div');
            overlay.id = 'sd-overlay';
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:11000;',
                'background:rgba(0,0,0,0.85);',
                'display:flex;align-items:flex-end;justify-content:center;',
                'padding-bottom:40px;',
                'animation:sdFadeIn 0.2s ease;'
            ].join('');
            overlay.innerHTML = this._buildDialogue(dlg);
            document.body.appendChild(overlay);
            this._overlay = overlay;
            this._bindOverlayEvents(overlay, dlg);
            this._typewriter(overlay.querySelector('#sd-text'), dlg.text);
        },

        _buildDialogue(dlg) {
            const emotion = dlg.emotion || 'normal';
            const avatarMap = {
                'naruto': { emoji: '\uD83C\uDF93', color: '#FFA300' },
                'sasuke': { emoji: '\uD83D\uDC64', color: '#5F574F' },
                'canteen_aunt': { emoji: '\uD83D\uDC69\u200D\uD83C\uDF73', color: '#FF6B6B' },
                'library_keeper': { emoji: '\uD83D\uDCDA', color: '#29ADFF' },
                'system': { emoji: '\u2728', color: '#FFCD75' },
                'normal': { emoji: '\uD83D\uDC64', color: '#C2C3C7' }
            };
            const info = avatarMap[dlg.speaker] || avatarMap[emotion] || avatarMap['normal'];
            const emotionIcon = this._getEmotionIcon(emotion);

            return `
                <style>
                @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
                @keyframes sdFadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
                #sd-box{
                    width:90vw;max-width:600px;
                    background:#1D2B53;
                    border:3px solid ${info.color};
                    border-radius:4px;
                    box-shadow:4px 4px 0 #000,0 0 20px ${info.color}30;
                    overflow:hidden;
                    animation:sdBoxIn 0.3s cubic-bezier(0.34,1.56,0.64,1);
                }
                @keyframes sdBoxIn{from{transform:scale(0.9);}to{transform:scale(1);}}
                #sd-header{background:linear-gradient(180deg,${info.color}30,transparent);padding:10px 16px;display:flex;align-items:center;gap:10px;border-bottom:2px solid ${info.color}40;}
                #sd-avatar{font-size:28px;}
                #sd-speaker{font-size:11px;color:${info.color};font-weight:700;flex:1;}
                #sd-emotion{font-size:14px;}
                #sd-content{padding:14px 16px;}
                #sd-text{font-size:13px;color:#F4F4F4;line-height:1.9;min-height:48px;}
                #sd-continue{
                    display:inline-block;padding:4px 8px;margin-top:10px;
                    font-size:8px;color:#5F574F;font-family:'Press Start 2P',monospace;
                    animation:sdbounce 1s infinite;
                }
                @keyframes sdbounce{0%,100%{opacity:1;}50%{opacity:0.3;}}
                #sd-progress{font-size:8px;color:#5F574F;margin-top:8px;font-family:'Press Start 2P',monospace;}
                .sd-choice-btn{
                    display:block;width:100%;padding:10px;margin-top:8px;
                    background:#0d1b3e;border:2px solid #5F574F;border-radius:3px;
                    color:#F4F4F4;font-size:12px;text-align:left;cursor:pointer;
                    transition:all 0.2s;
                }
                .sd-choice-btn:hover{background:#5D275D;border-color:#B13E53;}
                </style>
                <div id="sd-box">
                    <div id="sd-header">
                        <span id="sd-avatar">${info.emoji}</span>
                        <span id="sd-speaker">${dlg.speaker || '未知角色'}</span>
                        <span id="sd-emotion">${emotionIcon}</span>
                    </div>
                    <div id="sd-content">
                        <div id="sd-text"></div>
                        <div id="sd-continue">\u25BA 点击继续</div>
                    </div>
                    <div id="sd-progress">${this._currentIndex + 1}/${this._queue.length}</div>
                </div>`;
        },

        _typewriter(el, text) {
            if (!el) return;
            let i = 0;
            el.textContent = '';
            const interval = setInterval(() => {
                if (i < text.length) {
                    el.textContent += text[i];
                    i++;
                } else {
                    clearInterval(interval);
                }
            }, 30);
            el.dataset.typingInterval = interval;
        },

        _bindOverlayEvents(overlay, dlg) {
            const box = overlay.querySelector('#sd-box');
            overlay.addEventListener('click', (e) => {
                const textEl = overlay.querySelector('#sd-text');
                const interval = parseInt(textEl.dataset.typingInterval);
                if (interval) {
                    clearInterval(interval);
                    textEl.textContent = dlg.text;
                    textEl.dataset.typingInterval = '';
                    return;
                }
                this._advance();
            });
        },

        _advance() {
            if (this._currentIndex < this._queue.length - 1) {
                this._currentIndex++;
                this._showDialogue(this._queue[this._currentIndex]);
            } else {
                this._finish();
            }
        },

        _finish() {
            if (this._overlay) {
                this._overlay.remove();
                this._overlay = null;
            }
            if (this._onComplete) {
                this._onComplete();
            }
        },

        _getEmotionIcon(emotion) {
            const map = {
                'excited': '\uD83D\uDE0E',
                'happy': '\uD83D\uDE0A',
                'normal': '\uD83D\uDC64',
                'cold': '\uD83D\uDE10',
                'serious': '\uD83D\uDE20',
                'hint': '\uD83D\uDCAD',
                'thoughtful': '\uD83E\uDD14',
                'emotional': '\uD83D\uDE22'
            };
            return map[emotion] || map['normal'];
        },

        close() {
            if (this._overlay) {
                this._overlay.remove();
                this._overlay = null;
            }
            this._queue = [];
            this._currentIndex = 0;
        }
    };

    window.StoryDialogue = StoryDialogue;
})();
