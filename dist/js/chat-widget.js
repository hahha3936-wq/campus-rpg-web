/**
 * 校园RPG - 浮动聊天框逻辑
 * 调用 Flask /api/chat 路由，桥接 DeepSeek API
 */

var ChatWidgetModule = (function() {
    'use strict';

    // ============================================
    // 状态
    // ============================================
    const state = {
        isOpen: false,
        isLoading: false,
        conversationHistory: [],
        aiOnline: false,
        connectionCheckTimer: null
    };

    // ============================================
    // 工具函数
    // ============================================
    function escHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function formatAIResponse(text) {
        if (!text) return '';
        // 1. 先解析 Markdown（此时原始字符还未被转义）
        text = text
            // 粗体和斜体（优先处理，避免被标题等干扰）
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // 标题
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            // 列表
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/gs, '<ul>$&</ul>')
            // 代码（行内）
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // 换行
            .replace(/\n/g, '<br>');
        // 2. 再对非标签内容进行 HTML 转义，防止 XSS
        //    原理：只对文本节点转义，保留已有的 HTML 标签
        text = _escapeHtmlInFormattedText(text);
        return text;
    }

    /**
     * 对已格式化的 HTML 字符串中的纯文本进行转义，
     * 保留已有的 HTML 标签（防止 Markdown 解析产生的标签被误转义）
     * 通过正则分割标签和文本来实现
     */
    function _escapeHtmlInFormattedText(html) {
        // 分割：HTML标签片段 和 纯文本片段交替出现
        const parts = html.split(/(<[^>]+>)/g);
        return parts.map(part => {
            // 以 < 开头的片段视为 HTML 标签，不转义直接保留
            if (part.startsWith('<')) return part;
            // 其余为纯文本，进行 HTML 转义
            return part
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }).join('');
    }

    function scrollToBottom() {
        const el = document.getElementById('chat-messages');
        if (el) el.scrollTop = el.scrollHeight;
    }

    function getAvatar(role) {
        return role === 'user'
            ? '<span>👤</span>'
            : '<span>🎮</span>';
    }

    // ============================================
    // DOM 创建
    // ============================================
    function createWidget() {
        // 如果已存在则跳过
        if (document.getElementById('chat-widget-window')) return;
        console.log('[ChatWidget] createWidget() — building DOM elements');

        const widgetHTML = `
        <!-- 浮动按钮 -->
        <button id="chat-widget-toggle" title="和阿游聊天" aria-label="打开聊天">
            💬
        </button>

        <!-- 聊天窗口 -->
        <div id="chat-widget-window">
            <!-- 头部 -->
            <div class="chat-header">
                <div class="chat-header-avatar">🎮</div>
                <div class="chat-header-info">
                    <div class="chat-header-name">阿游 · 校园RPG主脑</div>
                    <div class="chat-header-status">
                        <span class="status-dot offline" id="gw-status-dot"></span>
                        <span id="gw-status-text">检查连接...</span>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <button id="call-xiaoling-btn" class="call-xiaoling-btn" title="召唤小灵 AI 助手（语音对话）">🌟 小灵</button>
                    <button id="chat-clear-btn" title="清空对话" aria-label="清空对话">🗑️</button>
                </div>
            </div>

            <!-- 消息列表 -->
            <div class="chat-messages" id="chat-messages">
                <div class="chat-welcome">
                    <div class="chat-welcome-icon">🎮✨</div>
                    <div class="chat-welcome-title">欢迎回来，冒险者！</div>
                    <div class="chat-welcome-desc">
                        我是阿游，你的校园RPG主脑<br>
                        输入你的问题，我会帮你管理任务、分析进度、提供学习建议！
                    </div>
                    <div class="quick-questions">
                        <button class="quick-q-btn" data-msg="今日面板">📊 今日面板</button>
                        <button class="quick-q-btn" data-msg="我的角色">👤 我的角色</button>
                        <button class="quick-q-btn" data-msg="任务列表">📋 任务列表</button>
                        <button class="quick-q-btn" data-msg="今日运势">🍀 今日运势</button>
                    </div>
                </div>
            </div>

            <!-- 输入区 -->
            <div class="chat-input-area">
                <div class="chat-input-wrapper">
                    <textarea
                        id="chat-input"
                        placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                        rows="1"
                        maxlength="2000"
                    ></textarea>
                    <button id="chat-send-btn" title="发送" aria-label="发送">➤</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
    }

    // ============================================
    // 连接状态
    // ============================================
    async function checkAIHealth() {
        try {
            const resp = await fetch(typeof window.apiUrl === 'function' ? window.apiUrl('/api/chat/health') : '/api/chat/health', { cache: 'no-cache' });
            const data = await resp.json();
            const dot = document.getElementById('gw-status-dot');
            const text = document.getElementById('gw-status-text');

            if (data.ai_reachable) {
                state.aiOnline = true;
                if (dot) dot.classList.remove('offline');
                if (text) text.textContent = 'DeepSeek 在线';
            } else {
                state.aiOnline = false;
                if (dot) dot.classList.add('offline');
                if (text) text.textContent = 'DeepSeek 离线';
            }
        } catch {
            const dot = document.getElementById('gw-status-dot');
            const text = document.getElementById('gw-status-text');
            state.aiOnline = false;
            if (dot) dot.classList.add('offline');
            if (text) text.textContent = 'DeepSeek 离线';
        }
    }

    // ============================================
    // 消息渲染
    // ============================================
    function appendMessage(role, content, avatar) {
        const msgsEl = document.getElementById('chat-messages');
        if (!msgsEl) return;

        // 移除欢迎区
        const welcome = msgsEl.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        const div = document.createElement('div');
        div.className = `chat-message ${role}`;

        if (role === 'ai' && content === '') {
            div.classList.add('typing');
        }

        div.innerHTML = `
            <div class="chat-message-avatar">${avatar}</div>
            <div class="chat-message-content">${role === 'ai' ? formatAIResponse(content) : escHtml(content)}</div>
        `;
        msgsEl.appendChild(div);
        scrollToBottom();
        return div;
    }

    function removeTyping() {
        document.querySelectorAll('.chat-message.typing').forEach(el => {
            el.classList.remove('typing');
        });
    }

    function showLoadingDots() {
        const msgsEl = document.getElementById('chat-messages');
        if (!msgsEl) return;

        const div = document.createElement('div');
        div.className = 'chat-message ai';
        div.id = 'chat-loading-msg';
        div.innerHTML = `
            <div class="chat-message-avatar"><span>🎮</span></div>
            <div class="chat-loading-dots">
                <span></span><span></span><span></span>
            </div>
        `;
        msgsEl.appendChild(div);
        scrollToBottom();
    }

    function removeLoadingDots() {
        const el = document.getElementById('chat-loading-msg');
        if (el) el.remove();
    }

    // ============================================
    // 发送消息
    // ============================================
    async function sendMessage() {
        const inputEl = document.getElementById('chat-input');
        const sendBtn = document.getElementById('chat-send-btn');
        if (!inputEl || !sendBtn) return;

        const text = inputEl.value.trim();
        if (!text || state.isLoading) return;

        state.isLoading = true;
        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendBtn.disabled = true;

        // 用户消息
        appendMessage('user', text, getAvatar('user'));
        state.conversationHistory.push({ role: 'user', content: text });

        // 加载状态
        showLoadingDots();

        // Fallback 回复（任何异常时使用）
        const FALLBACK_REPLIES = [
            '你好！我是阿游，你的校园RPG主脑！🎮\n\n很高兴和你交流！作为校园RPG的主脑，我可以帮你：\n• 分析任务策略，让你不走弯路\n• 推荐校园探索路线，发现隐藏Buff\n• 解答签到、成就、番茄钟等问题\n• 分享校园生活小技巧\n\n你有什么想问的吗？或者直接说你现在想做什么？',
            '嘿！阿游上线啦！👋\n\n作为你的校园冒险向导，我能帮你做的事情可多了：\n• 给你学习任务的最优完成顺序\n• 分析哪个校园地点最适合你现在的状态\n• 解读成就解锁条件，帮你快速升级\n• 提醒你保持状态平衡\n\n有什么困扰你的吗？或者想聊聊今天的计划？',
            '哟！欢迎来到校园RPG！🎮\n\n我是阿游，随时待命的校园冒险助手！✨\n\n目前我可以在以下方面帮到你：\n📋 任务规划 — 制定最省力的完成路线\n🗺️ 校园探索 — 发现隐藏Buff和彩蛋\n🏆 成就指南 — 告诉你每个成就怎么解锁\n🍅 学习技巧 — 番茄钟高效使用心得\n\n直接告诉我你现在的需求吧！',
            '阿游正在思考中...不过 AI 服务暂时不可用。\n\n💡 但别担心！我可以帮你：\n• 查看任务列表\n• 管理成就\n• 探索校园地点\n• 规划学习计划\n\n直接告诉我你想做什么，我会尽量帮你！',
            '抱歉，阿游现在无法回应（AI 服务离线）。\n\n🔧 排查方法：\n1. 检查 Flask 后端是否运行\n2. 确认 DeepSeek API 密钥配置正确\n3. 查看浏览器控制台错误信息\n\n不过你仍然可以通过应用的其他功能管理你的校园冒险！',
        ];
        const fallbackReply = FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];

        // AbortController：前端 15s 超时，防止 AI 无响应时界面卡死
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {

            const resp = await fetch(typeof window.apiUrl === 'function' ? window.apiUrl('/api/chat') : '/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: state.conversationHistory.slice(-20)
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!resp.ok) {
                removeLoadingDots();
                appendMessage('ai', fallbackReply, getAvatar('ai'));
                state.conversationHistory.push({ role: 'assistant', content: fallbackReply });
                state.isLoading = false;
                sendBtn.disabled = false;
                return;
            }

            // SSE 流式读取
            if (!resp.body) {
                removeLoadingDots();
                appendMessage('ai', fallbackReply, getAvatar('ai'));
                state.conversationHistory.push({ role: 'assistant', content: fallbackReply });
                state.isLoading = false;
                sendBtn.disabled = false;
                return;
            }
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';

            removeLoadingDots();
            const aiDiv = appendMessage('ai', '', getAvatar('ai'));

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let hasError = false;
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]' || data === '[done]') continue;
                    if (!data) continue;

                    // 检测错误消息（后端发送 [ERROR] 前缀）
                    if (data.startsWith('[ERROR]')) {
                        hasError = true;
                        continue;
                    }

                    fullContent += data;
                    const contentEl = aiDiv?.querySelector('.chat-message-content');
                    if (contentEl) {
                        contentEl.innerHTML = formatAIResponse(fullContent);
                        scrollToBottom();
                    }
                }

                // 如果收到错误消息，停止等待并切换 fallback
                if (hasError && !fullContent) {
                    break;
                }
            }

            removeTyping();

            // 如果 AI 没有返回有效内容，使用 fallback
            if (!fullContent.trim()) {
                const contentEl = aiDiv?.querySelector('.chat-message-content');
                if (contentEl) {
                    contentEl.innerHTML = formatAIResponse(fallbackReply);
                }
                state.conversationHistory.push({ role: 'assistant', content: fallbackReply });
            } else {
                state.conversationHistory.push({ role: 'assistant', content: fullContent });
            }

        } catch (err) {
            clearTimeout(timeoutId);
            removeLoadingDots();
            if (err.name === 'AbortError') {
                // 超时时显示友好提示而非 fallback 随机回复
                appendMessage('ai', '请求超时，AI 暂时无法回应，请稍后重试。', getAvatar('ai'));
                state.conversationHistory.push({ role: 'assistant', content: '请求超时，AI 暂时无法回应，请稍后重试。' });
            } else {
                appendMessage('ai', fallbackReply, getAvatar('ai'));
                state.conversationHistory.push({ role: 'assistant', content: fallbackReply });
            }
        } finally {
            state.isLoading = false;
            sendBtn.disabled = false;
            inputEl.focus();
        }
    }

    // ============================================
    // 自动调整 textarea 高度
    // ============================================
    function autoResizeTextarea(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    }

    // ============================================
    // 事件绑定
    // ============================================
    function bindEvents() {
        const toggle = document.getElementById('chat-widget-toggle');
        const win = document.getElementById('chat-widget-window');
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('chat-send-btn');
        const clearBtn = document.getElementById('chat-clear-btn');
        const msgsEl = document.getElementById('chat-messages');

        // 切换窗口
        if (toggle && win) {
            toggle.addEventListener('click', () => {
                state.isOpen = !state.isOpen;
                win.classList.toggle('open', state.isOpen);
                toggle.classList.toggle('active', state.isOpen);
                toggle.textContent = state.isOpen ? '✕' : '💬';
                if (state.isOpen) {
                    input?.focus();
                    checkAIHealth();
                }
            });
        }

        // 召唤小灵
        const xiaolingBtn = document.getElementById('call-xiaoling-btn');
        if (xiaolingBtn) {
            xiaolingBtn.addEventListener('click', () => {
                if (window.VoiceNPC && VoiceNPC.showPanel) {
                    VoiceNPC.showPanel();
                } else {
                    appendMessage('ai', '小灵正在启动中，请稍候在右下角召唤我~', getAvatar('ai'));
                }
            });
        }

        // 小灵就绪后改变按钮样式
        document.addEventListener('voicenpc-ready', function () {
            const btn = document.getElementById('call-xiaoling-btn');
            if (btn) btn.classList.add('ready');
        });

        // 发送按钮
        if (sendBtn) {
            sendBtn.addEventListener('click', sendMessage);
        }

        // 输入框事件
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            input.addEventListener('input', () => {
                autoResizeTextarea(input);
            });

            input.addEventListener('focus', () => {
                if (!state.isOpen) {
                    state.isOpen = true;
                    win?.classList.add('open');
                    toggle?.classList.add('active');
                    toggle?.classList.add('open');
                    toggle.textContent = '✕';
                }
            });
        }

        // 清空对话
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                state.conversationHistory = [];
                const msgs = document.getElementById('chat-messages');
                if (msgs) {
                    msgs.innerHTML = `
                        <div class="chat-welcome">
                            <div class="chat-welcome-icon">🎮✨</div>
                            <div class="chat-welcome-title">对话已清空！</div>
                            <div class="chat-welcome-desc">
                                我是阿游，你的校园RPG主脑<br>
                                输入你的问题，我会帮你管理任务、分析进度、提供学习建议！
                            </div>
                            <div class="quick-questions">
                                <button class="quick-q-btn" data-msg="今日面板">📊 今日面板</button>
                                <button class="quick-q-btn" data-msg="我的角色">👤 我的角色</button>
                                <button class="quick-q-btn" data-msg="任务列表">📋 任务列表</button>
                                <button class="quick-q-btn" data-msg="今日运势">🍀 今日运势</button>
                            </div>
                        </div>
                    `;
                    bindQuickQuestions();
                }
            });
        }

        // 快捷问题点击
        bindQuickQuestions();

        // 定期检查 AI 服务状态
        state.connectionCheckTimer = setInterval(checkAIHealth, 30000);
    }

    function bindQuickQuestions() {
        document.querySelectorAll('.quick-q-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const msg = btn.getAttribute('data-msg');
                if (msg) {
                    const input = document.getElementById('chat-input');
                    if (input) input.value = msg;
                    sendMessage();
                }
            });
        });
    }

    // ============================================
    // 初始化 / 销毁
    // ============================================
    function init() {
        console.log('[ChatWidget] init() called');
        createWidget();
        bindEvents();
        checkAIHealth();
    }

    function destroy() {
        if (state.connectionCheckTimer) {
            clearInterval(state.connectionCheckTimer);
            state.connectionCheckTimer = null;
        }
        document.getElementById('chat-widget-window')?.remove();
        document.getElementById('chat-widget-toggle')?.remove();
        state.isOpen = false;
        state.conversationHistory = [];
        state.isLoading = false;
    }

    // ============================================
    // 对外暴露的 API（供 ExplorationDialogue 等模块调用）
    // ============================================
    function _elevateAboveExplorationModal() {
        const modal = document.getElementById('explorationModal');
        if (!modal || !modal.classList.contains('show')) return;
        const win = document.getElementById('chat-widget-window');
        const toggle = document.getElementById('chat-widget-toggle');
        if (win && !win.dataset.zUnderExploration) {
            win.dataset.zUnderExploration = String(window.getComputedStyle(win).zIndex || '11000');
            win.style.zIndex = '12100';
        }
        if (toggle && !toggle.dataset.zUnderExploration) {
            toggle.dataset.zUnderExploration = String(window.getComputedStyle(toggle).zIndex || '11001');
            toggle.style.zIndex = '12101';
        }
    }

    function open(context) {
        try {
            const autoSend = !!(context && context.autoSend && context.message);
            console.log('[ChatWidget] open() called', { context, state_isOpen: state.isOpen });

            // 防御：确保 widget 已创建（可能 init 还未执行）
            if (!document.getElementById('chat-widget-window')) {
                console.warn('[ChatWidget] widget not initialized yet, calling init()...');
                init();
            }

            if (state.isOpen) {
                if (context?.message) {
                    const input = document.getElementById('chat-input');
                    if (input) {
                        input.value = context.message;
                        input.focus();
                    }
                }
                _elevateAboveExplorationModal();
                if (autoSend) {
                    setTimeout(() => sendMessage(), 0);
                }
                return;
            }
            state.isOpen = true;
            const win = document.getElementById('chat-widget-window');
            const toggle = document.getElementById('chat-widget-toggle');
            console.log('[ChatWidget] adding .open class', { win: !!win, toggle: !!toggle });
            if (win) {
                win.classList.add('open');
                // 强制重排，确保 CSS 显示生效
                void win.offsetHeight;
                console.log('[ChatWidget] win.classList after add:', win.classList.toString());
            }
            if (toggle) {
                toggle.classList.add('active');
                toggle.textContent = '💬';
            }
            _elevateAboveExplorationModal();
            if (context?.message) {
                setTimeout(() => {
                    const input = document.getElementById('chat-input');
                    if (input) {
                        input.value = context.message;
                        input.focus();
                    }
                    if (autoSend) {
                        sendMessage();
                    }
                }, 50);
            }
        } catch (err) {
            console.error('[ChatWidget] open() error:', err);
        }
    }

    function _addSystemMessage(content) {
        const msgsEl = document.getElementById('chat-messages');
        if (!msgsEl) return;
        const div = document.createElement('div');
        div.className = 'chat-message bot';
        div.innerHTML = `<div class="message-avatar">🎮</div><div class="message-content">${content}</div>`;
        msgsEl.appendChild(div);
        msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    /**
     * 追加一条 AI 消息气泡（供 ExplorationDialogue 等模块调用）
     */
    function _addAIMessage(content) {
        const msgsEl = document.getElementById('chat-messages');
        if (!msgsEl) return;
        const div = document.createElement('div');
        div.className = 'chat-message ai';
        div.innerHTML = `<div class="chat-message-avatar">🎮</div><div class="chat-message-content">${formatAIResponse(content)}</div>`;
        msgsEl.appendChild(div);
        msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    // 页面 unload 时自动清理
    window.addEventListener('beforeunload', destroy);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init, destroy, checkAIHealth, open, _addSystemMessage, _addAIMessage };

})();

// 导出到 window，供其他模块（ExplorationDialogue 等）调用
window.ChatWidget = ChatWidgetModule;
window.ChatWidgetModule = ChatWidgetModule;
