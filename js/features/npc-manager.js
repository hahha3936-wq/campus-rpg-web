/**
 * 校园RPG - NPC 管理器
 * NPC 对话、好感度、AI对话、礼物赠送、关系管理
 */

const NPC_DATA = {
    naruto: {
        avatar: '🍥', name: '漩涡鸣人老师', title: '热血导师',
        cls: 'naruto',
        bio: '漩涡鸣人是你的热血导师，总是充满干劲。他相信每个人都有自己的成长节奏，会用忍者的故事来激励你在学业上前进。作为曾经的"吊车尾"，他最懂得如何帮助被看轻的学生找到自己的道路。',
        quests: [
            { icon: '📚', name: '完成第一次学习任务', reward: '+5好感' },
            { icon: '🔥', name: '连续签到7天', reward: '+15好感' },
            { icon: '⭐', name: '达到等级5', reward: '+20好感' }
        ]
    },
    sasuke: {
        avatar: '👤', name: '宇智波佐助助教', title: '傲娇助教',
        cls: 'sasuke',
        bio: '佐助是你的傲娇助教，说话简洁有力。他看似冷漠，实则非常关心学生的成长。如果你足够努力，他会毫不吝啬地给予认可。他的高冷外表下藏着一颗希望学生超越自己的心。',
        quests: [
            { icon: '⚡', name: '一次性完成3个任务', reward: '+10好感' },
            { icon: '🎯', name: '专注时间达到2小时', reward: '+15好感' },
            { icon: '📖', name: '阅读学习资料30分钟', reward: '+8好感' }
        ]
    }
};

const NPC_AFFECTION_RANKS = [
    { threshold: 0,  label: '初识' },
    { threshold: 30, label: '熟悉' },
    { threshold: 60, label: '信赖' },
    { threshold: 80, label: '挚友' }
];

function _npcApiUrl(path) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}

const NPCManager = {
    _history: {},    // { npcId: [{ text, time, role }] }
    _currentNpc: null,
    _relations: {},  // 本地缓存，好感度优先从后端拉取

    /** 初始化：从后端拉取 NPC 关系数据 */
    async init() {
        try {
            const resp = await fetch(_npcApiUrl('/api/user/npc'));
            if (resp?.ok) {
                const data = await resp.json();
                this._relations = data;
            }
        } catch {}

        // 若后端无数据，从 AppState 读取
        if (Object.keys(this._relations).length === 0) {
            const user = AppState.user;
            if (user?.npc_relationship) {
                this._relations = user.npc_relationship;
            }
        }

        this._currentNpc = 'naruto';

        // 若页面有 renderNpc 方法（npc.html），自动渲染
        if (typeof this.renderNpc === 'function') {
            this.renderNpc(this._currentNpc);
        }
    },

    /** 获取当前 NPC ID */
    getCurrentNpc() {
        return this._currentNpc;
    },

    /** 获取所有 NPC 数据 */
    getAllNPCs() {
        return NPC_DATA;
    },

    /** 获取单个 NPC 数据 */
    getNpc(npcId) {
        return NPC_DATA[npcId] || null;
    },

    /** 获取 NPC 关系（好感度等） */
    getRelation(npcId) {
        return this._relations[npcId] || { affection: 0, max_affection: 100, title: NPC_DATA[npcId]?.title || '未知' };
    },

    /** 获取好感度百分比（0-100） */
    getAffectionProgress(npcId) {
        const rel = this.getRelation(npcId);
        return rel.max_affection > 0 ? Math.round((rel.affection / rel.max_affection) * 100) : 0;
    },

    /** 获取好感度等级标签 */
    getAffectionTitle(affection) {
        let label = NPC_AFFECTION_RANKS[0].label;
        for (const r of NPC_AFFECTION_RANKS) {
            if (affection >= r.threshold) label = r.label;
        }
        return label;
    },

    /** 好感度增加 */
    addAffection(npcId, amount) {
        const rel = this.getRelation(npcId);
        rel.affection = Math.min(rel.max_affection, Math.max(0, rel.affection + amount));
        this._relations[npcId] = rel;

        // 同步到 AppState
        if (AppState.user?.npc_relationship) {
            AppState.user.npc_relationship[npcId] = rel;
        }

        this.saveAffection(npcId);
        return rel;
    },

    /** 切换当前 NPC（同时更新页面 UI） */
    switchNpc(npcId) {
        if (!NPC_DATA[npcId]) return;
        this._currentNpc = npcId;

        // Tab 激活
        document.querySelectorAll('.npc-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.npc === npcId);
        });

        this.renderNpc(npcId);
    },

    /** 渲染 NPC 详情页面 */
    renderNpc(npcId) {
        const data = NPC_DATA[npcId];
        if (!data) return;
        const relation = this.getRelation(npcId);
        const pct = this.getAffectionProgress(npcId);
        const rankLabel = this.getAffectionTitle(relation.affection);

        // 头部
        const header = document.getElementById('npc-header');
        if (header) {
            header.className = `npc-header ${data.cls}`;
        }
        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setText('npc-avatar', data.avatar);
        setText('npc-name', data.name);
        setText('npc-title', relation.title || data.title);

        // 好感度
        const fill = document.getElementById('affection-fill');
        if (fill) fill.style.width = pct + '%';
        setText('affection-value', `${relation.affection}/${relation.max_affection}`);

        // 等级标签
        const rankEls = document.querySelectorAll('.rank-pip');
        rankEls.forEach((el, i) => {
            const r = NPC_AFFECTION_RANKS[i];
            if (!r) return;
            el.classList.remove('active', 'unlocked');
            if (relation.affection >= r.threshold) {
                const next = NPC_AFFECTION_RANKS[i + 1];
                if (!next || relation.affection < next.threshold) {
                    el.classList.add('active');
                } else {
                    el.classList.add('unlocked');
                }
            }
        });

        // 介绍
        setText('npc-bio', data.bio);

        // 对话历史
        const historyEl = document.getElementById('dialogue-history');
        if (historyEl) {
            const history = this.getHistory(npcId).slice(0, 6);
            if (history.length > 0) {
                historyEl.innerHTML = history.map(d => {
                    const isUser = d.role === 'user';
                    const bubbleClass = isUser ? 'dialogue-bubble dialogue-bubble-user' : 'dialogue-bubble ai';
                    return `
                    <div class="${bubbleClass}">${this._escapeHtml(d.text)}</div>
                    <div class="dialogue-bubble" style="opacity:0.5;font-size:0.75rem;border:none;background:transparent;padding:0 0 0.5rem 0">（${d.time}）</div>`;
                }).join('');
            } else {
                historyEl.innerHTML = '<div style="opacity:0.5;font-size:0.85rem;text-align:center;padding:1rem">还没有对话记录，快去打个招呼吧！</div>';
            }
        }

        // 任务
        const questEl = document.getElementById('npc-quests');
        if (questEl && data.quests) {
            questEl.innerHTML = '<div class="dialogue-section-title">📋 专属任务</div>' +
                data.quests.map(q => `
                    <div class="quest-item">
                        <span class="quest-icon">${q.icon}</span>
                        <span class="quest-name">${q.name}</span>
                        <span class="quest-reward">${q.reward}</span>
                    </div>`).join('');
        }
    },

    /**
     * 解析后端 SSE（text/event-stream）：逐行提取 data: 后的正文，忽略 [DONE] / [ERROR]
     */
    _consumeChatSSE(reader, onDelta) {
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        return (async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (!data || data === '[DONE]' || data === '[done]') continue;
                    if (data.startsWith('[ERROR]')) {
                        throw new Error(data);
                    }
                    fullContent += data;
                    if (typeof onDelta === 'function') onDelta(fullContent);
                }
            }
            if (buffer.startsWith('data: ')) {
                const data = buffer.slice(6).trim();
                if (data && data !== '[DONE]' && data !== '[done]' && !data.startsWith('[ERROR]')) {
                    fullContent += data;
                    if (typeof onDelta === 'function') onDelta(fullContent);
                }
            }
            return fullContent;
        })();
    },

    /** 将本地历史转为 API 所需格式（时间倒序 → 正序，role 映射） */
    _historyForApi(npcId) {
        const list = this.getHistory(npcId);
        return [...list].reverse().slice(-10).map((h) => ({
            role: h.role === 'ai' ? 'assistant' : 'user',
            content: h.text || ''
        })).filter((m) => m.content);
    },

    /** 去掉偶发的残留标记（双保险） */
    _cleanReplyText(text) {
        return String(text || '')
            .replace(/\[DONE\]/gi, '')
            .replace(/data:\s*/gi, '')
            .trim();
    },

    /** 发起 NPC 对话（AI 流式）——系统人设由后端根据 npc_id 注入 DeepSeek */
    async triggerDialogue() {
        const typingEl = document.getElementById('npc-typing-indicator');
        const historyEl = document.getElementById('dialogue-history');
        if (typingEl) typingEl.style.display = 'inline';

        const npcInfo = NPC_DATA[this._currentNpc];
        const userMessage = '你好！请用你角色的口吻跟我打个招呼，鼓励我今天的学习与校园生活，不要说你是系统或阿游。';

        // 前端 10s 超时，防止 DeepSeek API 长时间无响应阻塞界面
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const resp = await fetch(_npcApiUrl('/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    history: this._historyForApi(this._currentNpc),
                    npc_id: this._currentNpc
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!resp?.ok) throw new Error('请求失败');
            if (!resp.body) throw new Error('无响应体');

            const reader = resp.body.getReader();
            const bubble = document.createElement('div');
            bubble.className = 'dialogue-bubble ai';
            if (historyEl) historyEl.appendChild(bubble);

            const fullText = await this._consumeChatSSE(reader, (acc) => {
                bubble.textContent = this._cleanReplyText(acc);
            });

            const cleaned = this._cleanReplyText(fullText);
            bubble.textContent = cleaned || '（暂无回复）';

            if (cleaned) {
                this.addAffection(this._currentNpc, 1);
                this._addToHistory(this._currentNpc, userMessage, 'user');
                this._addToHistory(this._currentNpc, cleaned, 'ai');
                if (typeof this.showNotification === 'function') {
                    this.showNotification(`${npcInfo.name} 好感度+1`, 'success');
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                if (typeof this.showNotification === 'function') {
                    this.showNotification('AI 对话超时，请稍后重试', 'error');
                }
            } else {
                console.warn('NPC 对话失败:', err);
                if (typeof this.showNotification === 'function') {
                    this.showNotification(err.message || '对话失败，请稍后重试', 'error');
                }
            }
        } finally {
            if (typingEl) typingEl.style.display = 'none';
        }
    },

    /** 赠送礼物（消耗背包道具） */
    async sendGift() {
        const inventory = AppState.user?.inventory || [];
        const giftItems = inventory.filter(item =>
            ['礼物', '鲜花', '巧克力', '手办'].some(g => item.name.includes(g))
        );

        if (giftItems.length === 0) {
            if (typeof this.showNotification === 'function') {
                this.showNotification('背包里没有可赠送的礼物', 'warning');
            }
            return;
        }

        const item = giftItems[0];
        const affectionGain = item.name.includes('手办') ? 15
            : item.name.includes('鲜花') ? 10
            : item.name.includes('巧克力') ? 5 : 3;

        // 扣道具
        item.quantity--;
        if (item.quantity <= 0) {
            const idx = inventory.indexOf(item);
            if (idx > -1) inventory.splice(idx, 1);
        }
        AppState.user.inventory = inventory;

        // 好感度增加
        this.addAffection(this._currentNpc, affectionGain);
        this.renderNpc(this._currentNpc);

        if (typeof this.showNotification === 'function') {
            this.showNotification(`赠送了 ${item.name}，好感度+${affectionGain}`, 'success');
        }
    },

    /** 查看全部对话历史 */
    showFullHistory() {
        const npcId = this._currentNpc;
        const history = this.getHistory(npcId);
        const npcInfo = NPC_DATA[npcId];
        const allText = history.map(d => `[${d.time}] ${d.text}`).join('\n');

        if (typeof this.showNotification === 'function') {
            this.showNotification(`与 ${npcInfo?.name || npcId} 的全部对话已加载`, 'info');
        }
        console.info(`[NPC History - ${npcId}]\n${allText || '暂无记录'}`);
    },

    /** 获取对话历史 */
    getHistory(npcId) {
        return this._history[npcId] || [];
    },

    /** 添加对话到历史 */
    _addToHistory(npcId, text, role = 'ai') {
        if (!this._history[npcId]) this._history[npcId] = [];
        const now = new Date();
        this._history[npcId].unshift({
            text,
            role,
            time: `${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
        });
        if (this._history[npcId].length > 50) this._history[npcId].pop();
    },

    /** 同步好感度到后端 */
    async saveAffection(npcId) {
        const rel = this.getRelation(npcId);
        try {
            await fetch(_npcApiUrl('/api/user/npc'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ npc_id: npcId, ...rel })
            });
        } catch (err) {
            console.warn('NPC 好感度保存失败:', err);
        }
    },

    /** XSS 防护 */
    _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    /**
     * 与 NPC 交互：切换到对应 NPC 并触发对话
     */
    interact(npcId) {
        if (!NPC_DATA[npcId]) return;
        this._currentNpc = npcId;
        // 若探索地图模态框存在，先关闭（避免遮挡 NPC 页面）
        const modal = bootstrap.Modal.getInstance(document.getElementById('exploration-modal'));
        if (modal) modal.hide();
        // 切换到 NPC 页面 tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === 'npc');
        });
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.toggle('hidden', sec.id !== 'npc-section');
        });
        this.renderNpc(npcId);
        // 延迟触发 AI 对话
        setTimeout(() => this.triggerDialogue(), 300);
    },

    /**
     * 随机化 NPC 对话内容（每日重置 NPC 对话模板）
     * 每次调用对所有 NPC 的对话模板进行随机化打乱
     */
    randomizeDialogues() {
        // 若后端有每日对话模板接口则调用，否则本地仅记录日志
        fetch(_npcApiUrl('/api/npc/dialogue/refresh'), { method: 'POST' })
            .catch(() => console.info('[NPCManager] 本地模式，对话模板保持不变'));
    }
};

window.NPCManager = NPCManager;
window.NPC_DATA = NPC_DATA; // 兼容旧代码
