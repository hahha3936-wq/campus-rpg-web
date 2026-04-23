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
        ],
        offlineResponses: [
            '日本語を勉強するなら、まずは基本の文法から始めよう！毎日少しずつやっていくことが大切なんだ。それが忍者の修行と同じで、継続は力なり！',
            '中文翻译：学习日语就从基本语法开始吧！每天坚持一点点，就像忍者修行一样，持续就是力量！',
            '失敗しても諦めない気持ちが一番大事なんだ。武士道にも「七転び八起き」という言葉があるだろう？何度이라도立ち上がればいい！',
            '中文翻译：失败也不放弃的心情才是最重要的。日本武士道有句俗语叫"七跌八起"，跌倒多少次就站起来多少次！',
            '修行には近道はない。日々の積み重ねがいつか大きな力になる。我相信每日坚持必有收获！',
            '中文翻译：修行没有捷径。日复一日的积累终将变成巨大的力量。每天积累，一定会有收获！'
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
        ],
        offlineResponses: [
            '別に君のためじゃない。ただ、自分の基準に合っているか確認しているだけだ。',
            '中文翻译：才不是为了你呢。只是在确认你是否达到自己的标准而已。',
            '結果を出すまで、言い訳は要らない。成果が全てだ。结果说明一切。',
            '中文翻译：在拿出结果之前，不需要任何借口。结果才是最重要的。',
            'お前の努力は認めてやる。でも、それは褒めているわけじゃない。 Still decent. But don\'t let it go to your head.',
            '中文翻译：你的努力我承认了。但那不代表我在夸你。还算不错，但别得意忘形。'
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

    /** 初始化：从 AppState 拉取 NPC 关系数据（由 AppState 保证用户隔离） */
    init() {
        this._currentNpc = 'naruto';

        // 优先从 AppState 读取（已通过 API 加载，天然用户隔离）
        const user = AppState.user;
        if (user?.npc_relationship && Object.keys(user.npc_relationship).length > 0) {
            this._relations = user.npc_relationship;
        }

        // 若 AppState 为空，从 localStorage 备份读取
        if (Object.keys(this._relations).length === 0) {
            let uid = 'guest';
            try {
                const userData = localStorage.getItem('campus_rpg_user');
                if (userData) {
                    const parsed = JSON.parse(userData);
                    uid = parsed?.id || 'guest';
                }
            } catch (e) {
                console.warn('[NPCManager] localStorage 用户数据解析失败:', e);
            }
            const key = `campus_rpg_npc_${uid}`;
            try {
                const backup = JSON.parse(localStorage.getItem(key) || '{}');
                if (Object.keys(backup).length > 0) {
                    this._relations = backup;
                }
            } catch (e) {
                console.warn('[NPCManager] localStorage NPC 备份数据解析失败:', e);
            }
        }

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
        // 类型校验：确保 amount 是有效数字
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.warn(`[NPCManager] addAffection: 无效的 amount 值 ${amount}`);
            amount = 0;
        }
        const rel = this.getRelation(npcId);
        rel.affection = Math.min(rel.max_affection, Math.max(0, rel.affection + amount));
        this._relations[npcId] = rel;

        // 同步到 AppState
        if (AppState.user?.npc_relationship) {
            AppState.user.npc_relationship[npcId] = rel;
        }

        // 保存到后端 + localStorage 备份
        this._saveAffection(npcId, amount);
        return rel;
    },

    /** 保存好感度到后端（带 localStorage 备份） */
    async _saveAffection(npcId, amount) {
        const rel = this.getRelation(npcId);
        const token = localStorage.getItem('campus_rpg_token');
        let backendSuccess = false;
        try {
            const resp = await fetch(_npcApiUrl(`/api/user/npc/${npcId}/affection`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ amount })
            });
            if (!resp.ok) throw new Error(`API error: ${resp.status}`);
            backendSuccess = true;
        } catch (err) {
            console.warn('[NPCManager] 好感度保存到后端失败，将回写到 localStorage:', err);
        }
        // 无论后端成功与否，都保存到 localStorage（双重保险）
        this._backupToLocal(npcId, rel);
        // 若后端失败，在控制台输出详细信息，便于调试
        if (!backendSuccess) {
            console.info(`[NPCManager] NPC ${npcId} 好感度 ${amount} 已暂存本地，将在下次网络正常时同步`);
        }
    },

    /** localStorage 备份（按用户隔离） */
    _backupToLocal(npcId, rel) {
        let uid = 'guest';
        try {
            const userData = localStorage.getItem('campus_rpg_user');
            if (userData) {
                const parsed = JSON.parse(userData);
                uid = parsed?.id || 'guest';
            }
        } catch (e) {
            console.warn('[NPCManager] localStorage 用户数据解析失败:', e);
        }
        const key = `campus_rpg_npc_${uid}`;
        try {
            const backup = JSON.parse(localStorage.getItem(key) || '{}');
            backup[npcId] = rel;
            localStorage.setItem(key, JSON.stringify(backup));
        } catch (e) {
            console.warn('好感度 localStorage 备份失败:', e);
        }
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
            .replace(/【日语原文】\s*/gi, '')
            .replace(/【中文翻译】\s*/gi, '')
            .trim();
    },

    /** 发起 NPC 对话（AI 流式）——系统人设由后端根据 npc_id 注入 DeepSeek */
    async triggerDialogue() {
    const npcInfo = NPC_DATA[this._currentNpc];
    const greeting = ['你好！我是', npcInfo.name, '。', npcInfo.bio, ' 请用你角色的口吻跟我打个招呼，鼓励我今天的学习与校园生活。严格使用以下格式回复：\n【日语原文】\n日语内容\n【中文翻译】\n中文翻译内容\n禁止输出第三段，禁止输出纯中文段落。'].join('');
    await this._streamNpcReply(greeting);
},

    /**
     * 流式获取 NPC 回复（内部方法）
     * @param {string} userMessage - 用户发送的消息
     */
    async _streamNpcReply(userMessage) {
        const typingEl = document.getElementById('npc-typing-indicator');
        const historyEl = document.getElementById('dialogue-history');
        if (typingEl) typingEl.style.display = 'inline';

        const npcInfo = NPC_DATA[this._currentNpc];
        const self = this;
        const MAX_RETRIES = 1;

        // 内部函数：执行一次流式请求，创建并管理自己的气泡 DOM
        async function doStreamRequest(overrideMessage) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const resp = await fetch(_npcApiUrl('/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: overrideMessage,
                    history: self._historyForApi(self._currentNpc),
                    npc_id: self._currentNpc
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!resp?.ok) throw new Error('请求失败');
            if (!resp.body) throw new Error('无响应体');

            const reader = resp.body.getReader();
            const bubble = document.createElement('div');
            bubble.className = 'dialogue-bubble ai';
            let translateBubble = null;
            if (historyEl) historyEl.appendChild(bubble);

            let lastParsedParts = null;

            const fullText = await self._consumeChatSSE(reader, (acc) => {
                // 流式处理：使用段落分割，找到最后一段可能的内容
                const cleaned = self._cleanReplyText(acc);
                bubble.textContent = cleaned;

                // 尝试解析翻译 - 流式时使用宽松模式
                const parts = self._parseTranslationStream(cleaned);
                if (parts.japanese) {
                    bubble.textContent = parts.japanese;
                    if (parts.chinese && !translateBubble) {
                        translateBubble = document.createElement('div');
                        translateBubble.className = 'dialogue-bubble ai translate';
                        if (historyEl) historyEl.appendChild(translateBubble);
                    }
                    if (parts.chinese) {
                        translateBubble.textContent = '📖 ' + parts.chinese;
                    }
                }
            });

            const cleaned = self._cleanReplyText(fullText);
            const parts = lastParsedParts || self._parseTranslation(cleaned);

            if (parts.japanese) {
                bubble.textContent = parts.japanese;
                if (parts.chinese) {
                    if (!translateBubble) {
                        translateBubble = document.createElement('div');
                        translateBubble.className = 'dialogue-bubble ai translate';
                        if (historyEl) historyEl.appendChild(translateBubble);
                    }
                    translateBubble.textContent = '📖 ' + parts.chinese;
                }
            } else {
                bubble.textContent = cleaned || '（暂无回复）';
            }

            return { fullText: cleaned, bubble, translateBubble };
        }

        // 移除最后一次 AI 回复的 DOM 气泡（主气泡 + 翻译气泡）
        function removeLastAIBubbles() {
            if (!historyEl) return;
            const bubbles = historyEl.querySelectorAll('.dialogue-bubble.ai');
            if (bubbles.length >= 1) bubbles[bubbles.length - 1].remove();
            if (bubbles.length >= 2) bubbles[bubbles.length - 2].remove();
        }

        let finalResult = null;
        let lastError = null;
        let isFormatRetry = false;

        // 使用 for 循环实现 retry，支持超时和格式错误两种重试
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                let msg = userMessage;
                if (isFormatRetry) {
                    // 格式错误重试：注入纠正指令
                    msg = `${userMessage}\n\n[系统提示：请严格使用【日语原文】和【中文翻译】格式回复。第一行必须是【日语原文】，之后跟日语内容，然后换行写【中文翻译】：和中文翻译。不要输出任何纯中文段落。]`;
                    isFormatRetry = false;
                }

                // 用户消息气泡（仅第一次且非重试时添加）
                if (attempt === 0 && historyEl) {
                    const userBubble = document.createElement('div');
                    userBubble.className = 'dialogue-bubble user';
                    userBubble.textContent = userMessage;
                    historyEl.appendChild(userBubble);
                }

                finalResult = await doStreamRequest(msg);

                // 格式校验：检查是否包含【中文翻译】或中文翻译：
                const hasTranslation = finalResult.fullText && (
                    finalResult.fullText.includes('【中文翻译】') ||
                    finalResult.fullText.includes('中文翻译：')
                );
                const hasJapaneseStart = finalResult.fullText && finalResult.fullText.includes('【日语原文】');
                const isValidNewFormat = hasJapaneseStart && hasTranslation;
                const isValidOldFormat = hasTranslation;
                const isFormatValid = isValidNewFormat || isValidOldFormat;

                if (!isFormatValid && attempt < MAX_RETRIES) {
                    // 格式错误，移除错误气泡并重试
                    removeLastAIBubbles();
                    isFormatRetry = true;
                    // 短暂延迟让 UI 更新
                    await new Promise(r => setTimeout(r, 100));
                    continue;
                }

                // 成功或达到最大重试次数，跳出循环
                break;
            } catch (err) {
                lastError = err;
                if (err.name === 'AbortError') {
                    // 超时：移除已创建的气泡，等待重试
                    removeLastAIBubbles();
                    if (attempt < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 1000));
                    }
                } else {
                    // 非超时错误：尝试离线回复作为降级方案
                    removeLastAIBubbles();
                    const npcOfflineResponses = NPC_DATA[self._currentNpc]?.offlineResponses;
                    if (npcOfflineResponses && npcOfflineResponses.length > 0) {
                        const idx = Math.floor(Math.random() * npcOfflineResponses.length);
                        const offlineText = npcOfflineResponses[idx];

                        if (historyEl) {
                            const bubble = document.createElement('div');
                            bubble.className = 'dialogue-bubble ai';
                            bubble.textContent = offlineText;
                            historyEl.appendChild(bubble);
                        }
                        finalResult = { fullText: offlineText, bubble: null, translateBubble: null };
                        lastError = null;
                        if (typeof self.showNotification === 'function') {
                            self.showNotification('后端未连接，使用离线对话模式', 'warning');
                        }
                    }
                }
            }
        }

        // 统一处理结果
        if (lastError && !finalResult) {
            // 完全失败
            if (lastError.name === 'AbortError') {
                if (typeof self.showNotification === 'function') {
                    self.showNotification('AI 对话超时，请稍后重试', 'error');
                }
            } else {
                console.warn('NPC 对话失败:', lastError);
                if (typeof self.showNotification === 'function') {
                    self.showNotification(lastError.message || '对话失败，请稍后重试', 'error');
                }
            }
        } else if (finalResult && finalResult.fullText) {
            // 成功：保存历史 + 增加好感度
            self.addAffection(self._currentNpc, 1);
            self._addToHistory(self._currentNpc, userMessage, 'user');
            self._addToHistory(self._currentNpc, finalResult.fullText, 'ai');
            if (typeof self.showNotification === 'function') {
                self.showNotification(`${npcInfo.name} 好感度+1`, 'success');
            }
        }

        if (typingEl) typingEl.style.display = 'none';
    },

    _parseTranslationStream(text) {
        const result = { japanese: '', chinese: '' };
        if (!text) return result;
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 新格式：使用【日语原文】和【中文翻译】分隔符
        const jaMatch = normalized.match(/【日语原文】\s*([\s\S]*?)(?=\s*【中文翻译】\s*|$)/i);
        const cnMatch = normalized.match(/【中文翻译】\s*([\s\S]*)$/i);
        if (jaMatch) result.japanese = jaMatch[1].replace(/【日语原文】/gi, '').trim();
        if (cnMatch) result.chinese = cnMatch[1].replace(/【中文翻译】/gi, '').trim();
        if (result.japanese || result.chinese) return result;

        // 旧格式兼容
        const fullMatch = normalized.match(/(.+?)(?:中文翻译[：:])\s*([\s\S]+)$/);
        if (fullMatch) {
            result.japanese = fullMatch[1].trim();
            result.chinese = fullMatch[2].trim();
            return result;
        }

        // 流式中间状态
        const paragraphs = normalized.split(/\n\s*\n/);
        for (let i = paragraphs.length - 1; i >= 0; i--) {
            const p = paragraphs[i].trim();
            if (!p) continue;
            if (!/[\u3040-\u309F\u30A0-\u30FF]/.test(p) && p.length > 10 && !p.includes('翻译')) continue;
            if (p.includes('中文翻译') && !result.chinese) continue;
            if (p && !p.includes('中文翻译')) {
                result.japanese = p;
                return result;
            }
        }

        const lastLine = normalized.split('\n').pop()?.trim();
        if (lastLine && !lastLine.includes('中文翻译')) result.japanese = lastLine;
        return result;
    },

    _parseTranslation(text) {
        const result = { japanese: '', chinese: '' };
        if (!text) return result;
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 优先级1：新格式【日语原文】【中文翻译】
        const jaMatch = normalized.match(/【日语原文】\s*([\s\S]*?)(?=\s*【中文翻译】\s*|$)/i);
        const cnMatch = normalized.match(/【中文翻译】\s*([\s\S]*)$/i);
        if (jaMatch) result.japanese = jaMatch[1].replace(/【日语原文】/gi, '').trim();
        if (cnMatch) result.chinese = cnMatch[1].replace(/【中文翻译】/gi, '').trim();
        if (result.japanese || result.chinese) return result;

        // 优先级2：旧格式「中文翻译：」
        const paragraphs = normalized.split(/\n\s*\n/).map(p => p.trim()).filter(p => p);
        for (let i = paragraphs.length - 1; i >= 0; i--) {
            const p = paragraphs[i];
            const cnMatch2 = p.match(/^(.+?)(?:中文翻译[：:])\s*([\s\S]+)$/);
            if (cnMatch2) {
                result.japanese = cnMatch2[1].trim();
                result.chinese = cnMatch2[2].trim();
                return result;
            }
            const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(p);
            if (!hasJapanese && p.length > 5) continue;
            if (p.includes('中文翻译') && !p.startsWith('中文翻译')) {
                const altMatch = p.match(/^(.+?)(?:中文翻译[：:])\s*([\s\S]+)$/);
                if (altMatch) {
                    result.japanese = altMatch[1].trim();
                    result.chinese = altMatch[2].trim();
                    return result;
                }
            }
        }

        // 兜底：找到最后一个非纯中文段落
        for (let i = paragraphs.length - 1; i >= 0; i--) {
            const p = paragraphs[i];
            const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(p);
            if (hasJapanese && p.length < 100 && !p.includes('中文翻译：')) {
                result.japanese = p;
                return result;
            }
        }

        result.japanese = normalized;
        return result;
    },

    /**
     * 发送用户消息到 NPC 并获取回复
     */
    async sendUserMessage() {
        const inputEl = document.getElementById('npc-message-input');
        const sendBtn = document.getElementById('npc-send-btn');

        if (!inputEl) return;

        const userMessage = inputEl.value.trim();

        if (!userMessage) {
            if (typeof this.showNotification === 'function') {
                this.showNotification('请输入想说的话', 'warning');
            }
            return;
        }

        // 禁用输入和按钮
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = '...';
        }
        inputEl.disabled = true;

        const historyEl = document.getElementById('dialogue-history');
        inputEl.value = '';

        try {
            await this._streamNpcReply(userMessage);
        } catch (err) {
            console.warn('NPC对话失败:', err);
        }

        // 确保按钮始终恢复
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = '发送';
        }
        if (inputEl) {
            inputEl.disabled = false;
            inputEl.focus();
        }

        // 确保滚动到最新消息
        if (historyEl) {
            historyEl.scrollTop = historyEl.scrollHeight;
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

        // 好感度增加（延迟 renderNpc 避免清空对话 DOM）
        this.addAffection(this._currentNpc, affectionGain);
        const self = this;
        const npcId = this._currentNpc;
        setTimeout(function() { self.renderNpc(npcId); }, 200);

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
