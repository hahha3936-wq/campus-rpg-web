/**
 * 校园RPG - 主线剧情面板模块（增强版）
 * 像素风格UI，展示4大篇章的完整RPG剧情系统
 * 包含：任务/线索/探索三大Tab，对话/谜题/分支/彩蛋等功能
 * 对接 /api/story/* 接口
 */

(function () {
    'use strict';

    const MainStory = {
        _modal: null,
        _currentStage: '新生适应期',
        _currentTab: 'tasks',
        _progress: null,
        _clues: null,
        _isInit: false,
        _escHandler: null,

        // ============================================
        // 入口方法
        // ============================================

        open() {
            if (this._modal) {
                const existing = document.getElementById('ms-overlay');
                if (existing) {
                    this._modal.show();
                    this._refresh();
                } else {
                    this._render();
                    this._loadData();
                }
                return;
            }
            this._render();
            this._loadData();
        },

        close() {
            if (this._modal) {
                this._modal.remove();
            }
        },

        async _loadData() {
            try {
                const resp = await window.Auth.apiFetch('/api/story/progress');
                console.log('[MainStory] /api/story/progress status:', resp?.status);
                if (!resp || !resp.ok) {
                    console.warn('[MainStory] API request failed, status:', resp?.status);
                    this._showError('请先登录后再查看主线剧情');
                    return;
                }
                const json = await resp.json();
                console.log('[MainStory] progress response success:', json.success, 'all_tasks count:', json.progress?.all_tasks?.length);
                if (json.success) {
                    this._progress = json.progress;
                    console.log('[MainStory] _progress set, stage:', this._progress?.stage, 'all_tasks:', this._progress?.all_tasks?.length);
                    this._renderContent();
                } else {
                    console.error('[MainStory] progress response error:', json.error);
                    this._showError(json.error || '加载剧情数据失败');
                }
            } catch (err) {
                console.error('[MainStory] _loadData exception:', err);
                this._showError('网络错误，请检查连接');
            }
        },

        async _refresh() {
            this._clues = null;  // Reset clues to force re-fetch
            await this._loadData();
        },

        // ============================================
        // DOM 渲染
        // ============================================

        _render() {
            const existing = document.getElementById('ms-overlay');
            if (existing) existing.remove();
            const modal = this._createModal();
            document.body.appendChild(modal._node);
            this._modal = modal;
            this._escHandler = (e) => {
                if (e.key === 'Escape') this.close();
            };
            document.addEventListener('keydown', this._escHandler);
        },

        _createModal() {
            const overlay = document.createElement('div');
            overlay.id = 'ms-overlay';
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:10990;',
                'background:rgba(0,0,0,0.85);',
                'display:flex;align-items:center;justify-content:center;',
                'font-family:"Noto Sans SC",sans-serif;'
            ].join('');
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });

            const container = document.createElement('div');
            container.id = 'ms-container';
            container.style.cssText = [
                'width:96vw;max-width:680px;max-height:92vh;',
                'display:flex;flex-direction:column;',
                'background:#1D2B53;',
                'border:3px solid #FFF1E8;',
                'box-shadow:6px 6px 0 #000,0 0 40px rgba(41,173,255,0.15);',
                'border-radius:4px;',
                'overflow:hidden;',
                'animation:msModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1);'
            ].join('');

            container.innerHTML = this._css() + this._tpl('shell');
            overlay.appendChild(container);

            container.querySelector('#ms-close').addEventListener('click', () => this.close());

            // 章节切换
            container.querySelectorAll('.ms-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    this._currentStage = tab.dataset.stage;
                    container.querySelectorAll('.ms-tab').forEach(t => t.classList.remove('ms-tab-active'));
                    tab.classList.add('ms-tab-active');
                    this._renderContent();
                });
            });

            // 内部Tab切换
            container.querySelectorAll('.ms-inner-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    this._currentTab = tab.dataset.tab;
                    container.querySelectorAll('.ms-inner-tab').forEach(t => t.classList.remove('ms-inner-active'));
                    tab.classList.add('ms-inner-active');
                    this._renderTabContent();
                });
            });

            return {
                _node: overlay,
                show: () => { overlay.style.display = 'flex'; },
                hide: () => { overlay.style.display = 'none'; },
                remove: () => {
                    overlay.remove();
                    document.removeEventListener('keydown', this._escHandler);
                    this._modal = null;
                }
            };
        },

        _renderContent() {
            if (!this._modal) return;
            const container = document.getElementById('ms-container');
            if (!container) return;

            const body = container.querySelector('#ms-body');
            const header = container.querySelector('#ms-header');
            if (!body || !header) return;

            if (!this._progress) {
                body.innerHTML = '<div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>';
                return;
            }

            this._renderTabs(container);
            this._renderHeader(container);
            this._renderTabContent();
        },

        _renderTabs(container) {
            const tabsEl = container.querySelector('#ms-tabs');
            if (!tabsEl) return;
            const STAGE_ORDER = ['新生适应期', '学业成长期', '实习准备期', '毕业冲刺期'];
            const STAGE_ICONS = ['\uD83C\uDF93', '\uD83D\uDCDA', '\uD83D\uDCBC', '\uD83C\uDF89'];
            const STAGE_COLORS = ['#29ADFF', '#00E436', '#FFA300', '#B13E53'];
            const unlockedStages = this._progress.chapter_unlocked || [];

            tabsEl.innerHTML = STAGE_ORDER.map((stage, i) => {
                const isActive = stage === this._currentStage;
                const isUnlocked = unlockedStages.includes(stage);
                const color = STAGE_COLORS[i];
                const icon = isUnlocked ? STAGE_ICONS[i] : '\uD83D\uDD12';
                const style = isActive ? `border-color:${color};color:${color};` : isUnlocked ? 'color:#C2C3C7;' : 'color:#5F574F;opacity:0.5;';
                return `<button class="ms-tab ${isActive ? 'ms-tab-active' : ''}"
                    data-stage="${stage}" ${!isUnlocked ? 'disabled' : ''}
                    style="${style}">
                    <span style="font-size:14px;">${icon}</span>
                    <span style="font-size:8px;font-family:\'Press Start 2P\',monospace;">${stage.replace('期', '')}</span>
                </button>`;
            }).join('');

            tabsEl.querySelectorAll('.ms-tab:not([disabled])').forEach(tab => {
                tab.addEventListener('click', () => {
                    this._currentStage = tab.dataset.stage;
                    tabsEl.querySelectorAll('.ms-tab').forEach(t => t.classList.remove('ms-tab-active'));
                    tab.classList.add('ms-tab-active');
                    this._renderContent();
                });
            });
        },

        _renderHeader(container) {
            const header = container.querySelector('#ms-header');
            if (!header || !this._progress) return;
            const color = this._STAGE_COLORS[this._currentStage] || '#29ADFF';
            const stageData = this._progress;
            const cluesCount = stageData.clues_count || 0;
            const puzzlesCount = (stageData.puzzles_solved || []).length;
            const hiddenCount = (stageData.hidden_tasks_completed || []).length;
            const totalTasks = stageData.total_count || 5;
            const completedTasks = stageData.completed_count || 0;
            const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            header.innerHTML = `
                <div class="ms-header-left">
                    <div class="ms-stage-badge" style="border-color:${color};color:${color};">
                        <span>\u2694</span>
                        <span style="font-size:9px;font-family:\'Press Start 2P\',monospace;">${this._progress.stage_title || ''}</span>
                    </div>
                    <div class="ms-header-stats">
                        <span style="color:#FFCD75;font-size:10px;">\uD83D\uDCDD ${cluesCount}条线索</span>
                        <span style="color:#73EFF7;font-size:10px;">\uD83C\uDFAF ${puzzlesCount}谜题</span>
                        <span style="color:#FFA300;font-size:10px;">\uD83C\uDFB2 ${hiddenCount}隐藏</span>
                    </div>
                </div>
                <div class="ms-progress-mini">
                    <div style="width:${pct}%;height:100%;background:${color};border-radius:2px;transition:width 0.4s;"></div>
                </div>
            `;
        },

        async _renderTabContent() {
            if (!this._modal) return;
            const container = document.getElementById('ms-container');
            if (!container) return;
            const body = container.querySelector('#ms-body');
            if (!body) return;

            if (this._currentTab === 'clues') {
                if (!this._clues) {
                    body.innerHTML = '<div style="text-align:center;padding:40px;color:#C2C3C7;">线索数据加载中...</div>';
                    try {
                        const resp = await window.Auth.apiFetch('/api/story/clues');
                        const status = resp ? resp.status : 0;
                        console.log('[MainStory] /api/story/clues status:', status);
                        if (resp && status >= 200 && status < 300) {
                            const data = await resp.json();
                            if (data && !data.error) {
                                console.log('[MainStory] clues loaded, total:', data.total_count);
                                this._clues = data;
                                if (this._currentTab === 'clues') {
                                    body.innerHTML = this._renderCluesTab();
                                    this._bindTabEvents(body);
                                }
                            } else {
                                console.error('[MainStory] clues API error:', data?.error, 'HTTP', status);
                                body.innerHTML = '<div style="text-align:center;padding:40px;color:#B13E53;">' +
                                    '<div style="font-size:24px;margin-bottom:8px;">&#9888;</div>' +
                                    '<div>' + (data?.error || '线索加载失败 (HTTP ' + status + ')') + '</div>' +
                                    '<button onclick="MainStory._clues=null;MainStory._currentTab=\'clues\';MainStory._renderTabContent();" ' +
                                    'style="margin-top:12px;padding:6px 16px;background:#29ADFF;color:#fff;border:none;border-radius:4px;cursor:pointer;">重试</button>' +
                                    '</div>';
                            }
                        } else {
                            console.error('[MainStory] clues API HTTP error:', status);
                            body.innerHTML = '<div style="text-align:center;padding:40px;color:#B13E53;">' +
                                '<div style="font-size:24px;margin-bottom:8px;">&#9888;</div>' +
                                '<div>线索加载失败 (HTTP ' + status + ')</div>' +
                                '<div style="font-size:10px;color:#5F574F;margin-top:8px;">请检查网络或重新登录</div>' +
                                '<button onclick="MainStory._clues=null;MainStory._currentTab=\'clues\';MainStory._renderTabContent();" ' +
                                'style="margin-top:12px;padding:6px 16px;background:#29ADFF;color:#fff;border:none;border-radius:4px;cursor:pointer;">重试</button>' +
                                '</div>';
                        }
                    } catch (err) {
                        console.error('[MainStory] clues load exception:', err);
                        body.innerHTML = '<div style="text-align:center;padding:40px;color:#B13E53;">' +
                            '<div style="font-size:24px;margin-bottom:8px;">&#9888;</div>' +
                            '<div>网络错误</div>' +
                            '<button onclick="MainStory._clues=null;MainStory._currentTab=\'clues\';MainStory._renderTabContent();" ' +
                            'style="margin-top:12px;padding:6px 16px;background:#29ADFF;color:#fff;border:none;border-radius:4px;cursor:pointer;">重试</button>' +
                            '</div>';
                    }
                    return;
                }
            }

            switch (this._currentTab) {
                case 'tasks': body.innerHTML = this._renderTasksTab(); break;
                case 'clues': body.innerHTML = this._renderCluesTab(); break;
                case 'explore': body.innerHTML = this._renderExploreTab(); break;
            }
            this._bindTabEvents(body);
        },

        // ============================================
        // Tab: 任务
        // ============================================

        _renderTasksTab() {
            if (!this._progress) {
                console.warn('[MainStory] _renderTasksTab: _progress is null');
                return '<div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>';
            }
            const allTasks = this._progress.all_tasks || [];
            console.log('[MainStory] _renderTasksTab: allTasks length =', allTasks.length);
            const stageTasks = allTasks.filter(t => {
                const id = t.story_id;
                if (this._currentStage === '新生适应期') return id.startsWith('story_fresh');
                if (this._currentStage === '学业成长期') return id.startsWith('story_academic');
                if (this._currentStage === '实习准备期') return id.startsWith('story_career');
                if (this._currentStage === '毕业冲刺期') return id.startsWith('story_grad');
                return false;
            });
            console.log('[MainStory] _renderTasksTab: stageTasks length =', stageTasks.length, 'stage =', this._currentStage);
            if (stageTasks.length === 0 && allTasks.length > 0) {
                console.warn('[MainStory] story_id mismatch! first task id:', allTasks[0]?.story_id, 'currentStage:', this._currentStage);
            }

            const stageMeta = this._STAGE_META[this._currentStage] || {};
            const color = stageMeta.color || '#29ADFF';
            const completedCount = stageTasks.filter(t => t.status === 'completed').length;
            const pct = stageTasks.length > 0 ? Math.round(completedCount / stageTasks.length * 100) : 0;

            // 核心悬念展示
            const coreMystery = this._progress.core_mystery || '';
            const mysteryHint = this._progress.mystery_hint || '';

            // 隐藏任务
            const hiddenTasks = this._progress.hidden_tasks || [];
            const visibleHidden = hiddenTasks.filter(ht => {
                if (ht.is_completed) return true;
                if (this._currentStage === ht.stage) return true;
                return false;
            });

            const taskCards = stageTasks.map((t, idx) => {
                const statusIcon = t.status === 'completed' ? '\u2705' : t.status === 'active' ? '\uD83D\uDD39' : '\uD83D\uDD12';
                const statusColor = t.status === 'completed' ? '#00E436' : t.status === 'active' ? color : '#5F574F';
                const opacity = t.status === 'locked' ? 'opacity:0.5;' : '';
                const rewards = t.rewards || {};
                const isActive = t.status === 'active';
                const isBranch = t.is_branch_point;

                return `
                <div class="ms-task-card ${isActive ? 'ms-task-active' : ''} ${isBranch ? 'ms-task-branch' : ''}"
                     data-story-id="${t.story_id}"
                     style="${opacity}border-left:3px solid ${statusColor};${isActive ? `box-shadow:0 0 12px ${color}40;` : ''}">
                    ${isBranch ? '<div class="ms-branch-badge">\uD83D\uDCDD 关键抉择</div>' : ''}
                    <div class="ms-task-header">
                        <span class="ms-task-icon" style="color:${statusColor};">${statusIcon}</span>
                        <span class="ms-task-num">${idx + 1}</span>
                        <span class="ms-task-title">${t.title}</span>
                        <span class="ms-task-status" style="color:${statusColor};font-size:8px;font-family:\'Press Start 2P\',monospace;">
                            ${t.status === 'completed' ? '完成' : t.status === 'active' ? '进行中' : '锁定'}
                        </span>
                    </div>
                    <div class="ms-task-desc">${t.description}</div>
                    ${isActive && t.core_mystery_hint ? `<div class="ms-task-mystery"><span style="color:#B13E53;">\u2753</span> ${t.core_mystery_hint}</div>` : ''}
                    ${t.ar_marker ? `<div class="ms-task-ar"><span style="color:#FFA300;">\uD83D\uDCCF</span> ${t.ar_hint || t.ar_marker}</div>` : ''}
                    <div class="ms-task-reward">
                        <span style="color:#FFCD75;">\uD83C\uDFB0</span> ${rewards.experience || 0}经验
                        &nbsp;<span style="color:#FFCD75;">\uD83D\uDCB0</span> ${rewards.gold || 0}金币
                        ${rewards.skill_points ? `&nbsp;<span style="color:#29ADFF;">\u2B50</span> ${rewards.skill_points}技能点` : ''}
                        ${rewards.title ? `&nbsp;<span style="color:#FFA300;">\uD83C\uDFC6</span> ${rewards.title}` : ''}
                    </div>
                    ${t.clue_reward ? `<div class="ms-task-clue"><span style="color:#73EFF7;">\uD83D\uDCDD</span> 完成后获得线索奖励</div>` : ''}
                    ${isActive ? `
                    <div class="ms-task-actions">
                        <button class="ms-btn ms-btn-primary ms-btn-accept" data-story-id="${t.story_id}">接受任务</button>
                        <button class="ms-btn ms-btn-secondary ms-btn-complete" data-story-id="${t.story_id}"
                            ${t.ar_marker ? 'data-has-ar="true"' : ''}>完成任务</button>
                        ${isBranch ? `<button class="ms-btn ms-btn-accent ms-btn-branch" data-story-id="${t.story_id}">\uD83D\uDCDD 做出选择</button>` : ''}
                    </div>` : ''}
                </div>`;
            }).join('');

            // 隐藏任务
            const hiddenHtml = visibleHidden.length > 0 ? `
                <div class="ms-section-title" style="color:#FFA300;font-family:\'Press Start 2P\',monospace;font-size:8px;margin:16px 0 8px;">
                    \uD83C\uDFB2 隐藏任务 (${visibleHidden.filter(t => t.is_completed).length}/${visibleHidden.length})
                </div>
                ${visibleHidden.map(ht => `
                <div class="ms-hidden-card ${ht.is_completed ? 'ms-hidden-done' : ''}" data-task-id="${ht.task_id}">
                    <div class="ms-hidden-header">
                        <span>${ht.is_completed ? '\u2705' : '\u2753'}</span>
                        <span>${ht.name}</span>
                        <span class="ms-hidden-diff" style="font-size:8px;color:${ht.difficulty === 'hard' ? '#B13E53' : ht.difficulty === 'medium' ? '#FFA300' : '#00E436'};">
                            ${ht.difficulty === 'hard' ? '困难' : ht.difficulty === 'medium' ? '中等' : '简单'}
                        </span>
                    </div>
                    <div class="ms-hidden-desc">${ht.description}</div>
                    ${ht.is_completed ? '<div style="color:#00E436;font-size:9px;">\u2713 已完成</div>' :
                        `<div class="ms-hidden-trigger">触发条件：${this._getTriggerText(ht.trigger_type)}</div>`}
                </div>`).join('')}` : '';

            // 篇章谜题
            const puzzle = this._progress.chapter_puzzle;
            const puzzleHtml = puzzle ? `
                <div class="ms-puzzle-card ${puzzle.is_solved ? 'ms-puzzle-solved' : ''}" data-puzzle-id="${puzzle.puzzle_id}">
                    <div class="ms-puzzle-header">
                        <span>\uD83C\uDFAF</span>
                        <span>AR解谜：${puzzle.name}</span>
                        <span class="ms-puzzle-diff" style="font-size:8px;color:${puzzle.difficulty === 'hard' ? '#B13E53' : '#FFA300'};">
                            ${puzzle.difficulty === 'hard' ? '困难' : '中等'}
                        </span>
                    </div>
                    <div class="ms-puzzle-desc">${puzzle.description}</div>
                    ${puzzle.is_solved ? '<div style="color:#00E436;font-size:9px;">\u2713 已解答</div>' :
                        `<button class="ms-btn ms-btn-accent ms-btn-puzzle" data-puzzle-id="${puzzle.puzzle_id}" style="margin-top:8px;">
                            \uD83C\uDFAF 开始解谜
                        </button>`}
                </div>` : '';

            // 章节奖励
            const stageReward = this._progress.chapter_completed ? this._progress.chapter_reward : null;
            const rewardHtml = stageReward ? `
                <div class="ms-chapter-reward">
                    <div class="ms-reward-title">\uD83C\uDFC6 篇章奖励已解锁！</div>
                    <div class="ms-reward-items">
                        经验+${stageReward.experience} &nbsp;金币+${stageReward.gold}
                        ${stageReward.badge ? `&nbsp;获得「${stageReward.badge}」` : ''}
                        ${stageReward.title ? `&nbsp;称号：${stageReward.title}` : ''}
                    </div>
                </div>` : '';

            // NPC对话
            const npcDialogues = this._progress.npc_dialogues || {};
            const npcHtml = Object.keys(npcDialogues).length > 0 ? `
                <div class="ms-section-title" style="color:#73EFF7;font-family:\'Press Start 2P\',monospace;font-size:8px;margin:16px 0 8px;">
                    \uD83D\uDC64 NPC对话
                </div>
                ${Object.entries(npcDialogues).slice(0, 1).map(([npcId, dialogues]) =>
                    dialogues.slice(0, 2).map(d => `
                    <div class="ms-dialogue-card">
                        <div class="ms-dialogue-speaker">${d.speaker}</div>
                        <div class="ms-dialogue-text">${d.text}</div>
                    </div>`).join('')
                ).join('')}` : '';

            return `
                ${coreMystery ? `
                <div class="ms-mystery-banner" style="background:linear-gradient(135deg,#2a1a40,#1D2B53);border-bottom:2px solid #B13E53;padding:10px 12px;">
                    <div style="font-size:9px;color:#B13E53;font-family:\'Press Start 2P\',monospace;margin-bottom:4px;">\u2753 本章核心悬念</div>
                    <div style="font-size:12px;color:#F4F4F4;line-height:1.6;">${coreMystery}</div>
                    ${mysteryHint ? `<div style="font-size:11px;color:#C2C3C7;margin-top:4px;">\uD83D\uDCDD 提示：${mysteryHint}</div>` : ''}
                </div>` : ''}
                <div style="padding:10px 12px;">
                    <div style="font-size:9px;color:#C2C3C7;margin-bottom:8px;">任务进度：${completedCount}/${stageTasks.length} &nbsp;\u00B7&nbsp; ${pct}%</div>
                    ${taskCards || '<div style="text-align:center;padding:24px;color:#5F574F;">暂无任务</div>'}
                    ${hiddenHtml}
                    ${puzzleHtml}
                    ${npcHtml}
                    ${rewardHtml}
                </div>`;
        },

        // ============================================
        // Tab: 线索
        // ============================================

        _renderCluesTab() {
            if (!this._clues) {
                return `
                <div style="padding:12px;">
                    <div style="font-size:9px;color:#C2C3C7;margin-bottom:12px;font-family:\'Press Start 2P\',monospace;">
                        \uD83D\uDCDD 线索收集系统
                    </div>
                    <div style="text-align:center;padding:30px;color:#5F574F;font-size:12px;">
                        <div style="font-size:24px;margin-bottom:8px;">\uD83D\uDCDD</div>
                        <div>线索数据加载中...</div>
                    </div>
                </div>`;
            }

            const color = this._STAGE_COLORS[this._currentStage] || '#29ADFF';
            const collectedCount = this._clues.collected_count || 0;
            const totalCount = this._clues.total_count || 0;
            const pct = totalCount > 0 ? Math.round(collectedCount / totalCount * 100) : 0;

            const stageClues = this._clues.by_stage || {};
            const currentStageClues = stageClues[this._currentStage] || [];

            const rarityColor = {
                'common': '#C2C3C7',
                'rare': '#29ADFF',
                'epic': '#FFA300',
                'legendary': '#B13E53'
            };
            const rarityLabel = {
                'common': '普通',
                'rare': '稀有',
                'epic': '史诗',
                'legendary': '传说'
            };
            const categoryIcon = {
                'main': '\uD83D\uDCDD',
                'hidden': '\uD83C\uDFB2',
                'easter_egg': '\uD83C\uDF89'
            };

            const clueCards = currentStageClues.map(clue => {
                const isCollected = clue.is_collected;
                const rColor = rarityColor[clue.rarity] || '#C2C3C7';
                const catIcon = categoryIcon[clue.category] || '\uD83D\uDCDD';
                return `
                <div style="border-left:3px solid ${isCollected ? '#00E436' : '#5F574F'};padding:8px 10px;margin-bottom:6px;background:${isCollected ? 'rgba(0,228,54,0.08)' : 'rgba(95,87,79,0.15)'};border-radius:2px;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                        <span style="color:${isCollected ? '#00E436' : '#5F574F'};font-size:14px;">${isCollected ? '\u2705' : '\u2B24'}</span>
                        <span style="color:#F4F4F4;font-size:12px;font-weight:bold;">${clue.name}</span>
                        <span style="font-size:8px;color:${rColor};padding:1px 4px;border:1px solid ${rColor};border-radius:2px;">${rarityLabel[clue.rarity] || '普通'}</span>
                        ${clue.stitch_done ? '<span style="font-size:8px;color:#FFA300;padding:1px 4px;border:1px solid #FFA300;border-radius:2px;">\uD83C\uDF1F已拼接</span>' : ''}
                    </div>
                    <div style="font-size:11px;color:#C2C3C7;margin-bottom:4px;">${clue.description}</div>
                    ${clue.source ? `<div style="font-size:10px;color:#5F574F;">\u2116 来源：${clue.source}</div>` : ''}
                    ${clue.stitch_group_name ? `<div style="font-size:10px;color:#73EFF7;">\uD83C\uDF1F 线索组：${clue.stitch_group_name}</div>` : ''}
                </div>`;
            }).join('');

            return `
                <div style="padding:12px;">
                    <div style="font-size:9px;color:#C2C3C7;margin-bottom:12px;font-family:\'Press Start 2P\',monospace;">
                        \uD83D\uDCDD 线索收集系统
                    </div>
                    <div style="margin-bottom:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <span style="font-size:10px;color:#C2C3C7;">收集进度</span>
                            <span style="font-size:10px;color:#FFCD75;">${collectedCount}/${totalCount} (${pct}%)</span>
                        </div>
                        <div style="height:6px;background:#5F574F;border-radius:3px;overflow:hidden;">
                            <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width 0.4s;"></div>
                        </div>
                    </div>
                    ${currentStageClues.length > 0 ? clueCards : '<div style="text-align:center;padding:20px;color:#5F574F;font-size:11px;">当前篇章暂无线索<br>完成任务或探索校园可获得</div>'}
                    <div style="margin-top:12px;padding:8px 10px;background:rgba(95,87,79,0.2);border-radius:4px;font-size:10px;color:#5F574F;">
                        \uD83D\uDCA1 提示：完成任务、探索校园、与NPC对话可获得线索
                    </div>
                </div>`;
        },

        // ============================================
        // Tab: 探索
        // ============================================

        _renderExploreTab() {
            if (!this._progress) {
                return '<div style="text-align:center;padding:30px;color:#5F574F;">加载中...</div>';
            }

            const color = this._STAGE_COLORS[this._currentStage] || '#29ADFF';
            const exp = this._progress.exploration_progress || {};
            const discoveredAreas = exp.discovered_areas || [];
            const cluesFound = exp.total_clues_found || 0;

            // 探索区域定义（对应campus_pois.json）
            const ALL_ZONES = [
                { id: 'teaching', name: '\uD83C\uDF93 教学区', icon: '\uD83C\uDF93', desc: '教学楼、图书馆、实验室' },
                { id: 'living', name: '\uD83C\uDFE0 生活区', icon: '\uD83C\uDFE0', desc: '食堂、宿舍楼、便利店' },
                { id: 'landscape', name: '\u26F2 景观区', icon: '\u26F2', desc: '中心广场、湖边、花园' },
                { id: 'sports', name: '\uD83C\uDFC0 运动区', icon: '\uD83C\uDFC0', desc: '操场、体育馆、篮球场' }
            ];

            const zoneProgress = ALL_ZONES.map(zone => {
                const isDiscovered = discoveredAreas.includes(zone.id);
                return { ...zone, isDiscovered };
            });
            const discoveredCount = zoneProgress.filter(z => z.isDiscovered).length;
            const pct = Math.round((discoveredCount / ALL_ZONES.length) * 100);

            const zoneCards = zoneProgress.map(zone => `
                <div style="border:2px solid ${zone.isDiscovered ? color : '#5F574F'};padding:8px 10px;border-radius:4px;font-size:10px;color:${zone.isDiscovered ? color : '#5F574F'};opacity:${zone.isDiscovered ? '1' : '0.5'};background:${zone.isDiscovered ? color + '15' : 'transparent'};min-width:100px;">
                    <div style="font-size:14px;margin-bottom:2px;">${zone.isDiscovered ? '\u2705' : '\u2B24'}</div>
                    <div style="font-weight:bold;margin-bottom:2px;">${zone.name.replace(/^[^\s]+\s/, '')}</div>
                    <div style="font-size:9px;">${zone.desc}</div>
                </div>`).join('');

            return `
                <div style="padding:12px;">
                    <div style="font-size:9px;color:#C2C3C7;margin-bottom:12px;font-family:\'Press Start 2P\',monospace;">
                        \uD83D\uDDFA 探索进度
                    </div>
                    <div style="margin-bottom:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <span style="font-size:10px;color:#C2C3C7;">区域探索</span>
                            <span style="font-size:10px;color:#FFCD75;">${discoveredCount}/${ALL_ZONES.length} (${pct}%)</span>
                        </div>
                        <div style="height:6px;background:#5F574F;border-radius:3px;overflow:hidden;">
                            <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width 0.4s;"></div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
                        ${zoneCards}
                    </div>
                    <div style="border-top:1px solid #5F574F;padding-top:12px;">
                        <div style="font-size:9px;color:#C2C3C7;margin-bottom:8px;font-family:\'Press Start 2P\',monospace;">
                            \uD83D\uDCDD 探索收获
                        </div>
                        <div style="display:flex;gap:12px;margin-bottom:12px;">
                            <div style="flex:1;padding:8px;background:rgba(41,173,255,0.15);border:1px solid #29ADFF;border-radius:4px;text-align:center;">
                                <div style="font-size:18px;color:#29ADFF;">${cluesFound}</div>
                                <div style="font-size:9px;color:#73EFF7;">探索发现线索</div>
                            </div>
                            <div style="flex:1;padding:8px;background:rgba(0,228,54,0.15);border:1px solid #00E436;border-radius:4px;text-align:center;">
                                <div style="font-size:18px;color:#00E436;">${discoveredCount}</div>
                                <div style="font-size:9px;color:#00E436;">已探索区域</div>
                            </div>
                        </div>
                    </div>
                    <div style="padding:8px 10px;background:rgba(95,87,79,0.2);border-radius:4px;font-size:10px;color:#5F574F;">
                        \uD83D\uDCA1 提示：在校园地图中点击探索点，触发剧情线索和隐藏彩蛋！
                    </div>
                </div>`;
        },

        _bindTabEvents(body) {
            // 接受任务
            body.querySelectorAll('.ms-btn-accept').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const storyId = btn.dataset.storyId;
                    btn.disabled = true; btn.textContent = '接受中...';
                    try {
                        const resp = await window.Auth.apiFetch('/api/story/accept', {
                            method: 'POST',
                            body: JSON.stringify({ story_id: storyId })
                        });
                        if (resp && resp.ok) {
                            btn.textContent = '已接受';
                            window.showNotification(`任务「${storyId}」已添加到你的任务列表！`, 'success');
                            this._refresh();
                        } else {
                            btn.disabled = false; btn.textContent = '接受任务';
                            window.showNotification('接受任务失败', 'error');
                        }
                    } catch {
                        btn.disabled = false; btn.textContent = '接受任务';
                    }
                });
            });

            // 完成任务
            body.querySelectorAll('.ms-btn-complete').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const storyId = btn.dataset.storyId;
                    const hasAR = btn.dataset.hasAr === 'true';
                    if (hasAR) {
                        window.showNotification('请先在校园中扫描AR标记，再完成任务', 'info');
                        return;
                    }
                    await this._completeTask(storyId, btn);
                });
            });

            // 分支选择
            body.querySelectorAll('.ms-btn-branch').forEach(btn => {
                btn.addEventListener('click', () => {
                    const storyId = btn.dataset.storyId;
                    this._showBranchChoice(storyId);
                });
            });

            // 谜题
            body.querySelectorAll('.ms-btn-puzzle').forEach(btn => {
                btn.addEventListener('click', () => {
                    const puzzleId = btn.dataset.puzzleId;
                    this._showPuzzleModal(puzzleId);
                });
            });
        },

        async _completeTask(storyId, btn) {
            if (!btn) return;
            btn.disabled = true; btn.textContent = '完成中...';
            try {
                const resp = await window.Auth.apiFetch(`/api/story/complete/${storyId}`, { method: 'POST' });
                if (!resp || !resp.ok) {
                    const err = await resp?.json().catch(() => ({}));
                    window.showNotification(err.error || '完成任务失败', 'error');
                    btn.disabled = false; btn.textContent = '完成任务';
                    return;
                }
                const result = await resp.json();
                const rewards = result.rewards || {};
                this._showRewardAnimation(rewards, result);
                if (result.new_clue) {
                    window.showNotification(`获得线索：「${result.new_clue.name}」！`, 'success');
                }
                if (result.chapter_completed) {
                    window.showNotification(`恭喜！篇章全部任务完成！获得 ${result.chapter_reward?.experience || 0} 经验和 ${result.chapter_reward?.gold || 0} 金币！`, 'success');
                } else if (result.next_task) {
                    window.showNotification(`任务完成！下一任务「${result.next_task.title}」已解锁！`, 'success');
                } else {
                    window.showNotification(`任务完成！`, 'success');
                }
                setTimeout(() => this._refresh(), 2500);
            } catch {
                if (btn) { btn.disabled = false; btn.textContent = '完成任务'; }
                window.showNotification('网络错误', 'error');
            }
        },

        _showBranchChoice(storyId) {
            if (!this._progress) return;
            const task = (this._progress.all_tasks || []).find(t => t.story_id === storyId);
            if (!task || !task.branches || task.branches.length === 0) return;
            const branch = task.branches[0];

            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:11000;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `
                <div style="width:90vw;max-width:500px;background:#1D2B53;border:3px solid #FFA300;border-radius:4px;padding:20px;box-shadow:4px 4px 0 #000;">
                    <div style="text-align:center;font-size:11px;color:#FFA300;font-family:\'Press Start 2P\',monospace;margin-bottom:16px;">
                        \uD83D\uDCDD ${branch.choice_label}
                    </div>
                    <div style="margin-bottom:16px;font-size:13px;color:#F4F4F4;line-height:1.8;">
                        ${task.detail}
                    </div>
                    ${branch.options.map(opt => `
                    <button class="ms-branch-option" data-value="${opt.value}" style="
                        display:block;width:100%;padding:12px;margin-bottom:10px;
                        background:#0d1b3e;border:2px solid #5F574F;border-radius:4px;
                        color:#F4F4F4;font-size:12px;text-align:left;cursor:pointer;
                        transition:all 0.2s;">
                        <div style="font-weight:700;margin-bottom:4px;">\u25B6 ${opt.label}</div>
                        <div style="font-size:11px;color:#C2C3C7;">${opt.description}</div>
                        <div style="font-size:10px;color:#00E436;margin-top:4px;">\u2192 ${opt.effect}</div>
                    </button>`).join('')}
                    <button id="ms-branch-cancel" style="
                        display:block;width:100%;padding:8px;
                        background:transparent;border:2px solid #5F574F;border-radius:4px;
                        color:#5F574F;font-size:10px;cursor:pointer;margin-top:4px;">
                        暂不选择
                    </button>
                </div>`;
            document.body.appendChild(overlay);

            overlay.querySelectorAll('.ms-branch-option').forEach(optBtn => {
                optBtn.addEventListener('click', async () => {
                    const value = optBtn.dataset.value;
                    optBtn.style.borderColor = '#00E436';
                    optBtn.style.background = 'rgba(0,228,54,0.1)';
                    try {
                        await window.Auth.apiFetch('/api/story/choices', {
                            method: 'POST',
                            body: JSON.stringify({ choice_id: branch.choice_id, choice_value: value })
                        });
                        window.showNotification(`选择已记录：${value === 'employment' ? '就业方向' : '考研深造'}`, 'success');
                        setTimeout(() => { overlay.remove(); this._refresh(); }, 1500);
                    } catch {
                        window.showNotification('选择失败', 'error');
                    }
                });
            });

            overlay.querySelector('#ms-branch-cancel').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        },

        _showPuzzleModal(puzzleId) {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:11000;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `
                <div style="width:90vw;max-width:500px;max-height:80vh;overflow-y:auto;background:#1D2B53;border:3px solid #73EFF7;border-radius:4px;padding:20px;box-shadow:4px 4px 0 #000;">
                    <div style="text-align:center;font-size:10px;color:#73EFF7;font-family:\'Press Start 2P\',monospace;margin-bottom:12px;">
                        \uD83C\uDFAF AR解谜
                    </div>
                    <div style="text-align:center;font-size:14px;color:#F4F4F4;margin-bottom:12px;" id="ms-puzzle-name">加载中...</div>
                    <div style="font-size:12px;color:#C2C3C7;line-height:1.8;margin-bottom:16px;" id="ms-puzzle-desc"></div>
                    <div id="ms-puzzle-hints" style="margin-bottom:12px;"></div>
                    <div style="margin-bottom:12px;">
                        <input id="ms-puzzle-input" type="text" placeholder="输入答案..." style="
                            width:100%;padding:10px;background:#0d1b3e;border:2px solid #5F574F;
                            color:#F4F4F4;font-size:13px;border-radius:4px;outline:none;box-sizing:border-box;">
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button id="ms-puzzle-submit" class="ms-btn ms-btn-primary" style="flex:1;">提交答案</button>
                        <button id="ms-puzzle-hint-btn" class="ms-btn ms-btn-secondary" style="flex:1;">获取提示</button>
                    </div>
                    <button id="ms-puzzle-close" style="
                        display:block;width:100%;margin-top:8px;padding:8px;
                        background:transparent;border:2px solid #5F574F;border-radius:4px;
                        color:#5F574F;font-size:10px;cursor:pointer;">关闭</button>
                </div>`;
            document.body.appendChild(overlay);

            overlay.querySelector('#ms-puzzle-close').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

            overlay.querySelector('#ms-puzzle-submit').addEventListener('click', async () => {
                const answer = overlay.querySelector('#ms-puzzle-input').value.trim();
                if (!answer) { window.showNotification('请输入答案', 'info'); return; }
                try {
                    const resp = await window.Auth.apiFetch(`/api/story/puzzle/${puzzleId}/verify`, {
                        method: 'POST',
                        body: JSON.stringify({ answer })
                    });
                    const result = await resp.json();
                    if (result.success) {
                        window.showNotification(`谜题解答成功！获得 ${result.reward?.experience || 0} 经验和 ${result.reward?.gold || 0} 金币！`, 'success');
                        setTimeout(() => { overlay.remove(); this._refresh(); }, 2500);
                    } else {
                        window.showNotification(result.message || '答案不正确', 'error');
                    }
                } catch {
                    window.showNotification('验证失败', 'error');
                }
            });

            overlay.querySelector('#ms-puzzle-hint-btn').addEventListener('click', async () => {
                try {
                    const resp = await window.Auth.apiFetch(`/api/story/puzzle/${puzzleId}/hint`);
                    const result = await resp.json();
                    if (result.success) {
                        overlay.querySelector('#ms-puzzle-hints').innerHTML = `
                            <div style="font-size:10px;color:#FFA300;padding:8px;background:rgba(255,163,0,0.1);border-radius:4px;">
                                \uD83D\uDCA1 提示${result.hint_level}：${result.hint}
                            </div>`;
                    } else {
                        window.showNotification(result.error || '获取提示失败', 'error');
                    }
                } catch {
                    window.showNotification('获取提示失败', 'error');
                }
            });
        },

        _showRewardAnimation(rewards, result) {
            if (!this._modal) return;
            const body = document.querySelector('#ms-body');
            if (!body) return;
            body.innerHTML = `
                <div style="text-align:center;padding:40px 20px;">
                    <div style="font-size:48px;margin-bottom:16px;animation:msRewardPop 0.5s cubic-bezier(0.34,1.56,0.64,1);">\uD83C\uDF89</div>
                    <div style="font-size:11px;color:#FFCD75;font-family:\'Press Start 2P\',monospace;margin-bottom:16px;">任务完成!</div>
                    <div style="font-size:12px;color:#F4F4F4;line-height:2.2;">
                        ${rewards.experience ? `<div><span style="color:#A7F070;">\u2B50</span> 经验 +${rewards.experience}</div>` : ''}
                        ${rewards.gold ? `<div><span style="color:#FFCD75;">\uD83D\uDCB0</span> 金币 +${rewards.gold}</div>` : ''}
                        ${rewards.skill_points ? `<div><span style="color:#29ADFF;">\u2B50</span> 技能点 +${rewards.skill_points}</div>` : ''}
                        ${rewards.item ? `<div><span style="color:#73EFF7;">\uD83C\uDF81</span> 获得道具：${rewards.item}</div>` : ''}
                        ${rewards.title ? `<div><span style="color:#FFA300;">\uD83C\uDFC6</span> 获得称号：${rewards.title}</div>` : ''}
                        ${result?.new_clue ? `<div><span style="color:#B13E53;">\uD83D\uDCDD</span> 获得线索：${result.new_clue.name}</div>` : ''}
                    </div>
                    <div style="font-size:10px;color:#5F574F;margin-top:20px;">正在加载下一任务...</div>
                </div>`;
        },

        _showError(msg) {
            if (!this._modal) return;
            const body = document.querySelector('#ms-body');
            if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:#B13E53;">${msg}</div>`;
        },

        // ============================================
        // 辅助方法
        // ============================================

        _STAGE_META: {
            '新生适应期': { color: '#29ADFF', icon: '\uD83C\uDF93', title: '第一章：校园初探', subtitle: '大一·适应篇' },
            '学业成长期': { color: '#00E436', icon: '\uD83D\uDCDA', title: '第二章：学业精进', subtitle: '大二·成长篇' },
            '实习准备期': { color: '#FFA300', icon: '\uD83D\uDCBC', title: '第三章：职前试炼', subtitle: '大三·过渡篇' },
            '毕业冲刺期': { color: '#B13E53', icon: '\uD83C\uDF89', title: '终章：梦想启航', subtitle: '大四·毕业篇' }
        },

        _STAGE_COLORS: {
            '新生适应期': '#29ADFF',
            '学业成长期': '#00E436',
            '实习准备期': '#FFA300',
            '毕业冲刺期': '#B13E53'
        },

        _getTriggerText(type) {
            const map = {
                'time': '特定时间段访问',
                'map_click': '探索地图特定位置',
                'ar_scan': 'AR扫描特定地点',
                'npc_affection': 'NPC好感度达标',
                'npc_all_max': '所有NPC好感度满级',
                'exploration_full': '探索度100%',
                'manual': '手动触发'
            };
            return map[type] || type;
        },

        // ============================================
        // CSS & 模板
        // ============================================

        _css() {
            return `<style>
            @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
            @keyframes msModalIn {
                from{opacity:0;transform:scale(0.88) translateY(20px);}
                to{opacity:1;transform:scale(1) translateY(0);}
            }
            @keyframes msRewardPop {
                0%{transform:scale(0.4);opacity:0;}
                60%{transform:scale(1.15);}
                100%{transform:scale(1);opacity:1;}
            }
            #ms-container{font-family:'Noto Sans SC','Microsoft YaHei',sans-serif;}
            .ms-modal-header{
                background:linear-gradient(180deg,#5D275D,#3a1940);
                border-bottom:3px solid #B13E53;
                padding:10px 16px;
                display:flex;align-items:center;justify-content:space-between;
                flex-wrap:wrap;gap:8px;
            }
            .ms-modal-title{
                display:flex;align-items:center;gap:8px;
                font-size:10px;color:#FFCD75;font-family:'Press Start 2P',monospace;
            }
            .ms-close-btn{
                background:transparent;border:2px solid #5F574F;color:#C2C3C7;
                width:28px;height:28px;cursor:pointer;font-size:14px;
                display:flex;align-items:center;justify-content:center;
                border-radius:2px;transition:all 0.1s;
            }
            .ms-close-btn:hover{border-color:#FFF1E8;color:#FFF1E8;}
            .ms-header-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
            .ms-stage-badge{
                display:flex;align-items:center;gap:6px;
                padding:4px 10px;border:2px solid;border-radius:4px;
                font-size:8px;font-family:'Press Start 2P',monospace;
            }
            .ms-header-stats{display:flex;gap:10px;flex-wrap:wrap;}
            .ms-progress-mini{
                flex:1;min-width:80px;height:6px;
                background:#1a1a2e;border:2px solid #5F574F;border-radius:2px;
            }
            #ms-tabs{
                display:flex;background:#0d1b3e;
                border-bottom:2px solid #5D275D;
                overflow-x:auto;scrollbar-width:none;
            }
            #ms-tabs::-webkit-scrollbar{display:none;}
            .ms-tab{
                flex:1;min-width:80px;padding:8px 4px;
                background:transparent;border:none;border-bottom:3px solid transparent;
                color:#5F574F;cursor:pointer;transition:all 0.2s;
                display:flex;flex-direction:column;align-items:center;gap:3px;
            }
            .ms-tab.ms-tab-active{border-bottom-color:#29ADFF;color:#29ADFF;}
            .ms-tab:hover:not([disabled]){color:#FFF1E8;}
            #ms-body{
                flex:1;overflow-y:auto;padding:0;
                scrollbar-width:thin;scrollbar-color:#5D275D #0d1b3e;
            }
            #ms-body::-webkit-scrollbar{width:6px;}
            #ms-body::-webkit-scrollbar-track{background:#0d1b3e;}
            #ms-body::-webkit-scrollbar-thumb{background:#5D275D;border-radius:3px;}
            .ms-inner-tabs{
                display:flex;background:#0d1b3e;
                border-bottom:2px solid #5D275D;
            }
            .ms-inner-tab{
                flex:1;padding:8px;
                background:transparent;border:none;color:#5F574F;
                font-size:10px;cursor:pointer;
                border-bottom:2px solid transparent;transition:all 0.2s;
                display:flex;align-items:center;justify-content:center;gap:4px;
            }
            .ms-inner-tab.ms-inner-active{border-bottom-color:#FFCD75;color:#FFCD75;}
            .ms-section-title{font-weight:700;margin:16px 0 8px;}
            .ms-task-card{
                background:#0d1b3e;border:2px solid #5F574F;
                border-radius:3px;padding:12px;margin-bottom:10px;
                transition:all 0.2s;
            }
            .ms-task-card.ms-task-active{border-color:#29ADFF40;}
            .ms-task-card.ms-task-branch{border-color:#FFA30040;}
            .ms-task-card:hover{transform:translateX(2px);}
            .ms-branch-badge{
                display:inline-block;font-size:8px;color:#FFA300;
                background:rgba(255,163,0,0.15);padding:2px 6px;
                border-radius:2px;margin-bottom:6px;
                font-family:'Press Start 2P',monospace;
            }
            .ms-task-header{
                display:flex;align-items:center;gap:6px;margin-bottom:6px;
                font-size:12px;color:#F4F4F4;
            }
            .ms-task-num{font-size:9px;font-family:'Press Start 2P',monospace;}
            .ms-task-title{font-weight:600;flex:1;}
            .ms-task-status{font-family:'Press Start 2P',monospace;}
            .ms-task-desc{font-size:11px;color:#C2C3C7;line-height:1.7;margin-bottom:6px;}
            .ms-task-mystery{font-size:11px;color:#B13E53;margin-bottom:4px;padding:4px 8px;background:rgba(177,62,83,0.1);border-radius:2px;}
            .ms-task-ar{font-size:10px;color:#FFA300;margin-bottom:4px;padding:4px 8px;background:rgba(255,163,0,0.1);border-radius:2px;}
            .ms-task-reward{font-size:11px;color:#F4F4F4;margin-bottom:4px;}
            .ms-task-clue{font-size:10px;color:#73EFF7;margin-bottom:4px;}
            .ms-task-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}
            .ms-hidden-card{
                background:#0d1b3e;border:2px dashed #FFA300;
                border-radius:3px;padding:10px;margin-bottom:8px;
            }
            .ms-hidden-card.ms-hidden-done{border-style:solid;border-color:#00E436;opacity:0.7;}
            .ms-hidden-header{display:flex;align-items:center;gap:6px;font-size:12px;color:#F4F4F4;margin-bottom:4px;}
            .ms-hidden-desc{font-size:11px;color:#C2C3C7;line-height:1.6;}
            .ms-hidden-trigger{font-size:10px;color:#FFA300;margin-top:4px;}
            .ms-puzzle-card{
                background:#0d1b3e;border:2px solid #73EFF7;
                border-radius:3px;padding:12px;margin-bottom:12px;
            }
            .ms-puzzle-card.ms-puzzle-solved{border-color:#00E436;opacity:0.7;}
            .ms-puzzle-header{display:flex;align-items:center;gap:8px;font-size:12px;color:#F4F4F4;margin-bottom:6px;}
            .ms-dialogue-card{background:#0d1b3e;border:2px solid #5F574F;border-radius:3px;padding:10px;margin-bottom:8px;}
            .ms-dialogue-speaker{font-size:10px;color:#73EFF7;font-weight:700;margin-bottom:4px;}
            .ms-dialogue-text{font-size:11px;color:#C2C3C7;line-height:1.7;font-style:italic;}
            .ms-chapter-reward{
                border-top:3px solid #FFCD75;
                background:linear-gradient(180deg,#2a1a40,#1D2B53);
                padding:16px;margin-top:8px;border-radius:0 0 4px 4px;
            }
            .ms-reward-title{text-align:center;font-size:9px;color:#FFCD75;font-family:'Press Start 2P',monospace;margin-bottom:8px;}
            .ms-reward-items{text-align:center;font-size:12px;color:#F4F4F4;}
            .ms-mystery-banner{border-radius:4px 4px 0 0;}
            .ms-btn{
                display:inline-block;padding:7px 14px;
                font-family:'Press Start 2P',monospace;font-size:8px;
                cursor:pointer;border-width:2px;border-style:solid;
                box-shadow:2px 2px 0 rgba(0,0,0,0.5);
                transition:all 0.1s;border-radius:2px;
            }
            .ms-btn:active:not(:disabled){transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(0,0,0,0.5);}
            .ms-btn:disabled{opacity:0.5;cursor:not-allowed;}
            .ms-btn-primary{background:#008751;color:#FFF1E8;border-color:#00E436;}
            .ms-btn-primary:hover:not(:disabled){background:#00E436;}
            .ms-btn-secondary{background:transparent;color:#C2C3C7;border-color:#5F574F;}
            .ms-btn-secondary:hover:not(:disabled){border-color:#FFF1E8;color:#FFF1E8;}
            .ms-btn-accent{background:#5D275D;color:#FFCD75;border-color:#B13E53;}
            .ms-btn-accent:hover:not(:disabled){background:#B13E53;}
            .ms-explore-progress{background:#0d1b3e;border:2px solid #5F574F;border-radius:4px;padding:12px;}
            .ms-zone-chip{transition:all 0.2s;cursor:default;}
            .ms-zone-chip:hover{transform:scale(1.05);}
            @media(max-width:480px){
                .ms-tab{min-width:60px;padding:6px 2px;}
                .ms-tab span:last-child{font-size:7px;}
                .ms-btn{font-size:7px;padding:6px 10px;}
                .ms-header-stats{font-size:9px;}
            }
            </style>`;
        },

        _tpl(name) {
            if (name === 'shell') {
                return `
                <div class="ms-modal-header">
                    <div class="ms-modal-title">
                        <span style="font-size:16px;">\u2694</span>
                        <span>主线剧情</span>
                    </div>
                    <button class="ms-close-btn" id="ms-close">\u2715</button>
                </div>
                <div id="ms-header" style="background:#0d1b3e;padding:8px 12px;border-bottom:2px solid #5D275D;"></div>
                <div id="ms-tabs"></div>
                <div class="ms-inner-tabs">
                    <button class="ms-inner-tab ms-inner-active" data-tab="tasks">
                        <span>\u2694</span><span>任务</span>
                    </button>
                    <button class="ms-inner-tab" data-tab="clues">
                        <span>\uD83D\uDCDD</span><span>线索</span>
                    </button>
                    <button class="ms-inner-tab" data-tab="explore">
                        <span>\uD83D\uDDFA</span><span>探索</span>
                    </button>
                </div>
                <div id="ms-body" style="flex:1;overflow-y:auto;">
                    <div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>
                </div>`;
            }
            return '';
        }
    };

    window.MainStory = MainStory;
})();
