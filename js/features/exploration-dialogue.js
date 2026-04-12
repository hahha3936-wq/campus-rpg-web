/**
 * 校园RPG - 探索对话与AI联动模块
 * 管理探索触发的AI对话流
 */

const ExplorationDialogue = {
    _sessionActive: false,

    init() {
        EventBus.on(EVENTS.LOCATION_DISCOVERED, this._onLocationDiscovered.bind(this));
        EventBus.on(EVENTS.CHAT_READY, this._onChatReady.bind(this));
    },

    /**
     * 新地点发现时触发AI对话
     */
    async _onLocationDiscovered(location) {
        if (this._sessionActive) return;
        this._sessionActive = true;

        const user = StateManager.get('user');
        const level = user?.role?.level || 1;

        // 构建探索发现时的AI提示词
        const discoveryPrompt = this._buildDiscoveryPrompt(location);

        const tryOpen = () => {
            if (window.ChatWidget && typeof window.ChatWidget.open === 'function') {
                window.ChatWidget.open();
                return true;
            }
            return false;
        };

        if (!tryOpen()) {
            let retries = 0;
            const timer = setInterval(() => {
                if (tryOpen() || ++retries > 30) {
                    clearInterval(timer);
                    if (retries > 30) {
                        this._sendSilentDiscovery(discoveryPrompt);
                    }
                }
            }, 100);
            setTimeout(async () => {
                await this._sendDiscoveryMessage(discoveryPrompt, location);
                this._sessionActive = false;
            }, 800);
        } else {
            setTimeout(async () => {
                await this._sendDiscoveryMessage(discoveryPrompt, location);
                this._sessionActive = false;
            }, 800);
        }
    },

    /**
     * 构建探索发现时的AI提示词
     */
    _label(loc) {
        return loc.short_name || loc.official_name || loc.name || loc.id || '未知地点';
    },

    _buildDiscoveryPrompt(location) {
        const label = this._label(location);
        const locationContext = {
            name: label,
            icon: location.icon,
            description: location.description,
            type: location.type,
            npcs: location.npcs || [],
            hasBuff: !!location.buff,
            buffName: location.buff?.name || '',
            hiddenEventChance: Math.round((location.hidden_event_chance || 0) * 100)
        };

        return {
            role: 'system',
            content: `【探索场景】玩家首次发现了校园地点：${label}${location.icon}

地点信息：
- 名称：${label}
- 类型：${location.type}
- 描述：${location.description}
- 特色：${location.buff ? `激活Buff「${location.buff.name}」：${location.buff.description || location.buff.effect || ''}` : '无特殊Buff'}
- 隐藏事件概率：${locationContext.hiddenEventChance}%
${location.npcs?.length > 0 ? `- 这里的NPC：${location.npcs.map(id => id === 'naruto' ? '漩涡鸣人老师' : '宇智波佐助助教').join('、')}` : ''}

请以「校园RPG主脑·阿游」的身份，用符合角色的口吻（幽默、温暖、有点热血）回复：
1. 对玩家发现新地点表示惊喜和鼓励
2. 简要介绍该地点的特色和可以利用的资源
3. 如果有Buff，给出使用建议
4. 引导玩家接下来的探索方向
5. 提及可能触发的隐藏事件

回复要简洁有力（3-5句话），善用emoji，营造游戏感。`
        };
    },

    /**
     * 发送发现消息到聊天窗口
     * 优先调用 AI，AI 不可用时使用预生成文本作为 fallback
     */
    async _sendDiscoveryMessage(prompt, location) {
        const introText = this._generateIntroText(location);

        // 先展示 fallback 文本，确保用户立即能看到内容
        if (window.ChatWidget?._addSystemMessage) {
            window.ChatWidget._addSystemMessage(introText);
        }

        // 尝试调用 AI 增强版回复
        try {
            const resp = await fetch(typeof window.apiUrl === 'function' ? window.apiUrl('/api/chat') : '/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `【自动触发】玩家刚刚发现了校园新地点「${this._label(location)}」，请以「校园RPG主脑·阿游」的身份，用游戏化的口吻（幽默、温暖、有点热血）给玩家一段简短（3-5句）的发现引导，提及地点特色、可能触发的隐藏事件，并鼓励玩家继续探索。善用emoji。`,
                    history: []
                })
            });

            if (resp.ok && resp.body) {
                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullContent = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const data = line.slice(6).trim();
                        if (data === '[DONE]' || data === '[done]') continue;
                        if (!data) continue;
                        // 过滤错误提示，不在对话中显示
                        if (data.startsWith('【')) continue;
                        fullContent += data;
                    }
                }

                // 如果 AI 返回了有效内容，追加到聊天窗口
                if (fullContent.trim() && window.ChatWidget?._addAIMessage) {
                    window.ChatWidget._addAIMessage(fullContent.trim());
                }
            }
        } catch (e) {
            console.warn('探索 AI 增强回复失败，使用 fallback 文本:', e);
            // fallback 文本已在上面展示了，这里静默忽略
        }
    },

    /**
     * 生成地点发现介绍文字（用于无AI时展示）
     */
    _generateIntroText(location) {
        const label = this._label(location);
        const buffDesc = location.buff?.description || location.buff?.effect || '';
        const templates = {
            study: `📚 你来到了 **${label}**！

这里是知识的殿堂，安静的学习环境让你的专注力大幅提升。

✨ 激活Buff：${location.buff?.name || '知识光环'}
${buffDesc || '专注+25，学习效率+15%'}

💡 阿游提示：在这里完成学习任务可以获得额外经验加成哦！`,
            food: `🍜 你来到了 **${label}**！

美食的香气扑面而来，这里是补充能量的好去处。

✨ 激活Buff：${location.buff?.name || '饱餐一顿'}
${buffDesc || '能量+20，心情+5'}

💡 阿游提示：好好吃饭也是学习的重要保障！`,
            living: `🏠 你回到了 **${label}**！

这里是你的温馨小窝，好好休息才能更好地出发。

✨ 激活Buff：${location.buff?.name || '舒适休息'}
${buffDesc || '能量恢复+10%'}

💡 阿游提示：休息是为了走更远的路！`,
            sports: `🏃 你来到了 **${label}**！

运动是释放压力、提升状态的好方式。

✨ 激活Buff：${location.buff?.name || '运动达人'}
${buffDesc || '能量-10，压力-20，心情+15'}

💡 阿游提示：适度运动能让学习效率更高！`,
            leisure: `🌳 你来到了 **${label}**！

宁静的绿色空间，是散步和放松的好地方。

✨ 激活Buff：${location.buff?.name || '心灵治愈'}
${buffDesc || '心情+20，压力-15'}

💡 阿游提示：有时候停下来闻闻花香，也是一种成长。`,
            social: `☕ 你来到了 **${label}**！

这里适合学习、小组讨论或一个人静静发呆。

✨ 激活Buff：${location.buff?.name || '咖啡加成'}
${buffDesc || '专注+15'}

💡 阿游提示：偶尔social一下也很重要！`,
            shop: `📖 你来到了 **${label}**！

各类书籍和文具应有尽有。

✨ 激活Buff：${location.buff?.name || '知识渴求'}
${buffDesc || '经验+15'}

💡 阿游提示：买书是最低成本的投资！`,
            academic: `🔬 你来到了 **${label}**！

充满神秘感的科研空间。

✨ 激活Buff：${location.buff?.name || '科研探索'}
${buffDesc || '专注+20，获得额外经验+10%'}

💡 阿游提示：动手实践是学习的最好方式！`
        };

        return templates[location.type] || templates.study;
    },

    /**
     * 静默记录探索发现（AI不可用时的后备，记录到本地）
     */
    async _sendSilentDiscovery(prompt) {
        // 不再调用不存在的后端端点，改为本地日志
        console.info('[探索] 发现新地点，已记录（AI不可用）:', prompt.content?.substring(0, 50));
    },

    /**
     * 处理聊天就绪事件
     */
    _onChatReady(data) {
        try {
            const location = data.context?.location;
            const msg = location
                ? `我想了解一下${location?.name || '这里'}的信息，你能给我一些建议吗？`
                : (data.context?.message || '你好，阿游！能给我一些校园生活的建议吗？');

            const tryOpen = () => {
                if (window.ChatWidget && typeof window.ChatWidget.open === 'function') {
                    window.ChatWidget.open({ message: msg, autoSend: true });
                    return true;
                }
                return false;
            };

            if (!tryOpen()) {
                let retries = 0;
                const timer = setInterval(() => {
                    if (tryOpen() || ++retries > 30) {
                        clearInterval(timer);
                    }
                }, 100);
            }
        } catch (err) {
            console.error('[_onChatReady] error:', err);
        }
    },

    /**
     * 获取地点的探索引导文本
     */
    getGuidanceText(location, userLevel) {
        const levelGap = (location.unlock_requirements?.min_level || 1) - userLevel;

        if (levelGap > 0) {
            return `🔒 此地点需要达到 **Lv.${location.unlock_requirements.min_level}** 才能探索。\n\n当前等级：Lv.${userLevel}\n还需提升 ${levelGap} 级才能解锁！\n\n💡 建议：多完成任务获取经验值，快速升级！`;
        }

        const hour = new Date().getHours();
        const timeTips = {
            morning: '🌅 早起的鸟儿有虫吃！这个时间点学习效率最高。',
            afternoon: '☀️ 下午时光，适合处理需要耐心的任务。',
            evening: '🌆 晚间探索有几率触发特殊事件哦！',
            night: '🌙 深夜探索者！这里有一些白天看不到的秘密...'
        };

        let timeTip = '';
        if (hour >= 6 && hour < 12) timeTip = timeTips.morning;
        else if (hour >= 12 && hour < 18) timeTip = timeTips.afternoon;
        else if (hour >= 18 && hour < 22) timeTip = timeTips.evening;
        else timeTip = timeTips.night;

        const locLabel = location.short_name || location.official_name || location.name || '该地点';
        return `${timeTip}\n\n探索「${locLabel}」可能获得：${location.buff?.description || location.buff?.effect || '独特体验'}\n隐藏事件概率：${Math.round((location.hidden_event_chance || 0) * 100)}%`;
    }
};

// 导出
window.ExplorationDialogue = ExplorationDialogue;
