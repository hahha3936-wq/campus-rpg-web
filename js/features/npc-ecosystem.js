/**
 * 校园RPG - NPC生态系统核心管理器
 * 
 * 功能职责：
 * 1. NPC解锁管理（AR扫描、任务完成、成就达成、剧情递进）
 * 2. NPC好感度系统（0-5级动态成长）
 * 3. NPC对话分支系统（按好感度和用户属性）
 * 4. 对接StateManager、EventBus、OfflineStorage
 * 5. NPC任务发布与奖励发放
 * 
 * 依赖模块：
 * - NPC_ECOSYSTEM_DATA: NPC数据定义
 * - StateManager: 用户状态管理
 * - EventBus: 事件总线
 * - OfflineStorage: 离线存储
 */

(function() {
    'use strict';

    // ============================================
    // API URL 辅助
    // ============================================
    function _npcApiUrl(path) {
        return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
    }

    // ============================================
    // NPCEcosystem 核心类
    // ============================================
    const NPCEcosystem = {

        // ============================================
        // 内部状态
        // ============================================
        _unlockedNPCs: {},      // { npcId: { unlocked: bool, unlockedAt: timestamp } }
        _relations: {},         // { npcId: { affection: number, lastActive: timestamp, ... } }
        _dialogueHistory: {},    // { npcId: [{ text, role, time }] }
        _dailyInteractions: {},  // { npcId: { date: string, count: number } }
        _eggTriggered: {},      // { eggId: timestamp }
        _initialized: false,
        _allNPCs: null,          // 扁平化的所有NPC列表缓存
        _userStats: null,        // 用户统计数据缓存

        // ============================================
        // 初始化
        // ============================================
        async init() {
            if (this._initialized) return;
            
            console.log('[NPCEcosystem] 开始初始化...');
            
            // 等待依赖模块就绪
            if (typeof StateManager === 'undefined') {
                console.warn('[NPCEcosystem] StateManager 未加载，等待...');
                await this._waitForModule('StateManager', 3000);
            }
            if (typeof NPC_ECOSYSTEM_DATA === 'undefined') {
                console.warn('[NPCEcosystem] NPC_ECOSYSTEM_DATA 未加载，等待...');
                await this._waitForModule('NPC_ECOSYSTEM_DATA', 3000);
            }

            // 构建扁平化的NPC列表
            this._buildFlatNPCList();

            // 加载本地缓存的好感度和解锁数据
            await this._loadLocalData();

            // 检查并处理初始化解锁（初始解锁型NPC）
            await this._checkInitialUnlocks();

            // 加载用户统计数据
            this._updateUserStats();

            // 注册事件监听
            this._bindEvents();

            this._initialized = true;
            console.log(`[NPCEcosystem] 初始化完成，已解锁 ${Object.keys(this._unlockedNPCs).length} 个NPC`);
        },

        /**
         * 检查是否已初始化
         */
        isInitialized() {
            return !!this._initialized;
        },

        /**
         * 等待指定模块加载
         */
        _waitForModule(moduleName, timeout) {
            return new Promise((resolve) => {
                const start = Date.now();
                const check = () => {
                    if (window[moduleName] !== undefined) {
                        resolve();
                    } else if (Date.now() - start > timeout) {
                        console.warn(`[NPCEcosystem] 等待 ${moduleName} 超时`);
                        resolve();
                    } else {
                        setTimeout(check, 100);
                    }
                };
                check();
            });
        },

        /**
         * 构建扁平化的NPC列表缓存
         */
        _buildFlatNPCList() {
            const flat = {};
            const data = NPC_ECOSYSTEM_DATA;
            for (const category of Object.values(data)) {
                if (category.npcs) {
                    for (const [id, npc] of Object.entries(category.npcs)) {
                        flat[id] = { ...npc, category: category.category };
                    }
                }
            }
            this._allNPCs = flat;
        },

        /**
         * 从本地存储加载数据
         */
        async _loadLocalData() {
            const uid = this._getUserId();

            // 加载已解锁NPC
            try {
                const unlockedData = localStorage.getItem(NPC_STORAGE_KEYS.unlocked_npcs + '_' + uid);
                if (unlockedData) {
                    this._unlockedNPCs = JSON.parse(unlockedData);
                }
            } catch (e) {
                console.warn('[NPCEcosystem] 加载解锁数据失败:', e);
            }

            // 加载好感度数据（优先从StateManager）
            if (window.StateManager) {
                const user = StateManager.get('user');
                if (user?.npc_relationship) {
                    this._relations = user.npc_relationship;
                }
            }
            if (Object.keys(this._relations).length === 0) {
                try {
                    const relData = localStorage.getItem(NPC_STORAGE_KEYS.npc_relations + '_' + uid);
                    if (relData) {
                        this._relations = JSON.parse(relData);
                    }
                } catch (e) {
                    console.warn('[NPCEcosystem] 加载好感度数据失败:', e);
                }
            }

            // 加载对话历史
            try {
                const histData = localStorage.getItem(NPC_STORAGE_KEYS.npc_dialogue_history + '_' + uid);
                if (histData) {
                    this._dialogueHistory = JSON.parse(histData);
                }
            } catch (e) {
                console.warn('[NPCEcosystem] 加载对话历史失败:', e);
            }

            // 加载每日互动记录
            try {
                const dailyData = localStorage.getItem(NPC_STORAGE_KEYS.npc_daily_interactions + '_' + uid);
                if (dailyData) {
                    this._dailyInteractions = JSON.parse(dailyData);
                }
            } catch (e) {
                console.warn('[NPCEcosystem] 加载每日互动数据失败:', e);
            }

            // 加载已触发彩蛋记录
            try {
                const eggData = localStorage.getItem(NPC_STORAGE_KEYS.npc_egg_triggered + '_' + uid);
                if (eggData) {
                    this._eggTriggered = JSON.parse(eggData);
                }
            } catch (e) {
                console.warn('[NPCEcosystem] 加载彩蛋数据失败:', e);
            }

            // 初始化未解锁NPC的好感度为初始值
            for (const [npcId, npc] of Object.entries(this._allNPCs)) {
                if (!this._relations[npcId]) {
                    this._relations[npcId] = {
                        affection: npc.affection?.initial || 0,
                        max_affection: npc.affection?.max || 500,
                        title: npc.title,
                        lastActive: null,
                        unlockedAt: null
                    };
                }
            }
        },

        /**
         * 保存数据到本地存储
         */
        _saveLocalData() {
            const uid = this._getUserId();
            try {
                localStorage.setItem(NPC_STORAGE_KEYS.unlocked_npcs + '_' + uid, JSON.stringify(this._unlockedNPCs));
                localStorage.setItem(NPC_STORAGE_KEYS.npc_relations + '_' + uid, JSON.stringify(this._relations));
                localStorage.setItem(NPC_STORAGE_KEYS.npc_dialogue_history + '_' + uid, JSON.stringify(this._dialogueHistory));
                localStorage.setItem(NPC_STORAGE_KEYS.npc_daily_interactions + '_' + uid, JSON.stringify(this._dailyInteractions));
                localStorage.setItem(NPC_STORAGE_KEYS.npc_egg_triggered + '_' + uid, JSON.stringify(this._eggTriggered));
            } catch (e) {
                console.warn('[NPCEcosystem] 保存本地数据失败:', e);
            }

            // 同步到StateManager
            if (window.StateManager) {
                const user = StateManager.get('user');
                if (user) {
                    user.npc_relationship = this._relations;
                    StateManager.set('user', user);
                }
            }
        },

        /**
         * 获取用户ID
         */
        _getUserId() {
            try {
                const userData = localStorage.getItem('campus_rpg_user');
                if (userData) {
                    const parsed = JSON.parse(userData);
                    return parsed?.id || 'guest';
                }
            } catch (e) {}
            return 'guest';
        },

        /**
         * 更新用户统计数据缓存
         */
        _updateUserStats() {
            const user = StateManager?.get('user') || {};
            const role = user.role || {};
            const tasks = StateManager?.get('tasks') || [];
            const exploration = StateManager?.get('exploration') || {};
            
            this._userStats = {
                level: role.level || 1,
                completedTasks: tasks.filter(t => t.status === 'completed' || t.progress >= 100).length,
                totalTasks: tasks.length,
                discoveredLocations: exploration.discovered_locations?.length || 0,
                totalLocations: StateManager?.get('locations')?.length || 0,
                achievements: user.achievements || {},
                dailySignins: 0 // TODO: 从后端获取
            };
        },

        // ============================================
        // NPC 解锁管理
        // ============================================

        /**
         * 检查并处理初始解锁
         */
        async _checkInitialUnlocks() {
            for (const [npcId, npc] of Object.entries(this._allNPCs)) {
                if (npc.unlock?.type === 'initial' && !this._unlockedNPCs[npcId]) {
                    await this._doUnlock(npcId, 'initial');
                }
            }
        },

        /**
         * 执行解锁
         */
        async _doUnlock(npcId, reason) {
            if (this._unlockedNPCs[npcId]?.unlocked) {
                return false; // 已解锁
            }

            const npc = this._allNPCs[npcId];
            if (!npc) {
                console.warn(`[NPCEcosystem] 尝试解锁未知NPC: ${npcId}`);
                return false;
            }

            // 更新解锁状态
            this._unlockedNPCs[npcId] = {
                unlocked: true,
                unlockedAt: Date.now(),
                reason: reason
            };

            // 初始化好感度
            if (!this._relations[npcId]) {
                this._relations[npcId] = {
                    affection: npc.affection?.initial || 0,
                    max_affection: npc.affection?.max || 500,
                    title: npc.title,
                    lastActive: Date.now(),
                    unlockedAt: Date.now()
                };
            }

            this._saveLocalData();

            // 触发事件
            if (window.EventBus) {
                EventBus.emit('npc:unlocked', { npcId, npc, reason });
            }

            console.log(`[NPCEcosystem] NPC解锁: ${npc.name} (${npcId}), 原因: ${reason}`);
            return true;
        },

        /**
         * 检查AR扫描触发解锁
         * @param {string} markerId - AR标记ID
         */
        async checkARUnlock(markerId) {
            const mapping = NPC_AR_MAPPINGS[markerId];
            if (!mapping || mapping.length === 0) return [];

            const newlyUnlocked = [];
            for (const npcId of mapping) {
                const npc = this._allNPCs[npcId];
                if (!npc) continue;
                
                // 检查解锁条件
                const canUnlock = await this._checkUnlockCondition(npc);
                if (canUnlock) {
                    const result = await this._doUnlock(npcId, `ar_scan:${markerId}`);
                    if (result) {
                        newlyUnlocked.push({ npcId, npc });
                    }
                }
            }
            return newlyUnlocked;
        },

        /**
         * 检查任务完成触发解锁
         * @param {object} task - 完成的任务
         */
        async checkTaskUnlock(task) {
            const newlyUnlocked = [];
            for (const [npcId, npc] of Object.entries(this._allNPCs)) {
                if (this._unlockedNPCs[npcId]?.unlocked) continue;
                if (npc.unlock?.type !== 'task_complete') continue;
                if (npc.unlock?.related_npc && !this._unlockedNPCs[npc.unlock.related_npc]?.unlocked) continue;

                // 更新任务计数
                const completedCount = this._userStats?.completedTasks || 0;
                if (completedCount >= npc.unlock.task_unlock_threshold) {
                    const result = await this._doUnlock(npcId, `task_complete:${task?.id || 'unknown'}`);
                    if (result) {
                        newlyUnlocked.push({ npcId, npc });
                    }
                }
            }
            return newlyUnlocked;
        },

        /**
         * 检查成就解锁
         * @param {string} achievementId - 成就ID
         */
        async checkAchievementUnlock(achievementId) {
            const newlyUnlocked = [];
            for (const [npcId, npc] of Object.entries(this._allNPCs)) {
                if (this._unlockedNPCs[npcId]?.unlocked) continue;
                if (npc.unlock?.type !== 'achievement') continue;
                if (npc.unlock?.achievement_id === achievementId) {
                    const result = await this._doUnlock(npcId, `achievement:${achievementId}`);
                    if (result) {
                        newlyUnlocked.push({ npcId, npc });
                    }
                }
            }
            return newlyUnlocked;
        },

        /**
         * 检查剧情递进解锁
         * @param {string} storyId - 剧情ID
         */
        async checkStoryUnlock(storyId) {
            const newlyUnlocked = [];
            for (const [npcId, npc] of Object.entries(this._allNPCs)) {
                if (this._unlockedNPCs[npcId]?.unlocked) continue;
                if (npc.unlock?.type === 'initial') continue;
                if (npc.unlock?.related_npc && !this._unlockedNPCs[npc.unlock.related_npc]?.unlocked) continue;

                const result = await this._doUnlock(npcId, `story:${storyId}`);
                if (result) {
                    newlyUnlocked.push({ npcId, npc });
                }
            }
            return newlyUnlocked;
        },

        /**
         * 检查公会加入解锁
         */
        async checkGuildUnlock() {
            const newlyUnlocked = [];
            for (const [npcId, npc] of Object.entries(this._allNPCs)) {
                if (this._unlockedNPCs[npcId]?.unlocked) continue;
                if (npc.unlock?.type !== 'guild_join') continue;

                const result = await this._doUnlock(npcId, 'guild_join');
                if (result) {
                    newlyUnlocked.push({ npcId, npc });
                }
            }
            return newlyUnlocked;
        },

        /**
         * 检查探索完成度解锁
         */
        async checkExplorationUnlock() {
            const stats = this._userStats;
            if (!stats) return [];

            const newlyUnlocked = [];
            for (const [npcId, npc] of Object.entries(this._allNPCs)) {
                if (this._unlockedNPCs[npcId]?.unlocked) continue;
                if (npc.unlock?.type !== 'exploration_complete') continue;

                const percentage = stats.totalLocations > 0
                    ? Math.round((stats.discoveredLocations / stats.totalLocations) * 100)
                    : 0;

                if (percentage >= npc.unlock.exploration_threshold) {
                    const result = await this._doUnlock(npcId, 'exploration_complete');
                    if (result) {
                        newlyUnlocked.push({ npcId, npc });
                    }
                }
            }
            return newlyUnlocked;
        },

        /**
         * 检查解锁条件
         */
        async _checkUnlockCondition(npc) {
            if (!npc.unlock) return true;
            if (npc.unlock.type === 'initial') return true;

            // 检查前置NPC是否已解锁
            if (npc.unlock.related_npc) {
                if (!this._unlockedNPCs[npc.unlock.related_npc]?.unlocked) {
                    return false;
                }
            }

            // 按类型检查
            switch (npc.unlock.type) {
                case 'task_complete':
                    return (this._userStats?.completedTasks || 0) >= (npc.unlock.task_unlock_threshold || 0);

                case 'achievement':
                    const achievements = this._userStats?.achievements || {};
                    return achievements[npc.unlock.achievement_id]?.status === 'unlocked';

                case 'level':
                    return (this._userStats?.level || 1) >= (npc.unlock.level_required || 1);

                case 'ar_scan':
                case 'guild_join':
                case 'exploration_complete':
                    return true; // 这些由专门的检查函数处理

                default:
                    return true;
            }
        },

        // ============================================
        // 好感度系统
        // ============================================

        /**
         * 增加好感度
         * @param {string} npcId - NPC ID
         * @param {number} amount - 增加量
         * @param {string} reason - 原因标识
         */
        addAffection(npcId, amount, reason) {
            if (!this._unlockedNPCs[npcId]?.unlocked) return null;
            if (typeof amount !== 'number' || isNaN(amount)) {
                console.warn(`[NPCEcosystem] 无效的好感度增加量: ${amount}`);
                return null;
            }

            const npc = this._allNPCs[npcId];
            if (!npc) return null;

            const rel = this._relations[npcId] || {};
            const oldAffection = rel.affection || 0;
            const oldLevel = this._getAffectionLevel(npcId);

            rel.affection = Math.min(rel.max_affection, Math.max(0, rel.affection + amount));
            rel.lastActive = Date.now();

            this._relations[npcId] = rel;
            this._saveLocalData();

            const newLevel = this._getAffectionLevel(npcId);

            // 触发等级提升事件
            if (newLevel > oldLevel) {
                if (window.EventBus) {
                    EventBus.emit('npc:affection_level_up', {
                        npcId,
                        npc,
                        oldLevel,
                        newLevel,
                        rank: npc.affection.ranks[newLevel]
                    });
                }
                console.log(`[NPCEcosystem] NPC ${npc.name} 好感度等级提升: ${oldLevel} -> ${newLevel}`);
            }

            // 触发好感度变化事件
            if (window.EventBus) {
                EventBus.emit('npc:affection_changed', {
                    npcId,
                    npc,
                    oldAffection,
                    newAffection: rel.affection,
                    change: amount,
                    reason
                });
            }

            return rel;
        },

        /**
         * 获取好感度等级（0-5）
         */
        _getAffectionLevel(npcId) {
            const npc = this._allNPCs[npcId];
            const rel = this._relations[npcId];
            if (!npc?.affection?.ranks || !rel) return 0;

            const affection = rel.affection || 0;
            const ranks = npc.affection.ranks;
            
            for (let i = ranks.length - 1; i >= 0; i--) {
                if (affection >= ranks[i].threshold) {
                    return ranks[i].level;
                }
            }
            return 0;
        },

        /**
         * 获取好感度信息
         */
        getAffectionInfo(npcId) {
            const npc = this._allNPCs[npcId];
            const rel = this._relations[npcId];
            if (!npc?.affection || !rel) return null;

            const level = this._getAffectionLevel(npcId);
            const currentRank = npc.affection.ranks.find(r => r.level === level) || npc.affection.ranks[0];
            const nextRank = npc.affection.ranks.find(r => r.level === level + 1);
            
            const progress = nextRank
                ? (rel.affection - currentRank.threshold) / (nextRank.threshold - currentRank.threshold)
                : 1;

            return {
                affection: rel.affection,
                maxAffection: rel.max_affection,
                level,
                rank: currentRank,
                nextRank,
                progress: Math.min(1, Math.max(0, progress)),
                percentage: Math.round((rel.affection / rel.max_affection) * 100)
            };
        },

        /**
         * 获取指定等级对应的奖励
         */
        getAffectionReward(npcId, level) {
            const npc = this._allNPCs[npcId];
            if (!npc?.affection?.ranks) return null;
            return npc.affection.ranks.find(r => r.level === level)?.reward || null;
        },

        /**
         * 处理每日好感度衰减
         */
        async processDailyDecay() {
            const now = Date.now();
            const DAY = 24 * 60 * 60 * 1000;

            for (const [npcId, rel] of Object.entries(this._relations)) {
                const npc = this._allNPCs[npcId];
                if (!npc?.affection?.decay?.enabled) continue;
                if (!this._unlockedNPCs[npcId]?.unlocked) continue;

                const decay = npc.affection.decay;
                const lastActive = rel.lastActive || 0;
                const daysInactive = Math.floor((now - lastActive) / DAY);

                if (daysInactive >= decay.days) {
                    const decayed = Math.floor(daysInactive / decay.days) * Math.abs(decay.amount);
                    if (decayed > 0) {
                        rel.affection = Math.max(0, rel.affection - decayed);
                        this._relations[npcId] = rel;
                        console.log(`[NPCEcosystem] NPC ${npc.name} 好感度衰减: -${decayed}`);
                    }
                }
            }

            this._saveLocalData();
        },

        // ============================================
        // 对话系统
        // ============================================

        /**
         * 获取NPC对话内容（基础对话，不调用AI）
         */
        getDialogue(npcId, context) {
            const npc = this._allNPCs[npcId];
            if (!npc) return null;

            const relation = this._relations[npcId];
            const affection = relation?.affection || 0;
            const level = this._getAffectionLevel(npcId);

            // 根据好感度选择对话分支
            let branchKey = 'low_affection';
            if (affection >= 280) {
                branchKey = 'high_affection';
            } else if (affection >= 150) {
                branchKey = 'mid_affection';
            }

            const dialogues = npc.dialogues?.branches?.[branchKey] || [];
            if (dialogues.length === 0) {
                return { text: npc.default_greeting || npc.greeting_placeholder || '你好！' };
            }

            const randomIndex = Math.floor(Math.random() * dialogues.length);
            return {
                text: dialogues[randomIndex],
                branch: branchKey,
                level,
                npc
            };
        },

        /**
         * 获取NPC打招呼内容
         */
        getGreeting(npcId) {
            const npc = this._allNPCs[npcId];
            if (!npc) return null;

            const relation = this._relations[npcId];
            const affection = relation?.affection || 0;
            const level = this._getAffectionLevel(npcId);

            // 高好感度返回更热情的问候
            if (affection >= 280) {
                return {
                    text: `见到你真高兴！${npc.greeting_placeholder}`,
                    style: 'warm'
                };
            } else if (affection >= 150) {
                return {
                    text: `${npc.greeting_placeholder}`,
                    style: 'friendly'
                };
            }
            return {
                text: npc.default_greeting,
                style: 'normal'
            };
        },

        /**
         * 添加对话到历史
         */
        addToHistory(npcId, text, role) {
            if (!this._dialogueHistory[npcId]) {
                this._dialogueHistory[npcId] = [];
            }
            const now = new Date();
            this._dialogueHistory[npcId].unshift({
                text,
                role,
                time: `${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
            });
            if (this._dialogueHistory[npcId].length > 50) {
                this._dialogueHistory[npcId].pop();
            }
            this._saveLocalData();
        },

        /**
         * 获取对话历史
         */
        getHistory(npcId) {
            return this._dialogueHistory[npcId] || [];
        },

        /**
         * 增加每日互动计数
         */
        recordDailyInteraction(npcId) {
            const today = new Date().toISOString().split('T')[0];
            if (!this._dailyInteractions[npcId]) {
                this._dailyInteractions[npcId] = {};
            }
            if (!this._dailyInteractions[npcId][today]) {
                this._dailyInteractions[npcId][today] = 0;
            }
            this._dailyInteractions[npcId][today]++;
            this._saveLocalData();

            // 检查连续互动彩蛋
            this._checkStreakEggs(npcId);
        },

        /**
         * 获取连续互动天数
         */
        getInteractionStreak(npcId) {
            const interactions = this._dailyInteractions[npcId] || {};
            const dates = Object.keys(interactions).sort().reverse();
            let streak = 0;
            const today = new Date();
            
            for (let i = 0; i < dates.length; i++) {
                const date = new Date(dates[i]);
                const expected = new Date(today);
                expected.setDate(today.getDate() - i);
                
                if (dates[i] === expected.toISOString().split('T')[0]) {
                    streak++;
                } else {
                    break;
                }
            }
            return streak;
        },

        /**
         * 检查连续互动彩蛋
         */
        _checkStreakEggs(npcId) {
            const streak = this.getInteractionStreak(npcId);
            const eggConfig = NPC_EASTER_EGGS.streak[streak];
            if (!eggConfig) return;

            // 检查是否已触发
            const eggId = `streak_${npcId}_${streak}`;
            if (this._eggTriggered[eggId]) return;

            this._eggTriggered[eggId] = Date.now();
            this._saveLocalData();

            if (window.EventBus) {
                EventBus.emit('npc:easter_egg', {
                    type: 'streak',
                    npcId,
                    npc: this._allNPCs[npcId],
                    config: eggConfig,
                    streak
                });
            }
        },

        // ============================================
        // AI对话接口
        // ============================================

        /**
         * 发起NPC AI对话
         * @param {string} npcId - NPC ID
         * @param {string} userMessage - 用户消息
         * @returns {Promise<object>} AI回复
         */
        async chat(npcId, userMessage) {
            const npc = this._allNPCs[npcId];
            if (!npc || !this._unlockedNPCs[npcId]?.unlocked) {
                throw new Error('NPC未解锁或不存在');
            }

            // 记录互动
            this.recordDailyInteraction(npcId);
            this.addToHistory(npcId, userMessage, 'user');

            // 更新最后活跃时间
            if (this._relations[npcId]) {
                this._relations[npcId].lastActive = Date.now();
            }

            try {
                // 调用后端AI对话接口
                const response = await fetch(_npcApiUrl('/api/chat'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('campus_rpg_token') || ''}`
                    },
                    body: JSON.stringify({
                        message: this._buildAIContext(npcId, userMessage),
                        npc_id: npcId,
                        history: this._historyForAPI(npcId)
                    })
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const data = await response.json();
                this.addToHistory(npcId, data.reply || data.content || '', 'ai');

                // 增加好感度
                const gainConditions = npc.affection?.gain_conditions || [];
                const chatCondition = gainConditions.find(c => c.action === 'npc_chat');
                if (chatCondition) {
                    this.addAffection(npcId, chatCondition.factor, 'npc_chat');
                }

                return data;
            } catch (err) {
                console.warn('[NPCEcosystem] AI对话失败，使用离线回复:', err);
                // 使用离线回复
                const offlineReply = this.getDialogue(npcId, { type: 'offline' });
                this.addToHistory(npcId, offlineReply.text, 'ai');
                return { reply: offlineReply.text, offline: true };
            }
        },

        /**
         * 构建AI上下文
         */
        _buildAIContext(npcId, userMessage) {
            const npc = this._allNPCs[npcId];
            const info = this.getAffectionInfo(npcId);
            const user = StateManager?.get('user') || {};
            const role = user.role || {};

            const systemPrompt = `你是「${npc.name}」，${npc.title}。
${npc.bio}
性格特点：${npc.personality}
专业领域：${(npc.expertise || []).join('、')}

当前与用户的关系等级：${info?.rank?.label || '陌生'}（好感度 ${info?.affection || 0}/${info?.maxAffection || 500}）
解锁的功能：${info?.level >= 1 ? '基础对话' : ''} ${info?.level >= 2 ? '、学习攻略' : ''} ${info?.level >= 3 ? '、隐藏剧情' : ''} ${info?.level >= 4 ? '、专属任务' : ''} ${info?.level >= 5 ? '、全量剧情' : ''}

请用符合角色性格的语气回复用户。回复应该：
1. 贴合校园学习成长场景
2. 积极正向，鼓励用户
3. 根据好感度等级调整亲密度
4. 适当使用Emoji增加趣味性
5. 可以发布与用户学业相关的小任务

用户消息：${userMessage}`;

            return systemPrompt + '\n\n用户消息：' + userMessage;
        },

        /**
         * 转换历史记录为API格式
         */
        _historyForAPI(npcId) {
            const history = this.getHistory(npcId);
            return [...history].reverse().slice(-10).map(h => ({
                role: h.role === 'ai' ? 'assistant' : 'user',
                content: h.text || ''
            })).filter(m => m.content);
        },

        // ============================================
        // 事件监听
        // ============================================
        _bindEvents() {
            if (!window.EventBus) return;

            // 任务完成
            EventBus.on('task:completed', async (task) => {
                // 增加好感度
                for (const npcId of Object.keys(this._unlockedNPCs)) {
                    const npc = this._allNPCs[npcId];
                    if (!npc?.affection?.gain_conditions) continue;
                    const cond = npc.affection.gain_conditions.find(c => c.action === 'complete_task');
                    if (cond) {
                        this.addAffection(npcId, cond.factor, 'complete_task:' + task?.id);
                    }
                }
                // 检查任务解锁
                const newlyUnlocked = await this.checkTaskUnlock(task);
                for (const { npcId, npc } of newlyUnlocked) {
                    this._showUnlockNotification(npcId, npc);
                }
            });

            // 成就解锁
            EventBus.on('achievement:unlocked', async (achievement) => {
                const newlyUnlocked = await this.checkAchievementUnlock(achievement?.id);
                for (const { npcId, npc } of newlyUnlocked) {
                    this._showUnlockNotification(npcId, npc);
                }
            });

            // 等级提升
            EventBus.on('role:level_up', (data) => {
                // 检查等级解锁
                this._checkLevelUnlocks(data?.level);
            });

            // 签到完成
            EventBus.on('signin:complete', () => {
                for (const npcId of Object.keys(this._unlockedNPCs)) {
                    const npc = this._allNPCs[npcId];
                    if (!npc?.affection?.gain_conditions) continue;
                    const cond = npc.affection.gain_conditions.find(c => c.action === 'daily_signin');
                    if (cond) {
                        this.addAffection(npcId, cond.factor, 'daily_signin');
                    }
                }
            });

            // 探索发现
            EventBus.on('exploration:location_discovered', async () => {
                this._updateUserStats();
                const newlyUnlocked = await this.checkExplorationUnlock();
                for (const { npcId, npc } of newlyUnlocked) {
                    this._showUnlockNotification(npcId, npc);
                }
            });

            // 考试通过
            EventBus.on('exam:passed', (exam) => {
                for (const npcId of Object.keys(this._unlockedNPCs)) {
                    const npc = this._allNPCs[npcId];
                    if (!npc?.affection?.gain_conditions) continue;
                    const cond = npc.affection.gain_conditions.find(c => c.action === 'exam_pass');
                    if (cond) {
                        this.addAffection(npcId, cond.factor, 'exam_pass:' + (exam?.name || 'unknown'));
                    }
                }
            });

            // 每日衰减
            EventBus.on('app:daily_reset', () => {
                this.processDailyDecay();
            });
        },

        /**
         * 检查等级解锁
         */
        async _checkLevelUnlocks(level) {
            const newlyUnlocked = [];
            for (const [npcId, npc] of Object.entries(this._allNPCs)) {
                if (this._unlockedNPCs[npcId]?.unlocked) continue;
                if (npc.unlock?.type !== 'level') continue;
                if ((level || 1) >= (npc.unlock.level_required || 1)) {
                    const result = await this._doUnlock(npcId, `level:${level}`);
                    if (result) {
                        newlyUnlocked.push({ npcId, npc });
                    }
                }
            }
            for (const { npcId, npc } of newlyUnlocked) {
                this._showUnlockNotification(npcId, npc);
            }
        },

        /**
         * 显示解锁通知
         */
        _showUnlockNotification(npcId, npc) {
            if (window.showNotification) {
                showNotification(`🎉 解锁新NPC：${npc.name}！`, 'success');
            }
            if (window.EventBus) {
                EventBus.emit('npc:unlock_notification', { npcId, npc });
            }
        },

        // ============================================
        // 公开API
        // ============================================

        /**
         * 获取所有NPC列表
         */
        getAllNPCs() {
            return this._allNPCs;
        },

        /**
         * 获取已解锁NPC列表
         */
        getUnlockedNPCs() {
            const result = {};
            for (const [npcId, data] of Object.entries(this._unlockedNPCs)) {
                if (data.unlocked && this._allNPCs[npcId]) {
                    result[npcId] = this._allNPCs[npcId];
                }
            }
            return result;
        },

        /**
         * 获取未解锁NPC列表（包含解锁条件）
         */
        getLockedNPCs() {
            const result = {};
            for (const [npcId, npc] of Object.entries(this._allNPCs)) {
                if (!this._unlockedNPCs[npcId]?.unlocked) {
                    result[npcId] = {
                        ...npc,
                        unlock_hint: this._getUnlockHint(npc),
                        canUnlock: this._checkCanUnlock(npc)
                    };
                }
            }
            return result;
        },

        /**
         * 获取解锁提示文本
         */
        _getUnlockHint(npc) {
            if (!npc.unlock) return '未知解锁条件';
            switch (npc.unlock.type) {
                case 'initial': return '初始解锁';
                case 'task_complete': return `完成${npc.unlock.task_unlock_threshold || 0}个任务`;
                case 'ar_scan': return npc.unlock.condition || 'AR扫描解锁';
                case 'achievement': return `解锁「${npc.unlock.achievement_id}」成就`;
                case 'level': return `达到Lv.${npc.unlock.level_required || 1}`;
                case 'guild_join': return '加入公会';
                case 'exploration_complete': return `AR探索${npc.unlock.exploration_threshold || 100}%`;
                default: return npc.unlock.condition || '未知条件';
            }
        },

        /**
         * 检查当前是否可解锁
         */
        _checkCanUnlock(npc) {
            if (!npc.unlock) return false;
            if (npc.unlock.type === 'initial') return true;
            if (npc.unlock.related_npc && !this._unlockedNPCs[npc.unlock.related_npc]?.unlocked) {
                return false;
            }
            switch (npc.unlock.type) {
                case 'task_complete':
                    return (this._userStats?.completedTasks || 0) >= (npc.unlock.task_unlock_threshold || 0);
                case 'ar_scan':
                case 'guild_join':
                case 'exploration_complete':
                    return false; // 需要特定操作触发
                default:
                    return false;
            }
        },

        /**
         * 获取单个NPC完整信息
         */
        getNPC(npcId) {
            const npc = this._allNPCs[npcId];
            if (!npc) return null;
            return {
                ...npc,
                isUnlocked: !!this._unlockedNPCs[npcId]?.unlocked,
                relation: this._relations[npcId] || null,
                affectionInfo: this.getAffectionInfo(npcId),
                greeting: this.getGreeting(npcId),
                history: this.getHistory(npcId)
            };
        },

        /**
         * 获取NPC任务列表
         */
        getNPCTasks(npcId) {
            const npc = this._allNPCs[npcId];
            if (!npc?.tasks?.task_templates) return [];
            return npc.tasks.task_templates;
        },

        /**
         * 获取NPC推荐对话
         */
        getSuggestedDialogues(npcId) {
            const npc = this._allNPCs[npcId];
            if (!npc) return [];
            
            const info = this.getAffectionInfo(npcId);
            const level = info?.level || 0;

            const suggestions = [];

            // 基础问题
            suggestions.push({ text: '有什么学习建议给我吗？', icon: '💡' });
            suggestions.push({ text: '最近有什么任务吗？', icon: '📋' });

            // 根据好感度添加更多选项
            if (level >= 1) {
                suggestions.push({ text: '有什么校园趣事吗？', icon: '😊' });
            }
            if (level >= 2) {
                suggestions.push({ text: '能分享一些经验吗？', icon: '📖' });
            }
            if (level >= 3) {
                suggestions.push({ text: '有什么隐藏剧情吗？', icon: '🔮' });
            }
            if (level >= 4) {
                suggestions.push({ text: '能给我布置专属任务吗？', icon: '⚔️' });
            }

            return suggestions.slice(0, 4);
        },

        /**
         * 获取分类NPC
         */
        getNPCsByCategory(category) {
            const data = NPC_ECOSYSTEM_DATA[category];
            if (!data?.npcs) return {};

            const result = {};
            for (const [id, npc] of Object.entries(data.npcs)) {
                result[id] = {
                    ...npc,
                    isUnlocked: !!this._unlockedNPCs[id]?.unlocked,
                    relation: this._relations[id] || null
                };
            }
            return result;
        },

        /**
         * 获取解锁进度统计
         */
        getUnlockProgress() {
            const total = Object.keys(this._allNPCs).length;
            const unlocked = Object.values(this._unlockedNPCs).filter(d => d.unlocked).length;
            const byCategory = {};

            for (const [categoryKey, categoryData] of Object.entries(NPC_ECOSYSTEM_DATA)) {
                if (categoryData.npcs) {
                    const catTotal = Object.keys(categoryData.npcs).length;
                    const catUnlocked = Object.keys(categoryData.npcs).filter(
                        id => this._unlockedNPCs[id]?.unlocked
                    ).length;
                    byCategory[categoryKey] = {
                        name: categoryData.category,
                        icon: categoryData.category_icon,
                        total: catTotal,
                        unlocked: catUnlocked
                    };
                }
            }

            return {
                total,
                unlocked,
                percentage: total > 0 ? Math.round((unlocked / total) * 100) : 0,
                byCategory
            };
        },

        /**
         * 检查并触发时间彩蛋
         */
        checkTimeEggs() {
            const now = new Date();
            const hour = now.getHours();
            const dayOfWeek = now.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            // 检查时间专属彩蛋
            const timeEggs = NPC_EASTER_EGGS.time;

            // 早自习时段
            if (hour >= 7 && hour < 8) {
                this._triggerTimeEgg(timeEggs.morning, 'morning');
            }

            // 深夜时段
            if (hour >= 22 || hour < 6) {
                this._triggerTimeEgg(timeEggs.late_night, 'late_night');
            }

            // 周末
            if (isWeekend && hour >= 9 && hour < 12) {
                this._triggerTimeEgg(timeEggs.weekend, 'weekend');
            }

            // 考试周检测（简化版：期末前后）
            // TODO: 从后端获取考试周数据
        },

        /**
         * 触发时间彩蛋
         */
        _triggerTimeEgg(config, type) {
            if (!config) return;
            const eggId = `time_${type}_${new Date().toISOString().split('T')[0]}`;
            if (this._eggTriggered[eggId]) return;

            this._eggTriggered[eggId] = Date.now();
            this._saveLocalData();

            if (window.EventBus) {
                EventBus.emit('npc:easter_egg', {
                    type: 'time',
                    npcId: config.npc,
                    config,
                    action: config.action
                });
            }
        },

        /**
         * 触发成就彩蛋
         */
        triggerAchievementEgg(achievementId) {
            const eggs = NPC_EASTER_EGGS.achievement || [];
            const egg = eggs.find(e => e.trigger === achievementId);
            if (!egg) return;
            if (this._eggTriggered[egg.id]) return;

            this._eggTriggered[egg.id] = Date.now();
            this._saveLocalData();

            if (window.EventBus) {
                EventBus.emit('npc:easter_egg', {
                    type: 'achievement',
                    npcId: egg.npc === 'all' ? null : egg.npc,
                    config: egg,
                    allNpcBlessing: egg.all_npc_blessing
                });
            }
        },

        /**
         * 触发角落探索彩蛋
         */
        triggerCornerEgg(triggerId) {
            const eggs = NPC_EASTER_EGGS.corner || [];
            const egg = eggs.find(e => e.trigger === triggerId);
            if (!egg) return;
            if (this._eggTriggered[egg.id]) return;

            this._eggTriggered[egg.id] = Date.now();
            this._saveLocalData();

            if (window.EventBus) {
                EventBus.emit('npc:easter_egg', {
                    type: 'corner',
                    npcId: egg.npc,
                    config: egg,
                    action: egg.action
                });
            }
        },

        /**
         * XSS防护
         */
        _escapeHtml(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }
    };

    // 导出到全局
    window.NPCEcosystem = NPCEcosystem;

})();
