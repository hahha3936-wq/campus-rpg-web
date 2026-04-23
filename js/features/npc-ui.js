/**
 * 校园RPG - NPC交互界面核心模块
 * 
 * 功能职责：
 * 1. NPC列表页（分类展示已解锁/未解锁NPC）
 * 2. NPC详情对话界面（好感度、对话历史、任务）
 * 3. 彩蛋弹窗、等级提升动画、反馈效果
 * 4. 100%像素风格，响应式适配
 */

(function() {
    'use strict';

    const NPCUI = {
        _modal: null,
        _escHandler: null,
        _currentNPC: null,
        _activeCategory: 'all',
        _activeSubTab: 'dialogue',
        _typingIndicator: null,
        _isChatting: false,

        // ============================================
        // 入口方法
        // ============================================

        /**
         * 打开NPC面板
         */
        open() {
            if (this._modal) {
                // modal 对象存在，但 overlay 可能已被移除（close时移除）
                const existing = document.getElementById('npc-eco-overlay');
                if (existing) {
                    this._modal.show();
                } else {
                    this._render();
                }
                return;
            }
            this._render();
        },

        /**
         * 关闭NPC面板
         */
        close() {
            if (this._modal) {
                this._modal.remove();
            }
        },

        /**
         * 打开指定NPC详情
         */
        openNPC(npcId) {
            if (!this._modal) {
                this._render().then(() => this._showNPCDetail(npcId));
            } else {
                this._showNPCDetail(npcId);
            }
        },

        // ============================================
        // 渲染
        // ============================================

        async _render() {
            const existing = document.getElementById('npc-eco-overlay');
            if (existing) existing.remove();

            // 等待NPCEcosystem初始化
            if (window.NPCEcosystem && !NPCEcosystem._initialized) {
                await NPCEcosystem.init();
            }

            const overlay = this._createOverlay();
            document.body.appendChild(overlay);

            this._modal = {
                show: () => { overlay.style.display = 'flex'; },
                hide: () => { overlay.style.display = 'none'; },
                remove: () => {
                    overlay.remove();
                    document.removeEventListener('keydown', this._escHandler);
                    this._modal = null;
                    this._currentNPC = null;
                }
            };

            this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
            document.addEventListener('keydown', this._escHandler);

            // 默认显示列表页
            this._showListView();

            this._modal.show();

            // 注册事件监听
            this._bindEvents();
        },

        _createOverlay() {
            const overlay = document.createElement('div');
            overlay.id = 'npc-eco-overlay';
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:12000;',
                'background:rgba(0,0,0,0.88);',
                'display:flex;align-items:center;justify-content:center;',
                'font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;',
                'animation:fadeIn 0.2s ease'
            ].join('');

            const container = document.createElement('div');
            container.id = 'npc-eco-container';
            container.style.cssText = [
                'width:96vw;max-width:700px;max-height:92vh;',
                'display:flex;flex-direction:column;',
                'background:#1a1a2e;',
                'border:3px solid #667eea;',
                'box-shadow:0 0 40px rgba(102,126,234,0.2),6px 6px 0 #000;',
                'border-radius:8px;overflow:hidden;',
                'animation:slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)'
            ].join('');

            container.innerHTML = this._css() + this._getHeaderHTML() + '<div id="npc-eco-content" style="flex:1;overflow-y:auto;min-height:0;"></div>';

            overlay.appendChild(container);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });

            return overlay;
        },

        _getHeaderHTML() {
            return `
                <div id="npc-eco-header" style="
                    background:linear-gradient(135deg,#2d1b4e,#1a1a2e);
                    border-bottom:3px solid #667eea;
                    padding:12px 16px;
                    display:flex;align-items:center;justify-content:space-between;
                    flex-shrink:0;
                ">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <button id="npc-eco-back-btn" style="
                            background:transparent;border:2px solid #667eea;color:#667eea;
                            width:32px;height:32px;border-radius:4px;
                            cursor:pointer;font-size:14px;display:none;align-items:center;justify-content:center;
                        ">&#8592;</button>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:20px;">🎭</span>
                            <div>
                                <div style="font-size:14px;font-weight:700;color:#fff;">NPC伙伴</div>
                                <div id="npc-eco-progress" style="font-size:10px;color:#667eea;"></div>
                            </div>
                        </div>
                    </div>
                    <button id="npc-eco-close" style="
                        background:transparent;border:2px solid #5D275D;color:#C2C3C7;
                        width:32px;height:32px;border-radius:4px;
                        cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;
                        transition:all 0.15s;
                    " onmouseover="this.style.borderColor='#fff';this.style.color='#fff';"
                       onmouseout="this.style.borderColor='#5D275D';this.style.color='#C2C3C7';">✕</button>
                </div>
            `;
        },

        // ============================================
        // 列表视图
        // ============================================

        _showListView() {
            const backBtn = document.getElementById('npc-eco-back-btn');
            const progress = document.getElementById('npc-eco-progress');
            if (backBtn) backBtn.style.display = 'none';
            if (progress) progress.textContent = '';

            const content = document.getElementById('npc-eco-content');
            if (!content) return;

            // 获取分类数据
            const categories = this._getCategoryData();
            const unlockedNPCs = window.NPCEcosystem?.getUnlockedNPCs() || {};
            const lockedNPCs = window.NPCEcosystem?.getLockedNPCs() || {};
            const progress_data = window.NPCEcosystem?.getUnlockProgress() || { total: 0, unlocked: 0, percentage: 0 };

            let tabsHTML = `
                <div style="padding:12px 14px 0;">
                    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;">
                        <button class="npc-cat-btn active" data-cat="all" style="
                            padding:6px 12px;background:#667eea20;border:2px solid #667eea;
                            color:#667eea;border-radius:20px;font-size:12px;cursor:pointer;white-space:nowrap;
                            transition:all 0.15s;
                        ">全部 (${progress_data.unlocked}/${progress_data.total})</button>
            `;

            for (const [catKey, cat] of Object.entries(categories)) {
                const catUnlocked = Object.keys(cat.npcs).filter(id => unlockedNPCs[id]).length;
                const catTotal = Object.keys(cat.npcs).length;
                tabsHTML += `
                    <button class="npc-cat-btn" data-cat="${catKey}" style="
                        padding:6px 12px;background:transparent;border:2px solid ${cat.color}40;
                        color:${cat.color};border-radius:20px;font-size:12px;cursor:pointer;white-space:nowrap;
                        transition:all 0.15s;
                    ">${cat.icon} ${cat.name} (${catUnlocked}/${catTotal})</button>
                `;
            }
            tabsHTML += '</div></div>';

            // NPC网格
            let npcGridHTML = '<div style="padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">';

            for (const [catKey, cat] of Object.entries(categories)) {
                if (this._activeCategory !== 'all' && this._activeCategory !== catKey) continue;

                for (const [npcId, npc] of Object.entries(cat.npcs)) {
                    const isUnlocked = !!unlockedNPCs[npcId];
                    const relation = isUnlocked ? window.NPCEcosystem?.getRelation?.(npcId) : null;
                    const affInfo = isUnlocked ? window.NPCEcosystem?.getAffectionInfo?.(npcId) : null;
                    const lockedInfo = lockedNPCs[npcId];

                    npcGridHTML += this._renderNPCCard(npcId, npc, isUnlocked, relation, affInfo, lockedInfo);
                }
            }
            npcGridHTML += '</div>';

            content.innerHTML = tabsHTML + npcGridHTML;

            // 绑定tab点击
            content.querySelectorAll('.npc-cat-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    content.querySelectorAll('.npc-cat-btn').forEach(b => {
                        b.classList.remove('active');
                        b.style.background = 'transparent';
                    });
                    btn.classList.add('active');
                    btn.style.background = '#667eea20';
                    this._activeCategory = btn.dataset.cat;
                    this._showListView();
                });
            });

            // 绑定NPC卡片点击
            content.querySelectorAll('.npc-card').forEach(card => {
                card.addEventListener('click', () => {
                    this._showNPCDetail(card.dataset.npcId);
                });
            });
        },

        _renderNPCCard(npcId, npc, isUnlocked, relation, affInfo, lockedInfo) {
            const borderColor = isUnlocked ? (npc.color || '#667eea') : '#3a3a5a';
            const bgColor = isUnlocked ? '#252545' : '#1a1a2e';
            const opacity = isUnlocked ? '1' : '0.6';
            const avatarBg = isUnlocked ? (npc.color || '#667eea') + '40' : '#2a2a4a';
            const badge = isUnlocked ? '' : '<div style="position:absolute;top:8px;right:8px;font-size:16px;filter:grayscale(1);opacity:0.5;">🔒</div>';

            let affHTML = '';
            if (isUnlocked && affInfo) {
                const rankColor = affInfo.level >= 4 ? '#fbbf24' : affInfo.level >= 2 ? '#667eea' : '#888';
                affHTML = `
                    <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
                        <span style="font-size:10px;color:${rankColor};font-weight:600;">Lv.${affInfo.level} ${affInfo.rank?.label || ''}</span>
                        <div style="flex:1;height:4px;background:#2a2a4a;border-radius:2px;overflow:hidden;">
                            <div style="width:${affInfo.percentage}%;height:100%;background:${npc.color || '#667eea'};border-radius:2px;"></div>
                        </div>
                    </div>
                `;
            } else if (!isUnlocked) {
                affHTML = `<div style="font-size:10px;color:#5D275D;margin-top:4px;">${lockedInfo?.unlock_hint || '未解锁'}</div>`;
            }

            return `
                <div class="npc-card ${isUnlocked ? 'unlocked' : 'locked'}" data-npc-id="${npcId}" style="
                    background:${bgColor};border:2px solid ${borderColor};border-radius:8px;
                    padding:14px;cursor:pointer;opacity:${opacity};
                    transition:all 0.2s;position:relative;
                    animation:fadeIn 0.3s ease;
                " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(102,126,234,0.2)';"
                   onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none';">
                    ${badge}
                    <div style="
                        width:50px;height:50px;border-radius:50%;
                        background:${avatarBg};border:2px solid ${borderColor};
                        display:flex;align-items:center;justify-content:center;
                        font-size:24px;margin:0 auto 10px;
                    ">${npc.avatar}</div>
                    <div style="text-align:center;">
                        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:2px;">${npc.name}</div>
                        <div style="font-size:10px;color:#888;margin-bottom:4px;">${npc.title}</div>
                        <div style="font-size:9px;color:${npc.color || '#888'};">${npc.category}</div>
                    </div>
                    ${affHTML}
                </div>
            `;
        },

        _getCategoryData() {
            if (!window.NPC_ECOSYSTEM_DATA) return {};
            return {
                mentor: { name: '导师型', icon: '🎓', npcs: NPC_ECOSYSTEM_DATA.mentor?.npcs || {} },
                senior: { name: '学长型', icon: '👨‍🎓', npcs: NPC_ECOSYSTEM_DATA.senior?.npcs || {} },
                campus: { name: '校园型', icon: '🏫', npcs: NPC_ECOSYSTEM_DATA.campus?.npcs || {} },
                club: { name: '兴趣型', icon: '🎨', npcs: NPC_ECOSYSTEM_DATA.club?.npcs || {} },
                custom: { name: '自定义', icon: '✨', npcs: NPC_ECOSYSTEM_DATA.custom?.npcs || {} }
            };
        },

        // ============================================
        // NPC详情视图
        // ============================================

        _showNPCDetail(npcId) {
            const backBtn = document.getElementById('npc-eco-back-btn');
            if (backBtn) {
                backBtn.style.display = 'flex';
                backBtn.onclick = () => this._showListView();
            }

            const npcData = window.NPCEcosystem?.getNPC?.(npcId);
            if (!npcData) {
                console.warn('[NPCUI] NPC数据不存在:', npcId);
                return;
            }

            this._currentNPC = npcId;
            const content = document.getElementById('npc-eco-content');
            if (!content) return;

            const affInfo = npcData.affectionInfo || {};
            const rankColor = affInfo.level >= 4 ? '#fbbf24' : affInfo.level >= 2 ? '#667eea' : '#888';

            content.innerHTML = `
                <!-- NPC头部 -->
                <div style="
                    background:linear-gradient(135deg,${npcData.color || '#667eea'}40,${npcData.color || '#667eea'}10);
                    border-bottom:2px solid ${npcData.color || '#667eea'}40;
                    padding:20px;text-align:center;
                ">
                    <div style="
                        width:72px;height:72px;border-radius:50%;
                        background:${npcData.color || '#667eea'}30;border:3px solid ${npcData.color || '#667eea'};
                        display:flex;align-items:center;justify-content:center;
                        font-size:36px;margin:0 auto 12px;
                        box-shadow:0 0 20px ${npcData.color || '#667eea'}40;
                    ">${npcData.avatar}</div>
                    <div style="font-size:18px;font-weight:900;color:#fff;">${npcData.name}</div>
                    <div style="font-size:12px;color:${npcData.color || '#888'};margin-bottom:8px;">${npcData.title}</div>
                    
                    <!-- 好感度条 -->
                    <div style="
                        background:#1a1a2e;border-radius:8px;padding:12px;max-width:280px;margin:0 auto;
                    ">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <span style="font-size:11px;color:#888;">好感度</span>
                            <span style="font-size:11px;font-weight:700;color:${rankColor};">
                                Lv.${affInfo.level || 0} ${affInfo.rank?.label || ''}
                            </span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div style="flex:1;height:10px;background:#2a2a4a;border-radius:5px;overflow:hidden;">
                                <div style="
                                    width:${affInfo.percentage || 0}%;height:100%;
                                    background:linear-gradient(90deg,${npcData.color || '#667eea'},${npcData.color || '#764ba2'});
                                    border-radius:5px;transition:width 0.5s ease;
                                "></div>
                            </div>
                            <span style="font-size:11px;color:#888;white-space:nowrap;">
                                ${affInfo.affection || 0}/${affInfo.maxAffection || 500}
                            </span>
                        </div>
                        ${affInfo.nextRank ? `
                        <div style="font-size:10px;color:#5a5a8a;text-align:center;margin-top:6px;">
                            距离 ${affInfo.nextRank.label} 还需 ${affInfo.nextRank.threshold - (affInfo.affection || 0)} 点好感
                        </div>` : `
                        <div style="font-size:10px;color:#fbbf24;text-align:center;margin-top:6px;">
                            ★ 已达最高好感等级 ★
                        </div>`}
                    </div>
                </div>

                <!-- 子Tab -->
                <div style="display:flex;border-bottom:2px solid #2a2a4a;flex-shrink:0;">
                    <button class="npc-detail-tab active" data-tab="dialogue" style="
                        flex:1;padding:10px;background:transparent;border:none;
                        color:#667eea;font-size:12px;font-weight:600;cursor:pointer;
                        border-bottom:3px solid #667eea;
                    ">💬 对话</button>
                    <button class="npc-detail-tab" data-tab="info" style="
                        flex:1;padding:10px;background:transparent;border:none;
                        color:#888;font-size:12px;font-weight:600;cursor:pointer;
                        border-bottom:3px solid transparent;
                    ">📋 资料</button>
                    <button class="npc-detail-tab" data-tab="tasks" style="
                        flex:1;padding:10px;background:transparent;border:none;
                        color:#888;font-size:12px;font-weight:600;cursor:pointer;
                        border-bottom:3px solid transparent;
                    ">📋 任务</button>
                </div>

                <!-- 内容区域 -->
                <div id="npc-detail-body" style="flex:1;overflow-y:auto;min-height:0;display:flex;flex-direction:column;">
                    <!-- 对话区域 -->
                    <div id="npc-dialogue-panel" style="flex:1;display:flex;flex-direction:column;min-height:0;">
                        <div id="npc-chat-history" style="
                            flex:1;overflow-y:auto;padding:12px;
                            display:flex;flex-direction:column;gap:8px;
                            min-height:300px;
                        ">
                            ${this._renderChatHistory(npcId)}
                        </div>
                        <!-- 快捷回复 -->
                        <div id="npc-quick-replies" style="
                            padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px;
                            border-top:1px solid #2a2a4a;
                        ">
                            ${this._renderQuickReplies(npcId)}
                        </div>
                        <!-- 输入区 -->
                        <div style="
                            display:flex;gap:8px;padding:10px 12px;
                            background:#1a1a2e;border-top:2px solid #2a2a4a;
                        ">
                            <input id="npc-msg-input" type="text" placeholder="输入消息..." style="
                                flex:1;padding:10px 14px;
                                background:#252545;border:2px solid #3a3a5a;
                                border-radius:24px;color:#fff;font-size:13px;outline:none;
                            " />
                            <button id="npc-msg-send" style="
                                padding:10px 18px;
                                background:linear-gradient(135deg,#667eea,#764ba2);
                                border:none;border-radius:24px;color:#fff;
                                font-size:13px;font-weight:600;cursor:pointer;
                                transition:all 0.2s;
                            ">发送</button>
                        </div>
                    </div>

                    <!-- 资料面板 -->
                    <div id="npc-info-panel" style="display:none;flex:1;overflow-y:auto;padding:16px;">
                        ${this._renderNPCInfo(npcData)}
                    </div>

                    <!-- 任务面板 -->
                    <div id="npc-tasks-panel" style="display:none;flex:1;overflow-y:auto;padding:16px;">
                        ${this._renderNPCTasks(npcId)}
                    </div>
                </div>
            `;

            // 绑定tab点击
            content.querySelectorAll('.npc-detail-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    content.querySelectorAll('.npc-detail-tab').forEach(t => {
                        t.classList.remove('active');
                        t.style.color = '#888';
                        t.style.borderBottomColor = 'transparent';
                    });
                    tab.classList.add('active');
                    tab.style.color = '#667eea';
                    tab.style.borderBottomColor = '#667eea';
                    this._switchDetailTab(tab.dataset.tab);
                });
            });

            // 绑定快捷回复点击
            content.querySelectorAll('.npc-quick-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const msg = btn.dataset.msg;
                    if (msg) this._sendMessage(msg);
                });
            });

            // 绑定发送按钮
            const sendBtn = document.getElementById('npc-msg-send');
            const input = document.getElementById('npc-msg-input');
            if (sendBtn) {
                sendBtn.addEventListener('click', () => {
                    if (input?.value.trim()) this._sendMessage(input.value.trim());
                });
            }
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) {
                        e.preventDefault();
                        this._sendMessage(input.value.trim());
                    }
                });
            }

            // 滚动到底部
            const chatHistory = document.getElementById('npc-chat-history');
            if (chatHistory) {
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
        },

        _switchDetailTab(tab) {
            const panels = ['dialogue', 'info', 'tasks'];
            panels.forEach(p => {
                const el = document.getElementById(`npc-${p}-panel`);
                if (el) el.style.display = p === tab ? 'flex' : 'none';
                if (p === 'dialogue') el.style.flexDirection = 'column';
            });
        },

        _renderChatHistory(npcId) {
            const history = window.NPCEcosystem?.getHistory?.(npcId) || [];
            if (history.length === 0) {
                const npcData = window.NPCEcosystem?.getNPC?.(npcId);
                return `
                    <div style="text-align:center;padding:30px;color:#5a5a8a;font-size:13px;">
                        <div style="font-size:32px;margin-bottom:8px;">💬</div>
                        还没有对话记录<br>
                        <span style="font-size:12px;">点击快捷回复或输入消息开始对话</span>
                    </div>
                `;
            }
            return history.slice(0, 20).map(h => {
                const isUser = h.role === 'user';
                const align = isUser ? 'flex-end' : 'flex-start';
                const bg = isUser ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#252545';
                const color = isUser ? '#fff' : '#e0e0e0';
                const border = isUser ? 'none' : `1px solid ${(window.NPCEcosystem?.getNPC?.(npcId))?.color || '#667eea'}40`;
                return `
                    <div style="display:flex;justify-content:${align};">
                        <div style="
                            max-width:75%;padding:10px 14px;
                            background:${bg};border:${border};
                            border-radius:12px;color:${color};font-size:13px;line-height:1.5;
                            ${isUser ? 'border-bottom-right-radius:4px;' : 'border-bottom-left-radius:4px;'}
                        ">${this._escapeHtml(h.text)}</div>
                    </div>
                `;
            }).join('');
        },

        _renderQuickReplies(npcId) {
            const suggestions = window.NPCEcosystem?.getSuggestedDialogues?.(npcId) || [];
            if (suggestions.length === 0) return '';
            return suggestions.map(s => `
                <button class="npc-quick-btn" data-msg="${this._escapeHtml(s.text)}" style="
                    padding:5px 12px;background:#252545;border:1px solid #3a3a5a;
                    border-radius:16px;color:#888;font-size:11px;cursor:pointer;
                    transition:all 0.15s;
                " onmouseover="this.style.borderColor='#667eea';this.style.color='#667eea';"
                   onmouseout="this.style.borderColor='#3a3a5a';this.style.color='#888';">
                    ${s.icon || '💬'} ${s.text}
                </button>
            `).join('');
        },

        _renderNPCInfo(npcData) {
            return `
                <div style="display:flex;flex-direction:column;gap:16px;">
                    <div style="background:#252545;border-radius:8px;padding:14px;border:1px solid #3a3a5a;">
                        <div style="font-size:11px;color:#667eea;margin-bottom:6px;font-weight:600;">🏷️ 角色介绍</div>
                        <div style="font-size:13px;color:#e0e0e0;line-height:1.7;">${npcData.bio || '暂无介绍'}</div>
                    </div>

                    <div style="background:#252545;border-radius:8px;padding:14px;border:1px solid #3a3a5a;">
                        <div style="font-size:11px;color:#667eea;margin-bottom:6px;font-weight:600;">💡 性格特点</div>
                        <div style="font-size:13px;color:#e0e0e0;">${npcData.personality || '未知'}</div>
                    </div>

                    <div style="background:#252545;border-radius:8px;padding:14px;border:1px solid #3a3a5a;">
                        <div style="font-size:11px;color:#667eea;margin-bottom:6px;font-weight:600;">🎯 专业领域</div>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                            ${(npcData.expertise || []).map(e => `
                                <span style="
                                    padding:4px 10px;background:${npcData.color || '#667eea'}20;
                                    border:1px solid ${npcData.color || '#667eea'}40;
                                    border-radius:12px;font-size:11px;color:${npcData.color || '#667eea'};
                                ">${e}</span>
                            `).join('')}
                        </div>
                    </div>

                    <!-- 好感度奖励 -->
                    <div style="background:#252545;border-radius:8px;padding:14px;border:1px solid #3a3a5a;">
                        <div style="font-size:11px;color:#667eea;margin-bottom:8px;font-weight:600;">🎁 好感度奖励</div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            ${(npcData.affection?.ranks || []).map(r => {
                                const unlocked = (npcData.affectionInfo?.level || 0) >= r.level;
                                return `
                                    <div style="
                                        display:flex;align-items:center;gap:8px;
                                        padding:6px 10px;border-radius:6px;
                                        background:${unlocked ? 'rgba(102,126,234,0.1)' : '#1a1a2e'};
                                        opacity:${unlocked ? '1' : '0.5'};
                                    ">
                                        <span style="
                                            width:20px;height:20px;border-radius:50%;
                                            background:${unlocked ? '#667eea' : '#3a3a5a'};
                                            display:flex;align-items:center;justify-content:center;
                                            font-size:10px;color:#fff;flex-shrink:0;
                                        ">${r.level}</span>
                                        <div style="flex:1;">
                                            <div style="font-size:12px;color:${unlocked ? '#fff' : '#888'};font-weight:600;">
                                                Lv.${r.level} ${r.label}
                                            </div>
                                            <div style="font-size:10px;color:#888;">${r.desc || ''}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        },

        _renderNPCTasks(npcId) {
            const tasks = window.NPCEcosystem?.getNPCTasks?.(npcId) || [];
            if (tasks.length === 0) {
                return `
                    <div style="text-align:center;padding:30px;color:#5a5a8a;">
                        <div style="font-size:32px;margin-bottom:8px;">📋</div>
                        该NPC暂无可用任务<br>
                        <span style="font-size:12px;">继续与NPC互动提升好感度解锁更多任务</span>
                    </div>
                `;
            }
            return `
                <div style="display:flex;flex-direction:column;gap:10px;">
                    ${tasks.map(t => `
                        <div style="
                            background:#252545;border:1px solid #3a3a5a;
                            border-radius:8px;padding:14px;
                        ">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                <span style="font-size:20px;">${t.icon || '📋'}</span>
                                <div style="flex:1;">
                                    <div style="font-size:13px;font-weight:600;color:#fff;">${t.name}</div>
                                    <div style="font-size:11px;color:#888;">难度：${t.difficulty === 'easy' ? '简单' : t.difficulty === 'medium' ? '中等' : '困难'}</div>
                                </div>
                                <span style="
                                    padding:3px 8px;border-radius:10px;font-size:10px;
                                    background:rgba(102,126,234,0.2);color:#667eea;
                                ">可接</span>
                            </div>
                            <div style="font-size:12px;color:#aaa;line-height:1.5;margin-bottom:10px;">
                                ${t.desc || ''}
                            </div>
                            <div style="display:flex;gap:8px;align-items:center;">
                                <div style="display:flex;gap:6px;font-size:11px;color:#888;">
                                    <span>⭐+${t.reward?.exp || 0}</span>
                                    <span>💰+${t.reward?.gold || 0}</span>
                                    <span>💕+${t.reward?.affection || 0}</span>
                                </div>
                                <button onclick="NPCUI._acceptTask('${npcId}','${t.id}')" style="
                                    margin-left:auto;padding:6px 14px;
                                    background:linear-gradient(135deg,#667eea,#764ba2);
                                    border:none;border-radius:16px;color:#fff;
                                    font-size:11px;font-weight:600;cursor:pointer;
                                ">接受任务</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        },

        // ============================================
        // 发送消息
        // ============================================

        async _sendMessage(message) {
            const input = document.getElementById('npc-msg-input');
            const sendBtn = document.getElementById('npc-msg-send');
            const chatHistory = document.getElementById('npc-chat-history');

            if (this._isChatting || !message.trim()) return;

            this._isChatting = true;
            if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; }
            if (input) { input.disabled = true; input.value = ''; }

            // 添加用户消息
            const userBubble = document.createElement('div');
            userBubble.style.cssText = 'display:flex;justify-content:flex-end;';
            userBubble.innerHTML = `
                <div style="
                    max-width:75%;padding:10px 14px;
                    background:linear-gradient(135deg,#667eea,#764ba2);
                    border-radius:12px;border-bottom-right-radius:4px;
                    color:#fff;font-size:13px;line-height:1.5;
                ">${this._escapeHtml(message)}</div>
            `;
            if (chatHistory) chatHistory.appendChild(userBubble);

            // 添加loading
            const loadingEl = document.createElement('div');
            loadingEl.style.cssText = 'display:flex;justify-content:flex-start;';
            loadingEl.innerHTML = `
                <div style="
                    padding:10px 14px;background:#252545;border:1px solid #3a3a5a;
                    border-radius:12px;border-bottom-left-radius:4px;
                    color:#888;font-size:13px;
                "><span style="animation:pulse 1s infinite;">...</span></div>
            `;
            if (chatHistory) chatHistory.appendChild(loadingEl);
            chatHistory.scrollTop = chatHistory.scrollHeight;

            try {
                const result = await window.NPCEcosystem?.chat?.(this._currentNPC, message);
                
                // 移除loading
                loadingEl.remove();

                // 添加AI回复
                const aiBubble = document.createElement('div');
                aiBubble.style.cssText = 'display:flex;justify-content:flex-start;';
                const npcColor = window.NPCEcosystem?.getNPC?.(this._currentNPC)?.color || '#667eea';
                aiBubble.innerHTML = `
                    <div style="
                        max-width:75%;padding:10px 14px;
                        background:#252545;border:1px solid ${npcColor}40;
                        border-radius:12px;border-bottom-left-radius:4px;
                        color:#e0e0e0;font-size:13px;line-height:1.6;
                    ">${this._escapeHtml(result?.reply || '抱歉，暂无回复')}</div>
                `;
                if (chatHistory) chatHistory.appendChild(aiBubble);
                chatHistory.scrollTop = chatHistory.scrollHeight;

                // 更新好感度显示
                this._updateAffectionDisplay();

            } catch (err) {
                console.warn('[NPCUI] 发送消息失败:', err);
                loadingEl.remove();
                const errorBubble = document.createElement('div');
                errorBubble.style.cssText = 'display:flex;justify-content:flex-start;';
                errorBubble.innerHTML = `
                    <div style="
                        padding:10px 14px;background:#2a1a1a;border:1px solid #B13E53;
                        border-radius:12px;color:#B13E53;font-size:12px;
                    ">⚠️ ${err.message || '发送失败，请稍后重试'}</div>
                `;
                if (chatHistory) chatHistory.appendChild(errorBubble);
            }

            this._isChatting = false;
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '发送'; }
            if (input) { input.disabled = false; input.focus(); }
        },

        _updateAffectionDisplay() {
            if (!this._currentNPC) return;
            const npcData = window.NPCEcosystem?.getNPC?.(this._currentNPC);
            if (!npcData) return;

            const affInfo = npcData.affectionInfo || {};
            const rankColor = affInfo.level >= 4 ? '#fbbf24' : affInfo.level >= 2 ? '#667eea' : '#888';
            const npcColor = npcData.color || '#667eea';

            // 更新好感度显示
            const header = document.querySelector('#npc-eco-header');
            if (header) {
                const existingAff = header.querySelector('.npc-eco-aff-display');
                const affHTML = `
                    <div class="npc-eco-aff-display" style="
                        background:#252545;padding:4px 10px;border-radius:12px;
                        font-size:11px;display:flex;align-items:center;gap:6px;
                    ">
                        <span style="color:${npcColor};font-weight:700;">Lv.${affInfo.level || 0}</span>
                        <span style="color:${rankColor};">${affInfo.rank?.label || ''}</span>
                        <span style="color:#888;">|</span>
                        <span style="color:#888;">💕 ${affInfo.affection || 0}/${affInfo.maxAffection || 500}</span>
                    </div>
                `;
                if (existingAff) {
                    existingAff.innerHTML = affHTML.replace('class="npc-eco-aff-display"', 'class="npc-eco-aff-display"');
                } else {
                    header.querySelector('div:last-child').prepend(createElementFromHTML(affHTML));
                }
            }
        },

        _acceptTask(npcId, taskId) {
            if (window.showNotification) {
                showNotification('任务已添加到任务列表！', 'success');
            }
            if (window.EventBus) {
                EventBus.emit('npc:task_accepted', { npcId, taskId });
            }
        },

        // ============================================
        // 事件绑定
        // ============================================

        _bindEvents() {
            // 关闭按钮
            const closeBtn = document.getElementById('npc-eco-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.close());
            }

            // 返回按钮
            const backBtn = document.getElementById('npc-eco-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => this._showListView());
            }

            // 监听NPC解锁事件
            if (window.EventBus) {
                EventBus.on('npc:unlocked', (data) => {
                    // 更新列表视图中的NPC状态
                    if (this._modal) {
                        this._showListView();
                    }
                });

                EventBus.on('npc:affection_level_up', (data) => {
                    this._showLevelUpAnimation(data);
                });

                EventBus.on('npc:easter_egg', (data) => {
                    this._showEasterEggNotification(data);
                });
            }
        },

        // ============================================
        // 动画和反馈
        // ============================================

        _showLevelUpAnimation(data) {
            const { npc, oldLevel, newLevel, rank } = data;
            if (!rank) return;

            const container = document.getElementById('npc-eco-container');
            if (!container) return;

            // 创建升级动画
            const anim = document.createElement('div');
            anim.style.cssText = [
                'position:fixed;inset:0;z-index:13000;',
                'display:flex;align-items:center;justify-content:center;',
                'background:rgba(0,0,0,0.7);',
                'animation:fadeIn 0.3s ease'
            ].join('');

            anim.innerHTML = `
                <div style="
                    background:linear-gradient(135deg,#2d1b4e,#1a1a2e);
                    border:3px solid #fbbf24;
                    box-shadow:0 0 40px rgba(251,191,36,0.3);
                    border-radius:16px;padding:30px 40px;text-align:center;
                    animation:scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1);
                ">
                    <div style="font-size:48px;margin-bottom:12px;">🎉</div>
                    <div style="font-size:18px;font-weight:900;color:#fbbf24;margin-bottom:8px;">
                        好感度提升！
                    </div>
                    <div style="font-size:14px;color:#fff;margin-bottom:4px;">
                        ${npc?.name} → Lv.${newLevel} ${rank.label}
                    </div>
                    <div style="font-size:12px;color:#888;margin-bottom:16px;">
                        ${rank.desc || ''}
                    </div>
                    ${this._renderRankReward(rank.reward)}
                    <button onclick="this.closest('[style*=\"z-index:13000\"]').remove()" style="
                        margin-top:16px;padding:10px 30px;
                        background:linear-gradient(135deg,#fbbf24,#f59e0b);
                        border:none;border-radius:20px;color:#1a1a2e;
                        font-size:13px;font-weight:700;cursor:pointer;
                    ">太棒了！</button>
                </div>
            `;

            document.body.appendChild(anim);
            setTimeout(() => { if (anim.parentNode) anim.remove(); }, 10000);
        },

        _renderRankReward(reward) {
            if (!reward) return '<div style="font-size:11px;color:#888;">无特殊奖励</div>';
            switch (reward.type) {
                case 'task': return `<div style="font-size:12px;color:#667eea;">🎁 任务奖励 ×${reward.bonus}</div>`;
                case 'title': return `<div style="font-size:12px;color:#fbbf24;">🏆 获得称号：${reward.item}</div>`;
                case 'buff': return `<div style="font-size:12px;color:#10b981;">✨ 获得Buff：${reward.item}</div>`;
                case 'item': return `<div style="font-size:12px;color:#ec4899;">🎁 获得物品：${reward.item}</div>`;
                case 'all': return `<div style="font-size:12px;color:#fbbf24;">⭐ 解锁全部特权！</div>`;
                default: return `<div style="font-size:12px;color:#888;">🎁 好感度特权提升</div>`;
            }
        },

        _showEasterEggNotification(data) {
            const { type, npcId, config } = data;
            const npc = npcId ? window.NPCEcosystem?.getNPC?.(npcId) : null;
            const color = npc?.color || '#667eea';

            if (window.showNotification) {
                showNotification(`🥚 ${config?.title || '彩蛋触发'}`, 'info');
            }

            // 创建彩蛋弹窗
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:13000;',
                'display:flex;align-items:center;justify-content:center;',
                'background:rgba(0,0,0,0.8);',
                'animation:fadeIn 0.3s ease'
            ].join('');

            overlay.innerHTML = `
                <div style="
                    max-width:90vw;background:#1a1a2e;
                    border:3px solid ${color};
                    box-shadow:0 0 30px ${color}40;
                    border-radius:12px;padding:24px;
                    animation:slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1);
                ">
                    <div style="text-align:center;margin-bottom:16px;">
                        <div style="font-size:40px;margin-bottom:8px;">🥚</div>
                        <div style="font-size:16px;font-weight:700;color:${color};">${config?.title || '彩蛋发现！'}</div>
                    </div>
                    <div style="
                        background:#252545;border-radius:8px;padding:14px;
                        font-size:13px;color:#e0e0e0;line-height:1.6;
                        margin-bottom:16px;
                    ">${config?.message || ''}</div>
                    ${config?.reward ? `
                    <div style="
                        display:flex;justify-content:center;gap:16px;
                        font-size:12px;color:#888;margin-bottom:16px;
                    ">
                        ${config.reward.exp ? `<span>⭐+${config.reward.exp}</span>` : ''}
                        ${config.reward.gold ? `<span>💰+${config.reward.gold}</span>` : ''}
                        ${config.reward.affection ? `<span>💕+${config.reward.affection}</span>` : ''}
                    </div>` : ''}
                    <button onclick="this.closest('[style*=\"z-index:13000\"]').remove()" style="
                        width:100%;padding:10px;
                        background:${color};border:none;border-radius:8px;
                        color:#fff;font-size:13px;font-weight:600;cursor:pointer;
                    ">收到！</button>
                </div>
            `;

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.remove();
            });

            document.body.appendChild(overlay);
            setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 15000);
        },

        // ============================================
        // 工具方法
        // ============================================

        _escapeHtml(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        },

        // ============================================
        // CSS样式
        // ============================================

        _css() {
            return `<style>
            @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes scaleIn {
                from { opacity: 0; transform: scale(0.8); }
                to { opacity: 1; transform: scale(1); }
            }
            @keyframes pulse {
                0%, 100% { opacity: 0.4; }
                50% { opacity: 1; }
            }

            /* 像素风格字体 */
            #npc-eco-container * {
                font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif !important;
            }

            /* NPC卡片hover效果 */
            .npc-card.unlocked:hover {
                cursor: pointer;
            }
            .npc-card.locked {
                cursor: not-allowed;
            }

            /* 滚动条样式 */
            #npc-eco-content::-webkit-scrollbar,
            #npc-chat-history::-webkit-scrollbar,
            #npc-detail-body::-webkit-scrollbar {
                width: 4px;
            }
            #npc-eco-content::-webkit-scrollbar-track,
            #npc-chat-history::-webkit-scrollbar-track,
            #npc-detail-body::-webkit-scrollbar-track {
                background: #1a1a2e;
            }
            #npc-eco-content::-webkit-scrollbar-thumb,
            #npc-chat-history::-webkit-scrollbar-thumb,
            #npc-detail-body::-webkit-scrollbar-thumb {
                background: #3a3a5a;
                border-radius: 2px;
            }

            /* 响应式 */
            @media (max-width: 480px) {
                #npc-eco-container {
                    max-width: 100vw !important;
                    max-height: 100vh !important;
                    border-radius: 0 !important;
                }
            }
            </style>`;
        }
    };

    // 辅助函数：创建HTML元素
    function createElementFromHTML(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.firstChild;
    }

    // 导出
    window.NPCUI = NPCUI;

})();
