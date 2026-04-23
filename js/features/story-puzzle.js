/**
 * 校园RPG - AR谜题系统
 * 谜题展示、输入验证、提示系统、解谜成功动画
 */

(function() {
    'use strict';

    const StoryPuzzle = {
        _overlay: null,
        _currentPuzzleId: null,
        _hints: [],

        /**
         * 打开谜题界面
         */
        async open(puzzleId) {
            this._currentPuzzleId = puzzleId;
            if (this._overlay) { this._overlay.remove(); this._overlay = null; }

            try {
                const resp = await window.Auth.apiFetch('/api/story/puzzles');
                if (resp && resp.ok) {
                    const data = await resp.json();
                    const puzzle = (data.puzzles || []).find(p => p.puzzle_id === puzzleId);
                    if (puzzle) {
                        this._hints = puzzle.hints || [];
                        this._renderPuzzle(puzzle);
                    }
                }
            } catch (e) {
                console.error('[StoryPuzzle] 加载谜题失败:', e);
            }
        },

        _renderPuzzle(puzzle) {
            const typeIcons = { 'graphic': '\uD83D\uDCDD', 'numeric': '\u0031\u20E3', 'time': '\u23F0', 'comprehensive': '\u2B50' };
            const typeLabels = { 'graphic': '图形谜题', 'numeric': '数字谜题', 'time': '时间谜题', 'comprehensive': '综合谜题' };
            const typeIcon = typeIcons[puzzle.puzzle_type] || '\uD83C\uDFAF';
            const typeLabel = typeLabels[puzzle.puzzle_type] || '谜题';
            const diffColors = { 'easy': '#00E436', 'medium': '#FFA300', 'hard': '#B13E53' };
            const diffLabels = { 'easy': '简单', 'medium': '中等', 'hard': '困难' };
            const diffColor = diffColors[puzzle.difficulty] || '#FFA300';

            const overlay = document.createElement('div');
            overlay.id = 'sp-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:11000;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = this._css() + `
                <div id="sp-container" style="
                    width:94vw;max-width:520px;max-height:85vh;overflow-y:auto;
                    background:#1D2B53;border:3px solid #73EFF7;border-radius:4px;
                    box-shadow:6px 6px 0 #000,0 0 30px rgba(115,239,247,0.2);">
                    <div style="background:linear-gradient(180deg,#1a3a5c,#0d2540);border-bottom:3px solid #73EFF7;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:18px;">${typeIcon}</span>
                            <div>
                                <div style="font-size:10px;color:#FFCD75;font-family:'Press Start 2P',monospace;">AR解谜</div>
                                <div style="font-size:13px;color:#F4F4F4;font-weight:700;">${puzzle.name}</div>
                            </div>
                        </div>
                        <button id="sp-close" style="background:transparent;border:2px solid #5F574F;color:#C2C3C7;width:28px;height:28px;cursor:pointer;border-radius:2px;">\u2715</button>
                    </div>
                    <div style="padding:16px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                            <span style="font-size:9px;color:${diffColor};font-family:'Press Start 2P',monospace;padding:3px 8px;border:1px solid ${diffColor};border-radius:3px;">
                                ${diffLabels[puzzle.difficulty] || '中等'}
                            </span>
                            <span style="font-size:9px;color:#73EFF7;font-family:'Press Start 2P',monospace;">${typeLabel}</span>
                        </div>
                        <div style="font-size:12px;color:#F4F4F4;line-height:1.8;margin-bottom:16px;padding:12px;background:#0d1b3e;border:2px solid #5D275D;border-radius:3px;">
                            ${puzzle.description}
                        </div>
                        <div id="sp-ar-hint" style="font-size:11px;color:#FFA300;line-height:1.7;padding:10px;background:rgba(255,163,0,0.1);border-radius:3px;margin-bottom:12px;">
                            <span style="color:#FFA300;font-weight:700;">\uD83D\uDCCF AR提示：</span>${puzzle.ar_hint || '使用AR扫描指定地点获取线索'}
                        </div>
                        <div id="sp-hints-area"></div>
                        <div style="margin-bottom:12px;">
                            <input id="sp-answer" type="text" placeholder="输入你的答案..." style="
                                width:100%;padding:12px 14px;background:#0d1b3e;
                                border:2px solid #5F574F;color:#F4F4F4;font-size:14px;
                                border-radius:3px;outline:none;box-sizing:border-box;
                                transition:border-color 0.2s;" />
                        </div>
                        <div style="display:flex;gap:8px;">
                            <button id="sp-submit" class="sp-btn sp-btn-primary" style="flex:2;">\u2713 提交答案</button>
                            <button id="sp-hint" class="sp-btn sp-btn-secondary" style="flex:1;">\uD83D\uDCA1 提示</button>
                        </div>
                        <div id="sp-result" style="margin-top:12px;text-align:center;"></div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            this._overlay = overlay;

            overlay.querySelector('#sp-close').addEventListener('click', () => this.close());
            overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });

            const answerInput = overlay.querySelector('#sp-answer');
            answerInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') overlay.querySelector('#sp-submit').click();
            });
            answerInput.addEventListener('focus', () => { answerInput.style.borderColor = '#73EFF7'; });
            answerInput.addEventListener('blur', () => { answerInput.style.borderColor = '#5F574F'; });

            overlay.querySelector('#sp-submit').addEventListener('click', () => this._submitAnswer(puzzle.puzzle_id));
            overlay.querySelector('#sp-hint').addEventListener('click', () => this._getHint(puzzle.puzzle_id));
        },

        async _submitAnswer(puzzleId) {
            const overlay = this._overlay;
            if (!overlay) return;
            const answer = overlay.querySelector('#sp-answer').value.trim();
            const resultEl = overlay.querySelector('#sp-result');
            if (!answer) {
                resultEl.innerHTML = '<div style="color:#FFA300;font-size:12px;">请输入答案后再提交</div>';
                return;
            }
            const submitBtn = overlay.querySelector('#sp-submit');
            submitBtn.disabled = true; submitBtn.textContent = '验证中...';
            try {
                const resp = await window.Auth.apiFetch(`/api/story/puzzle/${puzzleId}/verify`, {
                    method: 'POST',
                    body: JSON.stringify({ answer })
                });
                const data = await resp.json();
                if (data.success) {
                    resultEl.innerHTML = `
                        <div style="animation:spSuccess 0.5s ease;">
                            <div style="font-size:28px;margin-bottom:8px;">\uD83C\uDF89</div>
                            <div style="color:#00E436;font-size:11px;font-family:'Press Start 2P',monospace;">回答正确！</div>
                            <div style="color:#F4F4F4;font-size:12px;margin-top:8px;line-height:1.7;">
                                ${data.reward?.experience ? `\u2B50 经验 +${data.reward.experience}<br>` : ''}
                                ${data.reward?.gold ? `\uD83D\uDCB0 金币 +${data.reward.gold}<br>` : ''}
                                ${data.hidden_scene ? `\uD83D\uDDFA 解锁隐藏场景：${data.hidden_scene}` : ''}
                            </div>
                        </div>`;
                    submitBtn.textContent = '已解答';
                    window.showNotification(`谜题「${data.puzzle_name}」解答成功！`, 'success');
                    setTimeout(() => this.close(), 3000);
                } else {
                    resultEl.innerHTML = `<div style="color:#B13E53;font-size:12px;">${data.message || '答案不正确，请再试试！'}</div>`;
                    submitBtn.disabled = false; submitBtn.textContent = '提交答案';
                    answerInput = overlay.querySelector('#sp-answer');
                    answerInput.style.borderColor = '#B13E53';
                    setTimeout(() => { if (answerInput) answerInput.style.borderColor = '#5F574F'; }, 1000);
                }
            } catch {
                resultEl.innerHTML = '<div style="color:#B13E53;font-size:12px;">验证失败，请检查网络</div>';
                submitBtn.disabled = false; submitBtn.textContent = '提交答案';
            }
        },

        async _getHint(puzzleId) {
            const overlay = this._overlay;
            if (!overlay) return;
            const hintsArea = overlay.querySelector('#sp-hints-area');
            try {
                const resp = await window.Auth.apiFetch(`/api/story/puzzle/${puzzleId}/hint`);
                const data = await resp.json();
                if (data.success) {
                    hintsArea.innerHTML += `
                        <div style="font-size:11px;color:#FFA300;padding:8px;background:rgba(255,163,0,0.1);border-radius:3px;margin-bottom:6px;animation:spHintIn 0.3s ease;">
                            <span style="font-weight:700;">\uD83D\uDCA1 提示${data.hint_level}：</span>${data.hint}
                        </div>`;
                } else {
                    window.showNotification(data.error || '获取提示失败', 'error');
                }
            } catch {
                window.showNotification('获取提示失败', 'error');
            }
        },

        _css() {
            return `<style>
            @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
            @keyframes spSuccess{0%{transform:scale(0.5);opacity:0;}60%{transform:scale(1.1);}100%{transform:scale(1);opacity:1;}}
            @keyframes spHintIn{from{opacity:0;transform:translateY(-5px);}to{opacity:1;transform:translateY(0);}}
            .sp-btn{
                display:inline-block;padding:10px 16px;
                font-family:'Press Start 2P',monospace;font-size:9px;
                cursor:pointer;border-width:2px;border-style:solid;
                box-shadow:2px 2px 0 rgba(0,0,0,0.5);
                transition:all 0.1s;border-radius:2px;
            }
            .sp-btn:active:not(:disabled){transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(0,0,0,0.5);}
            .sp-btn:disabled{opacity:0.5;cursor:not-allowed;}
            .sp-btn-primary{background:#008751;color:#FFF1E8;border-color:#00E436;}
            .sp-btn-primary:hover:not(:disabled){background:#00E436;}
            .sp-btn-secondary{background:transparent;color:#C2C3C7;border-color:#5F574F;}
            .sp-btn-secondary:hover:not(:disabled){border-color:#FFF1E8;color:#FFF1E8;}
            </style>`;
        },

        close() {
            if (this._overlay) { this._overlay.remove(); this._overlay = null; }
            this._currentPuzzleId = null;
            this._hints = [];
        }
    };

    window.StoryPuzzle = StoryPuzzle;
})();
