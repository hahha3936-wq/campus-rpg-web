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
            return await resp.json();
        } catch (error) {
            console.warn('签到状态获取失败:', error);
            return null;
        }
    },

    async doSignin() {
        try {
            const resp = await apiRequest('/api/signin', { method: 'POST' });
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
            const resp = await apiRequest('/api/tasks');
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
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async completeSubtask(taskId, subtaskId) {
        try {
            const resp = await apiRequest(`/api/tasks/${taskId}/subtask/${subtaskId}`, { method: 'POST' });
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
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    // ============================================
    // 成就数据（需要认证）
    // ============================================
    
    async getAchievements() {
        try {
            const resp = await apiRequest('/api/achievements');
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
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },
    
    async unlockAchievement(category, achievementId) {
        try {
            const resp = await apiRequest(`/api/achievements/${encodeURIComponent(category)}/${encodeURIComponent(achievementId)}`, { method: 'POST' });
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
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return null;
        }
    },
    
    async getRandomDialogue(npcId) {
        try {
            const resp = await apiRequest(`/api/npc/${npcId}/dialogue`);
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
            return await resp.json();
        } catch (error) {
            console.warn('探索失败:', error);
            return { success: false, error: '网络错误' };
        }
    },

    async getExplorationStats() {
        try {
            const resp = await apiRequest('/api/exploration/stats');
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
            return await resp.json();
        } catch (error) {
            console.warn('激活Buff失败:', error);
            return { success: false };
        }
    },

    async getExplorationChatContext() {
        try {
            const resp = await apiRequest('/api/exploration/chat-context', { method: 'POST' });
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
            const resp = await apiRequest('/api/user/profile', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (!resp.ok) return { success: false };
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { success: false };
        }
    },

    /**
     * 获取 AI 推荐的任务列表（最近一次推荐结果）
     */
    async getRecommendedTasks() {
        try {
            const resp = await apiRequest('/api/tasks/recommended');
            return await resp.json();
        } catch (error) {
            console.warn('API调用失败:', error);
            return { tasks: [], recommended_at: '' };
        }
    },

    // ============================================
    // 健康检查（公开）
    // ============================================

    async healthCheck() {
        try {
            const resp = await publicRequest('/api/health');
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
