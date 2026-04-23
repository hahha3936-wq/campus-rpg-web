/**
 * 校园RPG - API调用模块
 * 处理前后端数据交互
 */

function resolveApiUrl(url) {
    if (typeof window !== 'undefined' && typeof window.apiUrl === 'function') {
        return window.apiUrl(url);
    }
    return url;
}

// ============================================
// 通用请求封装：自动附加 JWT token
// ============================================
async function apiRequest(url, options = {}) {
    const token = localStorage.getItem('campus_rpg_token');
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const resp = await fetch(resolveApiUrl(url), { ...options, headers });
    return resp;
}

// 专门用于需要认证的请求：401 时清除 token 并抛出错误供调用方处理
async function authedRequest(url, options = {}) {
    const resp = await apiRequest(url, options);
    if (resp.status === 401) {
        // token 过期或无效，清除本地登录状态
        localStorage.removeItem('campus_rpg_token');
        localStorage.removeItem('campus_rpg_user');
        throw new Error('登录已过期，请重新登录');
    }
    return resp;
}

// ============================================
// 静默请求（无 token，适合公开数据）
// ============================================
async function publicRequest(url, options = {}) {
    const resp = await fetch(resolveApiUrl(url), { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    return resp;
}

// API服务对象
const API = {
    // ============================================
    // 用户数据（需要认证）
    // ============================================
    
    async getUser() {
        try {
            // 先检查API是否可用
            const isOnline = await APIHealth.check();
            if (!isOnline) {
                console.info('[API] 后端离线，使用本地数据');
                return null;
            }

            const resp = await apiRequest('/api/user');
            if (!resp.ok) return null;
            const data = await resp.json();
            if (data && data.error && !data.user) return null;
            return data;
        } catch (error) {
            console.warn('API调用失败，使用本地数据:', error);
            return null;
        }
    },
    
    async updateUser(data) {
        try {
            const resp = await apiRequest('/api/user', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async updateStats(stats) {
        try {
            const resp = await apiRequest('/api/user/stats', {
                method: 'POST',
                body: JSON.stringify(stats)
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async addExperience(amount) {
        try {
            const resp = await apiRequest('/api/user/experience', {
                method: 'POST',
                body: JSON.stringify({ amount })
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async updateNPCAffection(npcId, amount) {
        try {
            const resp = await apiRequest(`/api/user/npc/${npcId}/affection`, {
                method: 'POST',
                body: JSON.stringify({ amount })
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async useInventoryItem(itemName) {
        try {
            const resp = await apiRequest(`/api/user/inventory/${encodeURIComponent(itemName)}`, {
                method: 'POST'
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    // ============================================
    // 每日签到（需要认证）
    // ============================================

    async getSigninStatus() {
        try {
            const resp = await apiRequest('/api/signin');
            if (!resp.ok) return null;
            return await resp.json();
        } catch (error) {
            console.warn('签到状态获取失败:', error);
            return null;
        }
    },

    async doSignin() {
        try {
            const resp = await apiRequest('/api/signin', { method: 'POST' });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('签到失败:', error);
            return { success: false, error: '网络错误' };
        }
    },

    // ============================================
    // 番茄钟统计（需要认证）
    // ============================================

    async getPomodoroStats() {
        try {
            const resp = await apiRequest('/api/pomodoro/stats');
            if (!resp.ok) return { total_sessions: 0, total_minutes: 0, total_focus_score: 0, records: {} };
            return await resp.json();
        } catch (error) {
            return { total_sessions: 0, total_minutes: 0, total_focus_score: 0, records: {} };
        }
    },

    async recordPomodoroSession(minutes, completed, taskId) {
        try {
            const resp = await apiRequest('/api/pomodoro/session', {
                method: 'POST',
                body: JSON.stringify({ minutes, completed, task_id: taskId || '' })
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            return { success: false };
        }
    },

    // ============================================
    // 任务数据（需要认证）
    // ============================================
    
    async getTasks() {
        try {
            const isOnline = await APIHealth.check();
            if (!isOnline) {
                console.info('[API] 后端离线，任务数据将使用本地缓存');
                return null;
            }

            const resp = await apiRequest('/api/tasks');
            if (!resp.ok) return null;
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败，使用本地数据:', error);
            return null;
        }
    },
    
    async updateTasks(data) {
        try {
            const resp = await apiRequest('/api/tasks', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async completeSubtask(taskId, subtaskId) {
        try {
            const resp = await apiRequest(`/api/tasks/${taskId}/subtask/${subtaskId}`, { method: 'POST' });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async updateTaskProgress(taskId, amount) {
        try {
            const resp = await apiRequest(`/api/tasks/${taskId}/progress`, {
                method: 'POST',
                body: JSON.stringify({ amount })
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },

    async syncCompletionRate(completionRate) {
        try {
            const resp = await apiRequest('/api/user/completion-rate', {
                method: 'POST',
                body: JSON.stringify({ completion_rate: completionRate })
            });
            if (!resp.ok) return { success: false };
            return await resp.json();
        } catch (error) {
            console.warn('完成率同步失败:', error);
            return { success: false };
        }
    },
    
    // ============================================
    // 成就数据（需要认证）
    // ============================================
    
    async getAchievements() {
        try {
            const isOnline = await APIHealth.check();
            if (!isOnline) {
                console.info('[API] 后端离线，成就数据将使用本地缓存');
                return null;
            }

            const resp = await apiRequest('/api/achievements');
            if (!resp.ok) return null;
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败，使用本地数据:', error);
            return null;
        }
    },
    
    async updateAchievements(data) {
        try {
            const resp = await apiRequest('/api/achievements', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async unlockAchievement(category, achievementId) {
        try {
            const resp = await apiRequest(`/api/achievements/${encodeURIComponent(category)}/${encodeURIComponent(achievementId)}`, { method: 'POST' });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async updateAchievementProgress(category, achievementId, increment = 1) {
        try {
            const resp = await apiRequest(`/api/achievements/${encodeURIComponent(category)}/${encodeURIComponent(achievementId)}/progress`, {
                method: 'POST',
                body: JSON.stringify({ increment })
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    // ============================================
    // 随机事件（需要认证）
    // ============================================
    
    async getRandomEvent() {
        try {
            const resp = await apiRequest('/api/random-event');
            if (!resp.ok) return null;
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return null;
        }
    },
    
    async applyRandomEvent(event) {
        try {
            const resp = await apiRequest('/api/random-event/apply', {
                method: 'POST',
                body: JSON.stringify({ event })
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    // ============================================
    // NPC对话（需要认证）
    // ============================================
    
    async getNPCDialogues() {
        try {
            const resp = await apiRequest('/api/npc/dialogues');
            if (!resp.ok) return null;
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return null;
        }
    },
    
    async getRandomDialogue(npcId) {
        try {
            const resp = await apiRequest(`/api/npc/${npcId}/dialogue`);
            if (!resp.ok) return null;
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return null;
        }
    },

    // ============================================
    // 校园探索（需要认证）
    // ============================================

    async getAllLocations() {
        try {
            const resp = await apiRequest('/api/exploration/locations');
            if (!resp.ok) return null;
            return await resp.json();
        } catch (error) {
            console.warn('获取地点失败:', error);
            return null;
        }
    },

    async discoverLocation(locationId) {
        try {
            const resp = await apiRequest('/api/exploration/discover', {
                method: 'POST',
                body: JSON.stringify({ location_id: locationId })
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('探索失败:', error);
            return { success: false, error: '网络错误' };
        }
    },

    async getExplorationStats() {
        try {
            const resp = await apiRequest('/api/exploration/stats');
            if (!resp.ok) return null;
            return await resp.json();
        } catch (error) {
            return null;
        }
    },

    async activateBuff(locationId) {
        try {
            const resp = await apiRequest('/api/exploration/buff', {
                method: 'POST',
                body: JSON.stringify({ location_id: locationId })
            });
            if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
            return await resp.json();
        } catch (error) {
            console.warn('激活Buff失败:', error);
            return { success: false };
        }
    },

    async getExplorationChatContext() {
        try {
            const resp = await apiRequest('/api/exploration/chat-context', { method: 'POST' });
            if (!resp.ok) return null;
            return await resp.json();
        } catch (error) {
            return null;
        }
    },

    // ============================================
    // 用户资料与目标计划（需要认证）
    // ============================================

    /**
     * 更新用户个人资料和目标计划
     */
    async updateUserProfile(data) {
        try {
            const resp = await authedRequest('/api/user/profile', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            const result = await resp.json();
            if (!resp.ok) {
                return { success: false, error: result.error || `HTTP ${resp.status}` };
            }
            return result;
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * 获取 AI 推荐的任务列表（最近一次推荐结果）
     */
    async getRecommendedTasks() {
        try {
            const resp = await apiRequest('/api/tasks/recommended');
            if (!resp.ok) return { tasks: [], recommended_at: '' };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { tasks: [], recommended_at: '' };
        }
    },

    // ============================================
    // AI 个性化任务生成（需要认证）
    // ============================================

    /**
     * 调用 AI 生成个性化任务
     * 基于用户画像（年级、专业、完成率等）生成贴合用户的任务
     * @returns {Object} { success, task, themes, selected_theme, message }
     */
    async generateAITask() {
        try {
            const resp = await apiRequest('/api/ai/task/generate', {
                method: 'POST'
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: '请求失败' }));
                return { success: false, error: err.error || `HTTP ${resp.status}` };
            }
            return await resp.json();
        } catch (error) {
            console.warn('AI任务生成失败:', error);
            return { success: false, error: '网络错误，请检查连接' };
        }
    },

    // ============================================
    // 健康检查（公开）
    // ============================================

    async healthCheck() {
        try {
            const resp = await publicRequest('/api/health');
            if (!resp.ok) return { status: 'offline' };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { status: 'offline' };
        }
    }
};

// 导出API模块
window.API = API;

// API中间件 - 带本地回退的调用
const APIWithFallback = {
    /**
     * 尝试使用API，失败时使用本地数据
     */
    async call(apiMethod, localData, fallbackData = null) {
        try {
            const result = await apiMethod();
            if (result) {
                return { success: true, data: result, source: 'api' };
            }
        } catch (e) {
            console.warn('API调用失败');
        }
        
        // 回退到本地数据
        return { 
            success: true, 
            data: localData || fallbackData, 
            source: 'local' 
        };
    },
    
    /**
     * 保存数据到API或本地存储
     */
    async save(saveMethod, localStorageKey, data) {
        // 优先保存到API
        const result = await saveMethod(data);
        
        // 同时保存到本地存储作为备份
        try {
            localStorage.setItem(localStorageKey, JSON.stringify(data));
        } catch (e) {
            console.warn('本地存储保存失败');
        }
        
        return result;
    }
};

// 导出
window.APIWithFallback = APIWithFallback;

// ============================================
// API 可用性检测模块
// ============================================
const APIHealth = {
    _isOnline: null,
    _lastCheck: 0,
    _checkInterval: 30000, // 30秒检查一次
    _listeners: [],

    /**
     * 检测 API 是否可用
     */
    async check() {
        const now = Date.now();
        // 30秒内不重复检查
        if (this._isOnline !== null && (now - this._lastCheck) < this._checkInterval) {
            return this._isOnline;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const resp = await fetch(resolveApiUrl('/api/health'), {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            this._isOnline = resp.ok;
            this._lastCheck = now;
        } catch (error) {
            this._isOnline = false;
            this._lastCheck = now;
        }

        return this._isOnline;
    },

    /**
     * 获取当前在线状态（不发起请求）
     */
    isOnline() {
        return this._isOnline !== false;
    },

    /**
     * 获取当前离线状态（不发起请求）
     */
    isOffline() {
        return this._isOnline === false;
    },

    /**
     * 添加状态变化监听器
     */
    addListener(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(cb => cb !== callback);
        };
    },

    /**
     * 通知所有监听器状态变化
     */
    _notifyListeners(isOnline) {
        this._listeners.forEach(cb => {
            try {
                cb(isOnline);
            } catch (e) {
                console.warn('[APIHealth] 监听器执行错误:', e);
            }
        });
    },

    /**
     * 初始化：绑定网络事件监听
     */
    init() {
        // 绑定浏览器网络事件
        window.addEventListener('online', () => {
            this.check().then(isOnline => {
                if (isOnline) {
                    this._notifyListeners(true);
                }
            });
        });

        window.addEventListener('offline', () => {
            this._isOnline = false;
            this._notifyListeners(false);
        });

        // 立即检测一次
        this.check();
    }
};

// 启动自动检测
APIHealth.init();

// 导出
window.APIHealth = APIHealth;

