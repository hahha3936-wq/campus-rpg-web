/**
 * 校园RPG - 社交面板模块
 * 像素风格UI，集成分页/好友/排行榜/公会功能
 * 对接 /api/social/* 接口
 */

(function () {
    'use strict';

    const SocialUI = {
        _modal: null,
        _escHandler: null,
        _activeTab: 'leaderboard',
        _activeLBType: 'campus_level',
        _lbPeriod: 'week',
        _guildTab: 'my_guild',

        open() {
            if (this._modal) {
                const existing = document.getElementById('su-overlay');
                if (existing) {
                    this._modal.show();
                } else {
                    this._render();
                }
                return;
            }
            this._render();
        },

        close() {
            if (this._modal) this._modal.remove();
        },

        _render() {
            const existing = document.getElementById('su-overlay');
            if (existing) existing.remove();
            const modal = this._createModal();
            document.body.appendChild(modal._node);
            this._modal = modal;
            this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
            document.addEventListener('keydown', this._escHandler);
        },

        _createModal() {
            const overlay = document.createElement('div');
            overlay.id = 'su-overlay';
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:10990;',
                'background:rgba(0,0,0,0.85);',
                'display:flex;align-items:center;justify-content:center;',
                'font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;'
            ].join('');
            overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });

            const container = document.createElement('div');
            container.id = 'su-container';
            container.style.cssText = [
                'width:96vw;max-width:640px;max-height:90vh;',
                'display:flex;flex-direction:column;',
                'background:#1D2B53;',
                'border:3px solid #FFF1E8;',
                'box-shadow:6px 6px 0 #000,0 0 40px rgba(41,173,255,0.1);',
                'border-radius:4px;overflow:hidden;',
                'animation:suModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1);'
            ].join('');
            container.innerHTML = this._css() + this._tpl();
            overlay.appendChild(container);

            this._bindShellEvents(container);
            this._switchTab('leaderboard');
            return {
                _node: overlay,
                show: () => { overlay.style.display = 'flex'; },
                hide: () => { overlay.style.display = 'none'; },
                remove: () => { overlay.remove(); document.removeEventListener('keydown', this._escHandler); this._modal = null; }
            };
        },

        _bindShellEvents(container) {
            container.querySelector('#su-close').addEventListener('click', () => this.close());
            container.querySelectorAll('.su-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    this._activeTab = tab.dataset.tab;
                    container.querySelectorAll('.su-tab').forEach(t => t.classList.remove('su-tab-active'));
                    tab.classList.add('su-tab-active');
                    this._switchTab(this._activeTab);
                });
            });
        },

        _switchTab(tab) {
            this._activeTab = tab;
            const container = document.getElementById('su-container');
            if (!container) return;
            const content = container.querySelector('#su-content');
            if (!content) return;
            content.innerHTML = this._getTabHTML(tab);
            this._bindTabContent(container, tab);
            if (tab !== 'guild') this._loadTabData(tab);
        },

        _refresh() {
            this._switchTab(this._activeTab);
        },

        _getTabHTML(tab) {
            if (tab === 'leaderboard') {
                const types = [
                    { id: 'campus_level', label: '等级榜', icon: '\u2694' },
                    { id: 'class_tasks', label: '任务榜', icon: '\uD83D\uDCCB' },
                    { id: 'ar_explore', label: 'AR探索榜', icon: '\uD83D\uDCF7' }
                ];
                const periods = ['day', 'week', 'month'];
                const periodLabels = { day: '今日', week: '本周', month: '本月' };
                return `
                    <div style="padding:12px 14px 0;">
                        <div style="display:flex;gap:6px;margin-bottom:10px;">
                            ${types.map(t => `
                                <button class="su-lb-tab ${this._activeLBType === t.id ? 'active' : ''}" data-lb-type="${t.id}">
                                    <span>${t.icon}</span><span>${t.label}</span>
                                </button>`).join('')}
                        </div>
                        <div style="display:flex;gap:4px;margin-bottom:12px;">
                            ${periods.map(p => `
                                <button class="su-period-btn ${this._lbPeriod === p ? 'active' : ''}" data-period="${p}">
                                    ${periodLabels[p]}
                                </button>`).join('')}
                        </div>
                    </div>
                    <div id="su-lb-body" style="min-height:200px;max-height:380px;overflow-y:auto;padding:0 14px 14px;scrollbar-width:thin;scrollbar-color:#5D275D #0d1b3e;">
                        <div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>
                    </div>`;
            }
            if (tab === 'friends') {
                return `
                    <div style="padding:12px 14px 0;border-bottom:2px solid #5D275D;">
                        <div style="display:flex;gap:6px;margin-bottom:8px;">
                            <button class="su-fr-tab active" data-fr-tab="list">好友</button>
                            <button class="su-fr-tab" data-fr-tab="requests">申请 <span id="su-req-badge" style="background:#B13E53;color:#FFF;font-size:9px;padding:1px 4px;border-radius:8px;display:none;">0</span></button>
                            <button class="su-fr-tab" data-fr-tab="search">搜索</button>
                        </div>
                    </div>
                    <div id="su-fr-body" style="min-height:200px;max-height:380px;overflow-y:auto;padding:12px 14px;scrollbar-width:thin;scrollbar-color:#5D275D #0d1b3e;">
                        <div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>
                    </div>`;
            }
            if (tab === 'guild') {
                return `
                    <div style="padding:12px 14px 0;border-bottom:2px solid #5D275D;">
                        <div style="display:flex;gap:6px;margin-bottom:8px;">
                            <button class="su-g-tab active" data-g-tab="my">我的公会</button>
                            <button class="su-g-tab" data-g-tab="list">公会列表</button>
                        </div>
                    </div>
                    <div id="su-g-body" style="min-height:200px;max-height:380px;overflow-y:auto;padding:12px 14px;scrollbar-width:thin;scrollbar-color:#5D275D #0d1b3e;">
                        <div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>
                    </div>`;
            }
            return '';
        },

        _bindTabContent(container, tab) {
            if (tab === 'leaderboard') {
                container.querySelectorAll('.su-lb-tab').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this._activeLBType = btn.dataset.lbType;
                        container.querySelectorAll('.su-lb-tab').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this._loadLeaderboard();
                    });
                });
                container.querySelectorAll('.su-period-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this._lbPeriod = btn.dataset.period;
                        container.querySelectorAll('.su-period-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this._loadLeaderboard();
                    });
                });
                this._loadLeaderboard();
            }
            if (tab === 'friends') {
                container.querySelectorAll('.su-fr-tab').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const subTab = btn.dataset.frTab;
                        container.querySelectorAll('.su-fr-tab').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this._switchFriendsTab(subTab);
                    });
                });
                this._switchFriendsTab('list');
            }
            if (tab === 'guild') {
                container.querySelectorAll('.su-g-tab').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this._guildTab = btn.dataset.gTab;
                        container.querySelectorAll('.su-g-tab').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this._loadGuildTab();
                    });
                });
                this._loadGuildTab();
            }
        },

        async _loadTabData(tab) {
            // handled in _switchTab
        },

        // ============================================
        // 排行榜
        // ============================================

        async _loadLeaderboard() {
            const body = document.getElementById('su-lb-body');
            if (!body) return;
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>';
            try {
                const resp = await window.Auth.apiFetch(`/api/social/leaderboard/${this._activeLBType}?period=${this._lbPeriod}`);
                if (!resp || !resp.ok) { body.innerHTML = this._errHTML('加载失败'); return; }
                const json = await resp.json();
                if (!json.success) { body.innerHTML = this._errHTML(json.error || '加载失败'); return; }
                body.innerHTML = this._renderLeaderboard(json);
                this._bindLeaderboardEvents(body);
            } catch {
                body.innerHTML = this._errHTML('网络错误');
            }
        },

        _renderLeaderboard(data) {
            const rankings = data.rankings || [];
            const typeLabels = { campus_level: '等级', class_tasks: '完成任务', ar_explore: 'AR标记' };
            if (rankings.length === 0) {
                return '<div style="text-align:center;padding:40px;color:#5F574F;">暂无数据</div>';
            }
            const html = rankings.map(r => {
                const medal = r.rank === 1 ? '\uD83E\uDD47' : r.rank === 2 ? '\uD83E\uDD48' : r.rank === 3 ? '\uD83E\uDD49' : '';
                const rowColor = r.rank <= 3 ? '#FFF1E8' : r.is_self ? '#29ADFF20' : '';
                const rankStyle = r.rank <= 3 ? `color:${r.rank === 1 ? '#FFD700' : r.rank === 2 ? '#C0C0C0' : '#CD7F32'};` : 'color:#5F574F;';
                return `
                <div class="su-lb-row ${r.is_self ? 'su-lb-self' : ''}" style="display:flex;align-items:center;padding:8px 10px;border-bottom:1px solid #5D275D40;background:${rowColor};">
                    <span class="su-lb-rank" style="width:36px;text-align:center;font-family:'Press Start 2P',monospace;font-size:8px;${rankStyle}">
                        ${medal || '#' + r.rank}
                    </span>
                    <div class="su-lb-avatar" style="width:32px;height:32px;background:#5D275D;border-radius:4px;border:2px solid #5F574F;display:flex;align-items:center;justify-content:center;font-size:10px;color:#FFCD75;font-weight:700;margin-right:8px;flex-shrink:0;">
                        Lv${r.level}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:12px;color:#F4F4F4;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${r.name} ${r.is_self ? '<span style="color:#29ADFF;font-size:8px;font-family:\'Press Start 2P\';">[你]</span>' : ''}
                        </div>
                        <div style="font-size:9px;color:#C2C3C7;">Lv.${r.level}</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:11px;color:#FFCD75;font-family:'Press Start 2P',monospace;">${r.value}</div>
                        <div style="font-size:9px;color:#5F574F;">${typeLabels[this._activeLBType]}</div>
                    </div>
                </div>`;
            }).join('');
            return `<div style="border:2px solid #5D275D;border-radius:3px;overflow:hidden;">${html}</div>`;
        },

        _bindLeaderboardEvents(body) {
            // placeholder for future interactions
        },

        // ============================================
        // 好友
        // ============================================

        async _switchFriendsTab(subTab) {
            const body = document.getElementById('su-fr-body');
            if (!body) return;
            if (subTab === 'list') await this._loadFriendsList(body);
            if (subTab === 'requests') await this._loadRequests(body);
            if (subTab === 'search') this._renderSearch(body);
        },

        async _loadFriendsList(body) {
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>';
            try {
                const resp = await window.Auth.apiFetch('/api/social/friends');
                if (!resp || !resp.ok) { body.innerHTML = this._errHTML('加载失败'); return; }
                const json = await resp.json();
                if (!json.success) { body.innerHTML = this._errHTML(json.error); return; }
                body.innerHTML = this._renderFriendsList(json.friends || []);
                this._bindFriendsEvents(body);
            } catch { body.innerHTML = this._errHTML('网络错误'); }
        },

        _renderFriendsList(friends) {
            if (friends.length === 0) {
                return `<div style="text-align:center;padding:40px 20px;">
                    <div style="font-size:48px;margin-bottom:12px;">\uD83D\uDC64</div>
                    <div style="color:#5F574F;font-size:12px;margin-bottom:16px;">还没有好友，去搜索添加吧</div>
                    <button class="su-btn su-btn-secondary" onclick="SocialUI._goFriendTab('search')">搜索用户</button>
                </div>`;
            }
            return friends.map(f => `
                <div class="su-fr-row" style="display:flex;align-items:center;padding:10px;border-bottom:1px solid #5D275D40;">
                    <div style="width:40px;height:40px;background:#5D275D;border-radius:4px;border:2px solid #5F574F;display:flex;align-items:center;justify-content:center;font-size:10px;color:#FFCD75;margin-right:10px;flex-shrink:0;">Lv${f.level}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;color:#F4F4F4;font-weight:600;">${f.name}</div>
                        <div style="font-size:9px;color:#5F574F;font-family:'Press Start 2P',monospace;">Lv.${f.level}</div>
                    </div>
                    <button class="su-btn-sm su-btn-danger" data-remove="${f.user_id}">删除</button>
                </div>`).join('') + `<div style="padding:10px;color:#5F574F;font-size:11px;text-align:center;">共 ${friends.length} 位好友</div>`;
        },

        _renderRequests(requests) {
            if (requests.length === 0) {
                return '<div style="text-align:center;padding:40px;color:#5F574F;font-size:12px;">暂无好友申请</div>';
            }
            return requests.map(r => `
                <div class="su-fr-row" style="display:flex;align-items:center;padding:10px;border-bottom:1px solid #5D275D40;">
                    <div style="width:40px;height:40px;background:#5D275D;border-radius:4px;border:2px solid #5F574F;display:flex;align-items:center;justify-content:center;font-size:10px;color:#FFCD75;margin-right:10px;flex-shrink:0;">Lv${r.level}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;color:#F4F4F4;font-weight:600;">${r.name}</div>
                        <div style="font-size:9px;color:#5F574F;">Lv.${r.level}</div>
                    </div>
                    <div style="display:flex;gap:4px;">
                        <button class="su-btn-sm su-btn-primary" data-accept="${r.user_id}">同意</button>
                        <button class="su-btn-sm su-btn-danger" data-reject="${r.user_id}">拒绝</button>
                    </div>
                </div>`).join('');
        },

        _renderSearch(body) {
            body.innerHTML = `
                <div style="margin-bottom:12px;">
                    <div style="display:flex;gap:6px;">
                        <input id="su-search-input" type="text" placeholder="输入昵称搜索..." style="flex:1;padding:8px 10px;background:#0d1b3e;border:2px solid #5D275D;color:#F4F4F4;font-size:13px;border-radius:3px;outline:none;" />
                        <button class="su-btn su-btn-primary" id="su-search-btn">搜索</button>
                    </div>
                </div>
                <div id="su-search-results"></div>`;
            const input = body.querySelector('#su-search-input');
            const btn = body.querySelector('#su-search-btn');
            const results = body.querySelector('#su-search-results');

            const doSearch = async () => {
                const q = input.value.trim();
                if (!q) return;
                results.innerHTML = '<div style="text-align:center;padding:20px;color:#C2C3C7;">搜索中...</div>';
                try {
                    const resp = await window.Auth.apiFetch(`/api/social/search?q=${encodeURIComponent(q)}`);
                    if (!resp || !resp.ok) { results.innerHTML = this._errHTML('搜索失败'); return; }
                    const json = await resp.json();
                    if (!json.success) { results.innerHTML = this._errHTML(json.error); return; }
                    results.innerHTML = this._renderSearchResults(json.results || []);
                    this._bindSearchEvents(results);
                } catch { results.innerHTML = this._errHTML('网络错误'); }
            };

            btn.addEventListener('click', doSearch);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
        },

        _renderSearchResults(results) {
            if (results.length === 0) {
                return '<div style="text-align:center;padding:20px;color:#5F574F;font-size:12px;">未找到用户</div>';
            }
            return results.map(r => `
                <div style="display:flex;align-items:center;padding:10px;border-bottom:1px solid #5D275D40;">
                    <div style="width:40px;height:40px;background:#5D275D;border-radius:4px;border:2px solid #5F574F;display:flex;align-items:center;justify-content:center;font-size:10px;color:#FFCD75;margin-right:10px;flex-shrink:0;">Lv${r.level}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;color:#F4F4F4;font-weight:600;">${r.name}</div>
                        <div style="font-size:9px;color:#5F574F;">Lv.${r.level} &nbsp; ${r.relationship === 'friend' ? '<span style="color:#00E436;">已是好友</span>' : r.relationship === 'request_sent' ? '<span style="color:#FFA300;">已申请</span>' : ''}</div>
                    </div>
                    ${r.relationship === 'none' ? `<button class="su-btn-sm su-btn-primary" data-add="${r.user_id}">添加</button>` : ''}
                </div>`).join('');
        },

        _bindSearchEvents(results) {
            results.querySelectorAll('[data-add]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const uid = btn.dataset.add;
                    btn.disabled = true; btn.textContent = '发送中...';
                    try {
                        const resp = await window.Auth.apiFetch('/api/social/request', {
                            method: 'POST',
                            body: JSON.stringify({ user_id: uid })
                        });
                        const json = await resp?.json().catch(() => ({}));
                        if (json.success) {
                            window.showNotification(json.message, 'success');
                            btn.textContent = '已申请'; btn.disabled = true;
                        } else {
                            window.showNotification(json.error || '发送失败', 'error');
                            btn.disabled = false; btn.textContent = '添加';
                        }
                    } catch { btn.disabled = false; btn.textContent = '添加'; }
                });
            });
        },

        _bindFriendsEvents(body) {
            body.querySelectorAll('[data-remove]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('确定删除该好友？')) return;
                    btn.disabled = true;
                    try {
                        const resp = await window.Auth.apiFetch(`/api/social/friend/${btn.dataset.remove}`, { method: 'DELETE' });
                        const json = await resp?.json().catch(() => ({}));
                        if (json.success) { window.showNotification('已删除', 'success'); this._loadFriendsList(body); }
                        else window.showNotification(json.error || '删除失败', 'error');
                    } catch { btn.disabled = false; }
                });
            });
            body.querySelectorAll('[data-accept]').forEach(btn => {
                btn.addEventListener('click', () => this._respondRequest(btn.dataset.accept, 'accept'));
            });
            body.querySelectorAll('[data-reject]').forEach(btn => {
                btn.addEventListener('click', () => this._respondRequest(btn.dataset.reject, 'reject'));
            });
        },

        async _loadRequests(body) {
            body.innerHTML = '<div style="text-align:center;padding:20px;color:#C2C3C7;">加载中...</div>';
            try {
                const resp = await window.Auth.apiFetch('/api/social/requests');
                if (!resp || !resp.ok) { body.innerHTML = this._errHTML('加载失败'); return; }
                const json = await resp.json();
                if (!json.success) { body.innerHTML = this._errHTML(json.error); return; }
                const badge = document.getElementById('su-req-badge');
                const count = json.incoming?.length || 0;
                if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline' : 'none'; }
                body.innerHTML = `<div style="margin-bottom:8px;color:#5F574F;font-size:11px;">收到申请 (${count})</div>` + this._renderRequests(json.incoming || []);
                this._bindRequestsEvents(body);
            } catch { body.innerHTML = this._errHTML('网络错误'); }
        },

        _bindRequestsEvents(body) {
            body.querySelectorAll('[data-accept]').forEach(btn => {
                btn.addEventListener('click', () => this._respondRequest(btn.dataset.accept, 'accept'));
            });
            body.querySelectorAll('[data-reject]').forEach(btn => {
                btn.addEventListener('click', () => this._respondRequest(btn.dataset.reject, 'reject'));
            });
        },

        async _respondRequest(userId, action) {
            try {
                const resp = await window.Auth.apiFetch('/api/social/respond', {
                    method: 'POST',
                    body: JSON.stringify({ user_id: userId, action })
                });
                const json = await resp?.json().catch(() => ({}));
                if (json.success) {
                    window.showNotification(json.message, 'success');
                    const body = document.getElementById('su-fr-body');
                    if (body) this._switchFriendsTab('requests');
                } else {
                    window.showNotification(json.error || '操作失败', 'error');
                }
            } catch { window.showNotification('网络错误', 'error'); }
        },

        _goFriendTab(tab) {
            const container = document.getElementById('su-container');
            if (!container) return;
            container.querySelectorAll('.su-fr-tab').forEach(b => b.classList.remove('active'));
            const target = [...container.querySelectorAll('.su-fr-tab')].find(b => b.dataset.frTab === tab);
            if (target) { target.classList.add('active'); this._switchFriendsTab(tab); }
        },

        // ============================================
        // 公会
        // ============================================

        async _loadGuildTab() {
            const body = document.getElementById('su-g-body');
            if (!body) return;
            if (this._guildTab === 'my') await this._loadMyGuild(body);
            if (this._guildTab === 'list') await this._loadGuildList(body);
        },

        async _loadMyGuild(body) {
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>';
            try {
                const resp = await window.Auth.apiFetch('/api/social/guild/me');
                if (!resp || !resp.ok) { body.innerHTML = this._errHTML('加载失败'); return; }
                const json = await resp.json();
                if (!json.success) { body.innerHTML = this._errHTML(json.error); return; }

                if (json.pending) {
                    body.innerHTML = `
                        <div style="text-align:center;padding:40px 20px;">
                            <div style="font-size:48px;margin-bottom:12px;">\u23F3</div>
                            <div style="color:#FFA300;font-size:12px;margin-bottom:8px;">申请中...</div>
                            <div style="color:#5F574F;font-size:12px;">等待「${json.guild_name}」会长审批</div>
                        </div>`;
                    return;
                }

                if (!json.guild) {
                    body.innerHTML = `
                        <div style="text-align:center;padding:40px 20px;">
                            <div style="font-size:48px;margin-bottom:12px;">\uD83C\uDF89</div>
                            <div style="color:#5F574F;font-size:12px;margin-bottom:16px;">还没有加入公会</div>
                            <button class="su-btn su-btn-primary" onclick="SocialUI._switchGuildTab('list')">浏览公会</button>
                        </div>`;
                    return;
                }

                body.innerHTML = this._renderMyGuild(json.guild);
                this._bindGuildEvents(body, json.guild);
            } catch { body.innerHTML = this._errHTML('网络错误'); }
        },

        _renderMyGuild(g) {
            const pendingSection = g.pending_count > 0 && g.is_leader
                ? `<div style="margin-bottom:12px;padding:10px;background:#B13E5330;border:2px solid #B13E53;border-radius:3px;">
                    <div style="font-size:11px;color:#B13E53;margin-bottom:6px;font-family:'Press Start 2P',monospace;">待审批 (${g.pending_count})</div>
                    ${g.pending_list.map(p => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
                            <span style="color:#F4F4F4;font-size:12px;">${p.name} Lv.${p.level}</span>
                            <div style="display:flex;gap:4px;">
                                <button class="su-btn-sm su-btn-primary" data-accept-join="${p.user_id}" data-gid="${g.guild_id}">同意</button>
                                <button class="su-btn-sm su-btn-danger" data-reject-join="${p.user_id}" data-gid="${g.guild_id}">拒绝</button>
                            </div>
                        </div>`).join('')}
                   </div>` : '';

            const tasksHtml = Object.entries(g.task_status || {}).map(([tid, ts]) => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #5D275D30;">
                    <div>
                        <div style="font-size:12px;color:#F4F4F4;">${ts.name}</div>
                        <div style="font-size:10px;color:#5F574F;">${ts.description}</div>
                    </div>
                    <div style="text-align:right;">
                        ${ts.completed
                            ? '<span style="color:#00E436;font-size:9px;font-family:\'Press Start 2P\';">已完成</span>'
                            : `<button class="su-btn-sm su-btn-primary" data-do-task="${tid}">完成 +${ts.score}</button>`
                        }
                    </div>
                </div>`).join('');

            const membersHtml = g.members.map(m => `
                <div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #5D275D30;">
                    <div style="width:28px;height:28px;background:#5D275D;border-radius:3px;border:1px solid #5F574F;display:flex;align-items:center;justify-content:center;font-size:9px;color:#FFCD75;margin-right:8px;flex-shrink:0;">Lv${m.level}</div>
                    <div style="flex:1;min-width:0;">
                        <span style="font-size:12px;color:#F4F4F4;">${m.name}</span>
                        ${m.is_leader ? '<span style="color:#FFD700;font-size:8px;font-family:\'Press Start 2P\';margin-left:4px;">会长</span>' : ''}
                    </div>
                    ${g.is_leader && !m.is_leader ? `<button class="su-btn-sm su-btn-danger" data-kick="${m.user_id}">踢</button>` : ''}
                </div>`).join('');

            return `
                <div style="margin-bottom:12px;padding:12px;background:#2a1a50;border:2px solid #5D275D;border-radius:3px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <span style="font-size:16px;color:#FFCD75;">\uD83C\uDFEE</span>
                        <div>
                            <div style="font-size:13px;color:#F4F4F4;font-weight:700;">[${g.tag}] ${g.name}</div>
                            <div style="font-size:10px;color:#5F574F;">${g.member_count}/20人 &nbsp;|&nbsp; 总分：<span style="color:#FFCD75;">${g.total_score}</span></div>
                        </div>
                    </div>
                    ${g.description ? `<div style="font-size:11px;color:#C2C3C7;margin-bottom:8px;">${g.description}</div>` : ''}
                    ${pendingSection}
                </div>

                <div style="margin-bottom:12px;">
                    <div style="font-size:10px;color:#FFCD75;font-family:'Press Start 2P',monospace;margin-bottom:8px;">\uD83D\uDCB0 公会任务</div>
                    <div style="background:#0d1b3e;border:2px solid #5D275D;border-radius:3px;padding:4px 10px;">${tasksHtml}</div>
                </div>

                <div>
                    <div style="font-size:10px;color:#FFCD75;font-family:'Press Start 2P',monospace;margin-bottom:8px;">\uD83D\uDC65 成员列表</div>
                    <div style="background:#0d1b3e;border:2px solid #5D275D;border-radius:3px;padding:4px 10px;">${membersHtml}</div>
                </div>

                <div style="margin-top:12px;">
                    <button class="su-btn su-btn-danger" id="su-leave-guild">退出公会</button>
                </div>`;
        },

        _bindGuildEvents(body, guild) {
            body.querySelectorAll('[data-accept-join]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const resp = await window.Auth.apiFetch('/api/social/guild/respond_join', {
                        method: 'POST',
                        body: JSON.stringify({ user_id: btn.dataset.acceptJoin, guild_id: btn.dataset.gid, action: 'accept' })
                    });
                    const json = await resp?.json().catch(() => ({}));
                    if (json.success) { window.showNotification(json.message, 'success'); this._loadGuildTab(); }
                    else window.showNotification(json.error || '操作失败', 'error');
                });
            });
            body.querySelectorAll('[data-reject-join]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const resp = await window.Auth.apiFetch('/api/social/guild/respond_join', {
                        method: 'POST',
                        body: JSON.stringify({ user_id: btn.dataset.rejectJoin, guild_id: btn.dataset.gid, action: 'reject' })
                    });
                    const json = await resp?.json().catch(() => ({}));
                    if (json.success) { window.showNotification(json.message, 'success'); this._loadGuildTab(); }
                    else window.showNotification(json.error || '操作失败', 'error');
                });
            });
            body.querySelectorAll('[data-kick]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('确定踢出该成员？')) return;
                    const resp = await window.Auth.apiFetch(`/api/social/guild/kick/${btn.dataset.kick}`, { method: 'DELETE' });
                    const json = await resp?.json().catch(() => ({}));
                    if (json.success) { window.showNotification(json.message, 'success'); this._loadGuildTab(); }
                    else window.showNotification(json.error || '操作失败', 'error');
                });
            });
            body.querySelectorAll('[data-do-task]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const resp = await window.Auth.apiFetch('/api/social/guild/task/complete', {
                        method: 'POST',
                        body: JSON.stringify({ task_id: btn.dataset.doTask })
                    });
                    const json = await resp?.json().catch(() => ({}));
                    if (json.success) { window.showNotification(json.message, 'success'); this._loadGuildTab(); }
                    else window.showNotification(json.error || '操作失败', 'error');
                });
            });
            const leaveBtn = body.querySelector('#su-leave-guild');
            if (leaveBtn) {
                leaveBtn.addEventListener('click', async () => {
                    if (!confirm('确定退出公会？')) return;
                    const resp = await window.Auth.apiFetch('/api/social/guild/leave', { method: 'POST' });
                    const json = await resp?.json().catch(() => ({}));
                    if (json.success) { window.showNotification(json.message, 'success'); this._loadGuildTab(); }
                    else window.showNotification(json.error || '操作失败', 'error');
                });
            }
        },

        async _loadGuildList(body) {
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#C2C3C7;">加载中...</div>';
            try {
                const resp = await window.Auth.apiFetch('/api/social/guilds');
                if (!resp || !resp.ok) { body.innerHTML = this._errHTML('加载失败'); return; }
                const json = await resp.json();
                if (!json.success) { body.innerHTML = this._errHTML(json.error); return; }
                body.innerHTML = this._renderGuildList(json) + this._renderCreateGuild();
                this._bindGuildListEvents(body);
            } catch { body.innerHTML = this._errHTML('网络错误'); }
        },

        _renderGuildList(json) {
            const guilds = json.guilds || [];
            if (guilds.length === 0) return '<div style="text-align:center;padding:20px;color:#5F574F;">暂无公会</div>';
            return guilds.map(g => `
                <div style="padding:10px;border-bottom:1px solid #5D275D40;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="color:#FFCD75;">\uD83C\uDFEE</span>
                        <span style="font-size:13px;color:#F4F4F4;font-weight:600;">[${g.tag}] ${g.name}</span>
                        <span style="font-size:9px;color:#5F574F;margin-left:auto;">会长：${g.leader_name}</span>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-size:10px;color:#5F574F;">${g.member_count}/${g.max_members}人 &nbsp;|&nbsp; 总分：<span style="color:#FFCD75;">${g.total_score}</span></span>
                        <button class="su-btn-sm su-btn-primary" data-join="${g.guild_id}" data-name="${g.name}">申请加入</button>
                    </div>
                </div>`).join('');
        },

        _renderCreateGuild() {
            return `
                <div style="margin-top:16px;padding:12px;background:#0d1b3e;border:2px solid #5D275D;border-radius:3px;">
                    <div style="font-size:10px;color:#FFCD75;font-family:'Press Start 2P',monospace;margin-bottom:8px;">\u2795 创建公会</div>
                    <div style="display:flex;gap:6px;margin-bottom:6px;">
                        <input id="su-gn-input" type="text" placeholder="公会名称(2-12字)" maxlength="12" style="flex:1;padding:7px 8px;background:#1a1a2e;border:2px solid #5D275D;color:#F4F4F4;font-size:12px;border-radius:3px;outline:none;" />
                        <input id="su-gt-input" type="text" placeholder="标签(2-6字)" maxlength="6" style="width:80px;padding:7px 8px;background:#1a1a2e;border:2px solid #5D275D;color:#F4F4F4;font-size:12px;border-radius:3px;outline:none;" />
                    </div>
                    <input id="su-gd-input" type="text" placeholder="公会描述(选填)" maxlength="50" style="width:100%;padding:7px 8px;background:#1a1a2e;border:2px solid #5D275D;color:#F4F4F4;font-size:12px;border-radius:3px;outline:none;margin-bottom:6px;box-sizing:border-box;" />
                    <button class="su-btn su-btn-primary" id="su-create-guild-btn" style="width:100%;">创建公会</button>
                </div>`;
        },

        _bindGuildListEvents(body) {
            body.querySelectorAll('[data-join]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const gid = btn.dataset.join;
                    btn.disabled = true; btn.textContent = '申请中...';
                    try {
                        const resp = await window.Auth.apiFetch(`/api/social/guild/join/${gid}`, { method: 'POST' });
                        const json = await resp?.json().catch(() => ({}));
                        if (json.success) { window.showNotification(json.message, 'success'); btn.textContent = '已申请'; }
                        else { window.showNotification(json.error || '申请失败', 'error'); btn.disabled = false; btn.textContent = '申请加入'; }
                    } catch { btn.disabled = false; btn.textContent = '申请加入'; }
                });
            });
            const createBtn = body.querySelector('#su-create-guild-btn');
            if (createBtn) {
                createBtn.addEventListener('click', async () => {
                    const name = body.querySelector('#su-gn-input')?.value.trim() || '';
                    const tag = body.querySelector('#su-gt-input')?.value.trim() || '';
                    const desc = body.querySelector('#su-gd-input')?.value.trim() || '';
                    if (!name || name.length < 2) { window.showNotification('公会名称至少2个字符', 'error'); return; }
                    if (!tag || tag.length < 2) { window.showNotification('标签至少2个字符', 'error'); return; }
                    createBtn.disabled = true; createBtn.textContent = '创建中...';
                    try {
                        const resp = await window.Auth.apiFetch('/api/social/guild/create', {
                            method: 'POST',
                            body: JSON.stringify({ name, tag, description: desc })
                        });
                        const json = await resp?.json().catch(() => ({}));
                        if (json.success) {
                            window.showNotification(json.message, 'success');
                            this._guildTab = 'my';
                            const container = document.getElementById('su-container');
                            if (container) {
                                container.querySelectorAll('.su-g-tab').forEach(b => b.classList.remove('active'));
                                const myTab = [...container.querySelectorAll('.su-g-tab')].find(b => b.dataset.gTab === 'my');
                                if (myTab) myTab.classList.add('active');
                            }
                            this._loadGuildTab();
                        } else { window.showNotification(json.error || '创建失败', 'error'); createBtn.disabled = false; createBtn.textContent = '创建公会'; }
                    } catch { createBtn.disabled = false; createBtn.textContent = '创建公会'; }
                });
            }
        },

        _switchGuildTab(tab) {
            this._guildTab = tab;
            const container = document.getElementById('su-container');
            if (!container) return;
            container.querySelectorAll('.su-g-tab').forEach(b => b.classList.remove('active'));
            const target = [...container.querySelectorAll('.su-g-tab')].find(b => b.dataset.gTab === tab);
            if (target) target.classList.add('active');
            this._loadGuildTab();
        },

        // ============================================
        // 工具
        // ============================================

        _errHTML(msg) {
            return `<div style="text-align:center;padding:40px;color:#B13E53;font-size:12px;">${msg}</div>`;
        },

        // ============================================
        // CSS & 模板
        // ============================================

        _css() {
            return `<style>
            @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
            @keyframes suModalIn{from{opacity:0;transform:scale(0.88) translateY(20px);}to{opacity:1;transform:scale(1) translateY(0);}}
            #su-container{font-family:'Noto Sans SC','Microsoft YaHei',sans-serif;}
            .su-modal-header{
                background:linear-gradient(180deg,#2a1a50,#1a1035);
                border-bottom:3px solid #5D275D;
                padding:12px 16px;display:flex;align-items:center;justify-content:space-between;
            }
            .su-modal-title{
                display:flex;align-items:center;gap:8px;
                font-size:10px;color:#FFCD75;font-family:'Press Start 2P',monospace;
            }
            .su-close-btn{
                background:transparent;border:2px solid #5F574F;color:#C2C3C7;
                width:28px;height:28px;cursor:pointer;font-size:14px;
                display:flex;align-items:center;justify-content:center;
                border-radius:2px;transition:all 0.1s;
            }
            .su-close-btn:hover{border-color:#FFF1E8;color:#FFF1E8;}
            .su-tabs{
                display:flex;background:#0d1b3e;
                border-bottom:3px solid #5D275D;
            }
            .su-tab{
                flex:1;padding:10px 4px;
                background:transparent;border:none;border-bottom:3px solid transparent;
                color:#5F574F;cursor:pointer;transition:all 0.2s;
                font-size:10px;font-family:'Press Start 2P',monospace;
                display:flex;align-items:center;justify-content:center;gap:4px;
            }
            .su-tab.su-tab-active{border-bottom-color:#29ADFF;color:#29ADFF;}
            .su-tab:hover{color:#FFF1E8;}
            #su-content{flex:1;display:flex;flex-direction:column;min-height:0;overflow:visible;}

            /* 排行榜 */
            .su-lb-tab{
                flex:1;padding:6px 4px;background:#0d1b3e;border:2px solid #5D275D;
                color:#5F574F;cursor:pointer;font-size:9px;border-radius:3px;
                display:flex;flex-direction:column;align-items:center;gap:2px;
                transition:all 0.15s;
            }
            .su-lb-tab.active{border-color:#29ADFF;color:#29ADFF;background:#29ADFF15;}
            .su-lb-tab:hover{color:#FFF1E8;}
            .su-period-btn{
                padding:4px 10px;background:#0d1b3e;border:2px solid #5D275D;
                color:#5F574F;cursor:pointer;font-size:8px;font-family:'Press Start 2P',monospace;
                border-radius:3px;transition:all 0.15s;
            }
            .su-period-btn.active{border-color:#FFA300;color:#FFA300;}
            .su-lb-row{transition:background 0.1s;}
            .su-lb-row:hover{background:#29ADFF10 !important;}
            .su-lb-self{border-left:3px solid #29ADFF !important;}

            /* 按钮 */
            .su-btn{
                display:inline-block;padding:8px 16px;
                font-family:'Press Start 2P',monospace;font-size:8px;
                cursor:pointer;border-width:2px;border-style:solid;
                image-rendering:pixelated;
                box-shadow:2px 2px 0 rgba(0,0,0,0.5);transition:all 0.1s;
            }
            .su-btn:active:not(:disabled){transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(0,0,0,0.5);}
            .su-btn:disabled{opacity:0.5;cursor:not-allowed;}
            .su-btn-primary{background:#008751;color:#FFF1E8;border-color:#00E436;}
            .su-btn-primary:hover:not(:disabled){background:#00E436;}
            .su-btn-secondary{background:transparent;color:#C2C3C7;border-color:#5F574F;}
            .su-btn-secondary:hover:not(:disabled){border-color:#FFF1E8;color:#FFF1E8;}
            .su-btn-danger{background:#B13E53;color:#FFF1E8;border-color:#FF004D;}
            .su-btn-danger:hover:not(:disabled){background:#FF004D;}

            .su-btn-sm{
                display:inline-block;padding:4px 8px;
                font-family:'Press Start 2P',monospace;font-size:7px;
                cursor:pointer;border-width:2px;border-style:solid;
                border-radius:2px;box-shadow:1px 1px 0 rgba(0,0,0,0.5);transition:all 0.1s;
            }
            .su-btn-sm:active:not(:disabled){transform:translate(1px,1px);}
            .su-btn-sm:disabled{opacity:0.5;cursor:not-allowed;}
            .su-btn-sm.su-btn-primary{background:#008751;color:#FFF1E8;border-color:#00E436;}
            .su-btn-sm.su-btn-danger{background:transparent;color:#B13E53;border-color:#B13E53;}
            .su-btn-sm.su-btn-danger:hover:not(:disabled){background:#B13E53;color:#FFF1E8;}

            .su-fr-tab{
                padding:6px 10px;background:transparent;border:none;
                color:#5F574F;cursor:pointer;font-size:9px;font-family:'Press Start 2P',monospace;
                border-bottom:3px solid transparent;transition:all 0.15s;
                display:flex;align-items:center;gap:4px;
            }
            .su-fr-tab.active{border-bottom-color:#29ADFF;color:#29ADFF;}
            .su-fr-tab:hover{color:#FFF1E8;}

            .su-g-tab{
                padding:6px 10px;background:transparent;border:none;
                color:#5F574F;cursor:pointer;font-size:9px;font-family:'Press Start 2P',monospace;
                border-bottom:3px solid transparent;transition:all 0.15s;
            }
            .su-g-tab.active{border-bottom-color:#29ADFF;color:#29ADFF;}
            .su-g-tab:hover{color:#FFF1E8;}

            @media(max-width:480px){
                .su-tab{font-size:8px;}.su-lb-tab{font-size:8px;padding:5px 2px;}
                .su-btn{font-size:7px;padding:6px 10px;}
                .su-btn-sm{font-size:6px;padding:3px 6px;}
            }
            </style>`;
        },

        _tpl() {
            return `
                <div class="su-modal-header">
                    <div class="su-modal-title">
                        <span style="font-size:16px;">\uD83D\uDC65</span>
                        <span>社交中心</span>
                    </div>
                    <button class="su-close-btn" id="su-close">\u2715</button>
                </div>
                <div class="su-tabs">
                    <button class="su-tab su-tab-active" data-tab="leaderboard">
                        <span>\uD83D\uDCDD</span><span>排行榜</span>
                    </button>
                    <button class="su-tab" data-tab="friends">
                        <span>\uD83D\uDC64</span><span>好友</span>
                    </button>
                    <button class="su-tab" data-tab="guild">
                        <span>\uD83C\uDFEE</span><span>公会</span>
                    </button>
                </div>
                <div id="su-content" style="flex:1;display:flex;flex-direction:column;min-height:0;">
                    <!-- tab content injected here -->
                </div>`;
        }
    };

    window.SocialUI = SocialUI;
})();
