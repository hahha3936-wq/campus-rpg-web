/**
 * 校园RPG - 核心状态管理器
 * 统一管理全局状态、持久化和数据加载
 */

function _smApiUrl(path) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}

const StateManager = {
    // 状态缓存
    _state: {
        user: null,
        tasks: [],
        achievements: null,
        locations: [],
        settings: { sound: true, darkMode: false, animation: true },
        currentTab: 'home',
        currentTaskCategory: 'all',
        currentAchievementCategory: 'all',
        exploration: {
            discovered_locations: [],
            current_location: null,
            exploration_streak: 0,
            hidden_events_found: []
        }
    },

    // 事件监听器
    _listeners: {},

    /**
     * 获取状态
     */
    get(key) {
        if (key) {
            return key.split('.').reduce((obj, k) => obj?.[k], this._state);
        }
        return this._state;
    },

    /**
     * 设置状态（支持嵌套路径，如 'user.role.level'）
     */
    set(path, value) {
        const keys = path.split('.');
        const last = keys.pop();
        const target = keys.reduce((obj, k) => obj[k] = obj[k] || {}, this._state);
        target[last] = value;
        this._emit(path, value);
    },

    /**
     * 批量更新状态
     */
    update(updates) {
        for (const [key, value] of Object.entries(updates)) {
            this._state[key] = value;
            this._emit(key, value);
        }
    },

    /**
     * 订阅状态变化
     */
    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return () => {
            this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
        };
    },

    _emit(event, value) {
        (this._listeners[event] || []).forEach(cb => cb(value));
        (this._listeners['*'] || []).forEach(cb => cb(event, value));
    },

    /**
     * 加载所有数据（本地JSON + API）
     */
    async loadAll() {
        const results = await Promise.allSettled([
            fetch(_smApiUrl('/api/user')).then(r => r.ok ? r.json() : Promise.reject()).catch(() => null),
            // 模板文件（只读，不涉及用户数据，可以读共享文件）
            fetch('data/task_data.json').then(r => r.ok ? r.json() : Promise.reject()).catch(() => null),
            fetch('data/achievements_data.json').then(r => r.ok ? r.json() : Promise.reject()).catch(() => null),
            fetch('data/locations.json').then(r => r.ok ? r.json() : Promise.reject()).catch(() => null),
        ]);

        const [apiUserData, taskData, achievementData, locationData] = results.map(r => r.value);

        // 用户数据优先从 API，localStorage 兜底（用户隔离）
        if (apiUserData) {
            this._state.user = apiUserData;
        } else {
            const uid = localStorage.getItem('campus_rpg_user') ? JSON.parse(localStorage.getItem('campus_rpg_user')).id : 'guest';
            const userKey = `campus_rpg_user_data_${uid}`;
            try {
                const saved = JSON.parse(localStorage.getItem(userKey) || 'null');
                if (saved?.user) {
                    this._state.user = saved;
                } else {
                    this._state.user = this._getDefaultUser();
                }
            } catch {
                this._state.user = this._getDefaultUser();
            }
        }

        // 初始化探索数据
        if (!this._state.user.exploration) {
            this._state.user.exploration = this._state.exploration;
        }

        this._state.tasks = taskData?.tasks || this._getDefaultTasks();
        this._state.achievements = achievementData || this._getDefaultAchievements();
        this._state.locations = locationData?.locations || [];
        this._state.exploration = this._state.user.exploration || this._state.exploration;

        // 默认数据兜底
        if (!this._state.user.role) {
            this._state.user = this._getDefaultUser();
        }

        return this._state;
    },

    /**
     * 保存用户数据到后端（同时备份到 localStorage）
     */
    async saveUser() {
        try {
            const res = await fetch(_smApiUrl('/api/user'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this._state.user)
            });
            if (res.ok) return true;
        } catch {}
        // 后端失败，保存到 localStorage（用户隔离）
        const uid = localStorage.getItem('campus_rpg_user') ? JSON.parse(localStorage.getItem('campus_rpg_user')).id : 'guest';
        const userKey = `campus_rpg_user_data_${uid}`;
        try {
            localStorage.setItem(userKey, JSON.stringify(this._state.user));
        } catch {}
        return false;
    },

    /**
     * 添加经验值并检查升级
     */
    addExperience(amount) {
        const user = this._state.user;
        user.role.experience += amount;
        const levelUps = [];

        while (user.role.experience >= user.role.experience_needed) {
            user.role.experience -= user.role.experience_needed;
            user.role.level++;
            user.role.experience_needed = user.role.level * 100;
            user.role.gold += 50;
            levelUps.push(user.role.level);
        }

        this._emit('user', user);
        return { levelUps, experience: user.role.experience };
    },

    /**
     * 更新探索数据
     */
    discoverLocation(locationId) {
        const user = this._state.user;
        const exploration = user.exploration || this._state.exploration;

        if (!exploration.discovered_locations.includes(locationId)) {
            exploration.discovered_locations.push(locationId);
            exploration.exploration_streak++;
            this._state.exploration = exploration;
            user.exploration = exploration;
            this._emit('exploration', exploration);
            return true; // 新发现
        }
        return false; // 已探索过
    },

    /**
     * 获取探索进度百分比
     */
    getExplorationProgress() {
        const discovered = this._state.exploration?.discovered_locations?.length || 0;
        const total = this._state.locations.length;
        return { discovered, total, percentage: total > 0 ? Math.round((discovered / total) * 100) : 0 };
    },

    // ============ 默认数据 ============

    _getDefaultUser() {
        return {
            user: {
                name: '同学',
                school: '合肥财经大学·物联网应用技术',
                grade: '大一',
                goals: ['过四级', '不挂科', '学完高数'],
                apps: { timetable: 'WakeUp课程表', campus: '学习通' },
                interest: '动漫',
                lazy_level: 2,
                party_size: 2,
                long_term_goals: [],
                short_term_plans: []
            },
            role: { level: 1, experience: 0, experience_needed: 100, gold: 50 },
            stats: { energy: 100, focus: 100, mood: 100, stress: 20 },
            npc_relationship: {
                naruto: { affection: 20, max_affection: 100, title: '热血导师' },
                sasuke: { affection: 10, max_affection: 100, title: '傲娇助教' }
            },
            buffs: [{ name: '动漫联动', description: '学习效率+15%', duration: '今日有效', icon: '🎬' }],
            inventory: [
                { name: '经验药水', description: '使用后获得20点经验', quantity: 3, icon: '🧪' },
                { name: '能量饮料', description: '恢复30点能量', quantity: 2, icon: '🥤' }
            ],
            exploration: {
                discovered_locations: [],
                current_location: 'dorm',
                exploration_streak: 0,
                hidden_events_found: []
            }
        };
    },

    _getDefaultTasks() {
        return [
            {
                id: 'main_1', name: '英语四级备考', category: 'main',
                category_name: '主线任务', category_icon: '🎯', status: 'in_progress', progress: 66,
                reward: { experience: 100, gold: 50 },
                subtasks: [
                    { id: 'sub_1_1', name: '背30个四级单词', status: 'completed', progress: 100, experience: 20 },
                    { id: 'sub_1_2', name: '做1套四级真题', status: 'in_progress', progress: 30, experience: 30 },
                    { id: 'sub_1_3', name: '听力练习30分钟', status: 'pending', progress: 0, experience: 25 }
                ]
            },
            {
                id: 'side_explore', name: '校园探索', category: 'side',
                category_name: '支线任务', category_icon: '🗺️', status: 'in_progress', progress: 0,
                reward: { experience: 80, gold: 40 },
                subtasks: []
            }
        ];
    },

    _getDefaultAchievements() {
        return {
            achievements: {
                '学业成就': [
                    { id: 'ach_1', name: '初入校园', desc: '成功开启大学生活RPG', status: 'unlocked', date: '', icon: '🎓' },
                    { id: 'ach_2', name: '学习起步', desc: '完成第一次学习任务', status: 'unlocked', date: '', icon: '📚' }
                ],
                '探索成就': [
                    { id: 'ach_11', name: '初次探索', desc: '探索第一个校园地点', status: 'not_started', progress: 0, total: 1, icon: '🗺️' },
                    { id: 'ach_12', name: '足迹遍布', desc: '探索10个不同地点', status: 'not_started', progress: 0, total: 10, icon: '👣' },
                    { id: 'ach_13', name: '彩蛋猎人', desc: '发现3个隐藏事件', status: 'not_started', progress: 0, total: 3, icon: '🥚' }
                ],
                '社交成就': [
                    { id: 'ach_18', name: '宿舍联机', desc: '与室友建立联机关系', status: 'unlocked', date: '', icon: '👥' }
                ],
                '隐藏成就': [
                    { id: 'ach_24', name: '深夜探险家', desc: '22:00-06:00期间探索', status: 'locked', icon: '🌙', hint: '夜晚的校园别有一番风味...' }
                ]
            },
            statistics: { total_achievements: 26, unlocked: 3, in_progress: 0, not_started: 21, hidden: 3 }
        };
    },

    /** 公开方法：获取默认用户数据（供其他模块使用，避免重复定义） */
    getDefaultUser() {
        return JSON.parse(JSON.stringify(this._getDefaultUser()));
    },

    /** 公开方法：获取默认任务列表 */
    getDefaultTasks() {
        return JSON.parse(JSON.stringify(this._getDefaultTasks()));
    },

    /** 公开方法：获取默认成就数据 */
    getDefaultAchievements() {
        return JSON.parse(JSON.stringify(this._getDefaultAchievements()));
    }
};

// 导出
window.StateManager = StateManager;
window.AppState = StateManager; // 兼容旧代码，未来逐步废弃 AppState 引用
