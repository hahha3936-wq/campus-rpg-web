/**
 * 校园RPG - 剧情线索收集系统
 * 线索发现通知、收集面板、拼接动画
 */

(function() {
    'use strict';

    const StoryClue = {
        _panel: null,

        /**
         * 显示线索发现通知动画
         * @param {Object} clue - {id, name, description, rarity}
         */
        showNotification(clue) {
            const rarityColors = {
                'common': '#C2C3C7',
                'rare': '#29ADFF',
                'epic': '#B13E53',
                'legendary': '#FFCD75'
            };
            const color = rarityColors[clue.rarity] || rarityColors.common;
            const rarityLabels = {
                'common': '普通',
                'rare': '稀有',
                'epic': '史诗',
                'legendary': '传说'
            };

            const notification = document.createElement('div');
            notification.id = 'sc-notification';
            notification.style.cssText = [
                'position:fixed;top:80px;right:20px;z-index:11050;',
                'width:280px;padding:14px;',
                `background:#1D2B53;border:3px solid ${color};border-radius:4px;`,
                'box-shadow:4px 4px 0 #000,0 0 20px ' + color + '40;',
                'animation:scSlideIn 0.4s cubic-bezier(0.34,1.56,0.64,1);',
                'font-family:"Noto Sans SC",sans-serif;'
            ].join('');
            notification.innerHTML = `
                <style>
                @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
                @keyframes scSlideIn{from{opacity:0;transform:translateX(100px);}to{opacity:1;transform:translateX(0);}}
                @keyframes scGlow{0%,100%{box-shadow:4px 4px 0 #000,0 0 10px '${color}'40;}50%{box-shadow:4px 4px 0 #000,0 0 25px '${color}'80;}}
                #sc-notification{animation:scSlideIn 0.4s cubic-bezier(0.34,1.56,0.64,1);}
                .sc-rarity{font-size:8px;font-family:'Press Start 2P',monospace;color:${color};}
                .sc-title{font-size:13px;color:#F4F4F4;font-weight:700;margin:4px 0;}
                .sc-desc{font-size:11px;color:#C2C3C7;line-height:1.6;}
                .sc-icon{font-size:24px;margin-right:8px;}
                </style>
                <div class="sc-rarity">\u2B50 ${rarityLabels[clue.rarity] || '普通'}线索</div>
                <div style="display:flex;align-items:center;margin:6px 0;">
                    <span class="sc-icon">\uD83D\uDCDD</span>
                    <div class="sc-title">${clue.name}</div>
                </div>
                <div class="sc-desc">${clue.description || ''}</div>`;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'scSlideIn 0.3s reverse ease';
                setTimeout(() => notification.remove(), 300);
            }, 4000);
        },

        /**
         * 打开线索收集面板
         */
        async openPanel() {
            if (this._panel) { this._panel.remove(); this._panel = null; }

            try {
                const resp = await window.Auth.apiFetch('/api/story/clues');
                if (!resp || !resp.ok) return;
                const data = await resp.json();
                this._renderPanel(data);
            } catch (e) {
                console.error('[StoryClue] 加载线索数据失败:', e);
            }
        },

        _renderPanel(data) {
            const panel = document.createElement('div');
            panel.id = 'sc-overlay';
            panel.style.cssText = [
                'position:fixed;inset:0;z-index:10995;',
                'background:rgba(0,0,0,0.85);',
                'display:flex;align-items:center;justify-content:center;'
            ].join('');
            panel.innerHTML = this._css() + this._buildPanelHTML(data);
            document.body.appendChild(panel);
            this._panel = panel;

            panel.querySelector('#sc-close').addEventListener('click', () => this.closePanel());
            panel.addEventListener('click', (e) => { if (e.target === panel) this.closePanel(); });
        },

        _buildPanelHTML(data) {
            const collected = data.collected_count || 0;
            const total = data.total_count || 0;
            const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
            const byStage = data.by_stage || {};

            const stageHtml = Object.entries(byStage).map(([stage, clues]) => {
                const done = clues.filter(c => c.is_collected).length;
                const colors = { '新生适应期': '#29ADFF', '学业成长期': '#00E436', '实习准备期': '#FFA300', '毕业冲刺期': '#B13E53' };
                const color = colors[stage] || '#29ADFF';
                const rarityColors = { 'common': '#C2C3C7', 'rare': '#29ADFF', 'epic': '#B13E53', 'legendary': '#FFCD75' };

                return `
                <div class="sc-stage">
                    <div class="sc-stage-header" style="border-left:3px solid ${color};">
                        <span>${stage}</span>
                        <span style="font-size:9px;color:${color};">${done}/${clues.length}</span>
                    </div>
                    <div class="sc-clue-list">
                        ${clues.map(c => `
                        <div class="sc-clue-item ${c.is_collected ? 'sc-clue-collected' : ''}" data-clue-id="${c.id}">
                            <span class="sc-clue-icon">${c.is_collected ? '\u2705' : '\u2753'}</span>
                            <div class="sc-clue-info">
                                <div class="sc-clue-name" style="color:${rarityColors[c.rarity] || '#C2C3C7'};">
                                    ${c.name}
                                </div>
                                <div class="sc-clue-source">${c.source}</div>
                            </div>
                            ${c.stitch_done ? '<span style="color:#00E436;font-size:9px;">\uD83D\uDDF3 已拼接</span>' : ''}
                        </div>`).join('')}
                    </div>
                </div>`;
            }).join('');

            return `
                <div id="sc-container" style="
                    width:94vw;max-width:620px;max-height:88vh;
                    background:#1D2B53;border:3px solid #FFF1E8;border-radius:4px;
                    display:flex;flex-direction:column;overflow:hidden;
                    box-shadow:6px 6px 0 #000;animation:msModalIn 0.3s ease;">
                    <div style="background:linear-gradient(180deg,#5D275D,#3a1940);border-bottom:3px solid #B13E53;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:16px;">\uD83D\uDCDD</span>
                            <span style="font-size:9px;color:#FFCD75;font-family:'Press Start 2P',monospace;">线索收集</span>
                        </div>
                        <button id="sc-close" style="background:transparent;border:2px solid #5F574F;color:#C2C3C7;width:28px;height:28px;cursor:pointer;border-radius:2px;">\u2715</button>
                    </div>
                    <div style="background:#0d1b3e;padding:10px 16px;border-bottom:2px solid #5D275D;display:flex;align-items:center;gap:12px;">
                        <span style="font-size:9px;color:#C2C3C7;font-family:'Press Start 2P',monospace;white-space:nowrap;">收集进度</span>
                        <div style="flex:1;height:8px;background:#1a1a2e;border:2px solid #5F574F;border-radius:2px;">
                            <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#29ADFF,#00E436);border-radius:1px;transition:width 0.4s;"></div>
                        </div>
                        <span style="font-size:9px;color:#FFCD75;font-family:'Press Start 2P',monospace;white-space:nowrap;">${collected}/${total}</span>
                    </div>
                    <div style="flex:1;overflow-y:auto;padding:12px;scrollbar-width:thin;scrollbar-color:#5D275D #0d1b3e;">
                        ${stageHtml || '<div style="text-align:center;padding:30px;color:#5F574F;">暂无线索数据</div>'}
                    </div>
                </div>`;
        },

        _css() {
            return `<style>
            @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
            @keyframes msModalIn{from{opacity:0;transform:scale(0.9);}to{opacity:1;transform:scale(1);}}
            .sc-stage{margin-bottom:16px;}
            .sc-stage-header{display:flex;justify-content:space-between;padding:6px 8px;background:#0d1b3e;border-radius:3px;font-size:11px;color:#F4F4F4;font-weight:700;margin-bottom:6px;}
            .sc-clue-list{display:flex;flex-direction:column;gap:4px;}
            .sc-clue-item{display:flex;align-items:center;gap:8px;padding:8px;background:#0d1b3e;border:1px solid #5F574F;border-radius:3px;transition:all 0.2s;}
            .sc-clue-item.sc-clue-collected{opacity:0.8;border-color:#00E43640;}
            .sc-clue-icon{font-size:14px;flex-shrink:0;}
            .sc-clue-info{flex:1;min-width:0;}
            .sc-clue-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            .sc-clue-source{font-size:10px;color:#5F574F;margin-top:2px;}
            @media(max-width:480px){ .sc-clue-item{padding:6px;} }
            </style>`;
        },

        closePanel() {
            if (this._panel) { this._panel.remove(); this._panel = null; }
        },

        /**
         * 收集线索
         */
        async collect(clueId) {
            try {
                const resp = await window.Auth.apiFetch('/api/story/clues/collect', {
                    method: 'POST',
                    body: JSON.stringify({ clue_id: clueId })
                });
                if (resp && resp.ok) {
                    const data = await resp.json();
                    if (!data.already_collected) {
                        this.showNotification(data.clue);
                    }
                    return data;
                }
            } catch (e) {
                console.error('[StoryClue] 收集线索失败:', e);
            }
            return null;
        },

        /**
         * 拼接线索组
         */
        async stitch(stitchGroupId) {
            try {
                const resp = await window.Auth.apiFetch('/api/story/clues/stitch', {
                    method: 'POST',
                    body: JSON.stringify({ stitch_group_id: stitchGroupId })
                });
                if (resp && resp.ok) {
                    const data = await resp.json();
                    if (data.success) {
                        window.showNotification(data.reward?.message || ('线索拼接 ' + data.group_name + ' 成功！'), 'success');
                    } else {
                        window.showNotification('线索不足：还需要 ' + data.missing_count + ' 条线索才能拼接', 'info');
                    }
                    return data;
                }
            } catch (e) {
                console.error('[StoryClue] 拼接线索失败:', e);
            }
            return null;
        }
    };

    window.StoryClue = StoryClue;
})();
