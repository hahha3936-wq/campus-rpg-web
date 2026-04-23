/**
 * 校园RPG - AR系统集成模块
 * 对接后端API、用户/任务/成就/农场/DeepSeek
 * @version 1.0.0
 */

var ARIntegration = (function () {
    'use strict';

    // ============================================
    // 内部状态
    // ============================================
    var _pendingQueue = [];  // 离线队列
    var _syncing = false;

    // ============================================
    // 工具函数
    // ============================================
    function apiPath(path) {
        return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
    }

    function getToken() {
        return localStorage.getItem('campus_rpg_token');
    }

    function authHeaders(extra) {
        var headers = { 'Content-Type': 'application/json' };
        var token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        if (extra) Object.assign(headers, extra);
        return headers;
    }

    async function safePost(url, body) {
        try {
            var resp = await fetch(apiPath(url), {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(body)
            });
            if (resp.status === 401) {
                document.dispatchEvent(new CustomEvent('ar-auth-error'));
                return null;
            }
            return resp.ok ? await resp.json() : null;
        } catch (e) {
            return null;
        }
    }

    async function safeGet(url) {
        try {
            var resp = await fetch(apiPath(url), {
                headers: authHeaders()
            });
            return resp.ok ? await resp.json() : null;
        } catch (e) {
            return null;
        }
    }

    // ============================================
    // 模块1: 用户系统对接
    // ============================================

    /**
     * 获取当前用户信息
     */
    async function getUserInfo() {
        var data = await safeGet('/api/ar/markers');
        return data;
    }

    /**
     * 解锁标记并发放奖励（调用后端接口）
     */
    async function unlockMarkerReward(markerId) {
        var result = await safePost('/api/ar/marker/unlock', { marker_id: markerId });
        if (!result) {
            // 离线：暂存到队列
            _queueOfflineAction({ type: 'marker_unlock', marker_id: markerId, timestamp: Date.now() });
            return null;
        }

        if (result.success && result.reward) {
            await _applyRewards(result.reward);
        }
        return result;
    }

    /**
     * 应用奖励到本地状态（同步到现有系统）
     */
    async function _applyRewards(reward) {
        // 金币
        if (reward.gold && typeof AppState !== 'undefined') {
            var user = AppState.user;
            if (user && user.role) {
                user.role.gold = (user.role.gold || 0) + reward.gold;
                AppState.user = user;
                document.dispatchEvent(new CustomEvent('ar-reward-applied', { detail: { type: 'gold', amount: reward.gold } }));
            }
        }

        // 经验
        if (reward.experience && typeof AppState !== 'undefined') {
            var user = AppState.user;
            if (user && user.role) {
                user.role.experience = (user.role.experience || 0) + reward.experience;
                AppState.user = user;
                document.dispatchEvent(new CustomEvent('ar-reward-applied', { detail: { type: 'experience', amount: reward.experience } }));
            }
        }

        // 精力
        if (reward.energy && typeof AppState !== 'undefined') {
            var user = AppState.user;
            if (user && user.stats) {
                user.stats.energy = Math.min(100, (user.stats.energy || 0) + reward.energy);
                AppState.user = user;
                document.dispatchEvent(new CustomEvent('ar-reward-applied', { detail: { type: 'energy', amount: reward.energy } }));
            }
        }

        // 种子 / 道具
        if (reward.seed && typeof AppState !== 'undefined') {
            var inv = (AppState.user && AppState.user.inventory) || [];
            var existing = inv.find(function (i) { return i.name === reward.seed; });
            if (existing) {
                existing.quantity = (existing.quantity || 1) + 1;
            } else {
                inv.push({ name: reward.seed, type: 'seed', quantity: 1 });
            }
            if (!AppState.user) AppState.user = {};
            AppState.user.inventory = inv;
            document.dispatchEvent(new CustomEvent('ar-reward-applied', { detail: { type: 'seed', item: reward.seed } }));
        }

        // 稀有道具
        if (reward.rareItem && typeof AppState !== 'undefined') {
            var inv = (AppState.user && AppState.user.inventory) || [];
            inv.push({ name: reward.rareItem, type: 'rare', quantity: 1 });
            if (!AppState.user) AppState.user = {};
            AppState.user.inventory = inv;
            document.dispatchEvent(new CustomEvent('ar-reward-applied', { detail: { type: 'rare', item: reward.rareItem } }));
        }

        // 通知游戏UI更新
        if (typeof EventBus !== 'undefined') {
            EventBus.emit('ar:reward:granted', reward);
        }
        if (typeof updateStatusDisplay === 'function') {
            updateStatusDisplay();
        }
    }

    // ============================================
    // 模块2: 任务系统对接
    // ============================================

    /**
     * 同步AR任务到用户任务列表
     */
    async function syncARTask(taskId) {
        var result = await safePost('/api/ar/task/sync', { task_id: taskId });
        if (!result || !result.success || !result.task) return null;

        var task = result.task;

        // 同步到本地 AppState.tasks
        if (typeof AppState !== 'undefined') {
            var tasks = AppState.tasks || [];
            var exists = tasks.find(function (t) { return t.id === task.id; });
            if (!exists) {
                tasks.push(task);
                AppState.tasks = tasks;
            }
        }

        // 通知任务系统更新UI
        document.dispatchEvent(new CustomEvent('ar-task-synced', { detail: { task: task } }));

        return task;
    }

    // ============================================
    // 模块3: 成就系统对接
    // ============================================

    /**
     * 更新AR成就进度
     */
    async function updateARAchievement(achievementId, progress) {
        var result = await safePost('/api/ar/achievement/update', {
            achievement_id: achievementId,
            progress: progress || 1
        });
        return result;
    }

    /**
     * 检查并解锁AR专属成就
     */
    async function checkARAchievements() {
        var markersState = await safeGet('/api/ar/markers');
        if (!markersState || !markersState.success) return;

        var unlockedCount = markersState.markers.filter(function (m) { return m.trigger_count > 0; }).length;

        // AR探索家：探索5个标记
        if (unlockedCount >= 1) {
            await updateARAchievement('ar_first', 1);
        }
        if (unlockedCount >= 5) {
            await updateARAchievement('ar_explorer', unlockedCount);
        }

        // 通知成就系统更新UI
        document.dispatchEvent(new CustomEvent('ar-achievement-updated'));
    }

    // ============================================
    // 模块4: 像素农场对接
    // ============================================

    /**
     * 添加农场道具（种子 / 知识结晶）
     */
    function addFarmItem(itemName, quantity) {
        if (typeof AppState === 'undefined') return;
        var inv = (AppState.user && AppState.user.inventory) || [];
        var existing = inv.find(function (i) { return i.name === itemName; });
        if (existing) {
            existing.quantity = (existing.quantity || 1) + (quantity || 1);
        } else {
            inv.push({ name: itemName, type: 'seed', quantity: quantity || 1 });
        }
        if (!AppState.user) AppState.user = {};
        AppState.user.inventory = inv;
        document.dispatchEvent(new CustomEvent('ar-farm-item-added', { detail: { item: itemName, quantity: quantity } }));
    }

    /**
     * 解锁农田地块
     */
    function unlockFarmPlot(plotIndex) {
        if (typeof AppState === 'undefined') return;
        var plots = AppState.farmPlots || [];
        if (!plots[plotIndex]) {
            plots[plotIndex] = { unlocked: true };
            AppState.farmPlots = plots;
            document.dispatchEvent(new CustomEvent('ar-farm-plot-unlocked', { detail: { plot: plotIndex } }));
        }
    }

    // ============================================
    // 模块5: DeepSeek智能体对接
    // ============================================

    /**
     * 生成AR专属任务（调用现有DeepSeek接口）
     */
    async function generateARTask(markerId) {
        var markerInfo = {
            'marker_002': '教学楼 - 课程学习任务',
            'marker_003': '图书馆 - 深度学习任务',
            'marker_004': '食堂 - 精力恢复任务',
            'marker_005': '公告栏 - 限时探索任务'
        };

        var prompt = '你是一个校园RPG游戏的AI助手。请根据用户扫描了"' + (markerInfo[markerId] || '校园标记') + '"的场景，生成一个具体的线下学习任务。要求：1）任务时长15-30分钟；2）具体可执行；3）符合校园RPG游戏风格；4）返回JSON格式：{"name":"任务名称","description":"任务描述","duration":分钟数}';

        try {
            var resp = await fetch(apiPath('/api/chat'), {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ message: prompt, history: [] })
            });
            if (!resp.ok) return null;
            var data = await resp.json();
            return data;
        } catch (e) {
            console.warn('[ARIntegration] DeepSeek任务生成失败:', e.message);
            return null;
        }
    }

    // ============================================
    // 模块6: 离线队列处理
    // ============================================

    /**
     * 将离线操作加入队列
     */
    function _queueOfflineAction(action) {
        _pendingQueue.push(action);
        try {
            localStorage.setItem('ar_offline_queue', JSON.stringify(_pendingQueue));
        } catch (e) {}
    }

    /**
     * 页面加载时从本地存储恢复队列
     */
    function loadOfflineQueue() {
        try {
            var stored = localStorage.getItem('ar_offline_queue');
            if (stored) _pendingQueue = JSON.parse(stored);
        } catch (e) { _pendingQueue = []; }
    }

    /**
     * 网络恢复时同步离线队列
     */
    async function syncOfflineQueue() {
        if (_syncing || !navigator.onLine || _pendingQueue.length === 0) return;
        _syncing = true;
        var queue = _pendingQueue.slice();
        _pendingQueue = [];
        try { localStorage.setItem('ar_offline_queue', '[]'); } catch (e) {}

        for (var i = 0; i < queue.length; i++) {
            var action = queue[i];
            if (action.type === 'marker_unlock') {
                await safePost('/api/ar/marker/unlock', { marker_id: action.marker_id });
            } else if (action.type === 'achievement_update') {
                await safePost('/api/ar/achievement/update', { achievement_id: action.achievement_id, progress: action.progress });
            }
        }

        _syncing = false;
        document.dispatchEvent(new CustomEvent('ar-offline-synced', { detail: { count: queue.length } }));
    }

    // ============================================
    // 行为日志
    // ============================================
    async function logBehavior(behaviorType, markerId) {
        await safePost('/api/ar/behavior/log', {
            behavior_type: behaviorType,
            marker_id: markerId || ''
        });
    }

    // ============================================
    // 初始化
    // ============================================
    function init() {
        loadOfflineQueue();
        if (navigator.onLine) {
            window.addEventListener('online', syncOfflineQueue);
        }
        document.addEventListener('ar-marker-found', function (e) {
            logBehavior('found', e.detail.marker.id);
        });
        document.addEventListener('ar-marker-lost', function (e) {
            logBehavior('lost', e.detail.markerId);
        });
        document.addEventListener('ar-marker-triggered', function (e) {
            logBehavior('triggered', e.detail.markerId);
        });
    }

    // ============================================
    // 公开 API
    // ============================================
    return {
        init: init,
        getUserInfo: getUserInfo,
        unlockMarkerReward: unlockMarkerReward,
        syncARTask: syncARTask,
        updateARAchievement: updateARAchievement,
        checkARAchievements: checkARAchievements,
        addFarmItem: addFarmItem,
        unlockFarmPlot: unlockFarmPlot,
        generateARTask: generateARTask,
        syncOfflineQueue: syncOfflineQueue,
        logBehavior: logBehavior
    };
})();

window.ARIntegration = ARIntegration;
