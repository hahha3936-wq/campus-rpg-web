/**
 * 校园RPG - 核心状态管理器
 * 统一管理全局状态、持久化和数据加载
 */

function _smApiUrl(path) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}

// 成长阶段常量
const GROWTH_STAGES = ['新生适应期', '学业成长期', '实习准备期', '毕业冲刺期'];

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
            fetch('data/achievement_data.json').then(r => r.ok ? r.json() : Promise.reject()).catch(() => null),
            // 优先加载 campus_pois.json（24 个 POI），向后兼容 fallback 到 locations.json（9 个旧地点）
            fetch('data/campus_pois.json').then(r => r.ok ? r.json() : Promise.reject()).catch(() => null),
            fetch('data/locations.json').then(r => r.ok ? r.json() : Promise.reject()).catch(() => null),
        ]);

        const [apiUserData, taskData, achievementData, campusPoiData, oldLocationData] = results.map(r => r.value);

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

        // 地点数据：优先使用 campus_pois.json（24 个 POI），向后兼容 fallback
        const locations = campusPoiData?.pois || oldLocationData?.locations || [];
        this._state.locations = locations;
        if (campusPoiData?.pois) {
            console.log(`[StateManager] 加载 ${campusPoiData.pois.length} 个 POI（campus_pois.json）`);
        } else if (oldLocationData?.locations) {
            console.warn(`[StateManager] 使用旧版 ${oldLocationData.locations.length} 个地点（locations.json），建议迁移到 campus_pois.json`);
        }

        this._state.exploration = this._state.user.exploration || this._state.exploration;

        // 旧版地点 ID 迁移（discovered_locations 中的旧 ID 映射到新 POI ID）
        // 旧: dorm/canteen/teaching_building/sports_field/garden/cafe/lab/bookstore/library
        // 新: dorm_qianyuan/canteen_west/teaching_complex/athletics_field/lake/study_cafe/lab_building/bookstore/library
        const ID_MIGRATION_MAP = {
            'dorm':              'dorm_qianyuan',
            'canteen':           'canteen_west',
            'teaching_building': 'teaching_complex',
            'sports_field':     'athletics_field',
            'garden':           'lake',
            'cafe':             'study_cafe',
            'lab':              'lab_building',
            // library, bookstore, south_gate 等 ID 未改变
        };
        if (campusPoiData?.pois) {
            const discovered = this._state.exploration?.discovered_locations || [];
            const migrated = [];
            let migratedCount = 0;
            discovered.forEach(id => {
                if (ID_MIGRATION_MAP[id] && !discovered.includes(ID_MIGRATION_MAP[id])) {
                    migrated.push(ID_MIGRATION_MAP[id]);
                    migratedCount++;
                }
            });
            if (migratedCount > 0) {
                console.log(`[StateManager] 迁移 ${migratedCount} 个旧版地点ID:`, discovered.filter(id => ID_MIGRATION_MAP[id]).join(', '), '→', migrated.join(', '));
                // 添加新 ID 但保留旧 ID（向后兼容，后端会根据实际 ID 判断）
                const merged = [...new Set([...discovered, ...migrated])];
                this._state.exploration.discovered_locations = merged;
                if (this._state.user.exploration) {
                    this._state.user.exploration.discovered_locations = merged;
                }
            }
        }

        // 默认数据兜底
        if (!this._state.user.role) {
            this._state.user = this._getDefaultUser();
        }

        // IndexedDB 兜底：localStorage 失败或为空时，从 IndexedDB 恢复任务数据
        if (this._state.tasks && this._state.tasks.length === 0) {
            try {
                const offlineTasks = await OfflineStorage.loadTasks();
                if (offlineTasks && offlineTasks.length > 0) {
                    this._state.tasks = offlineTasks;
                }
            } catch {}
        }

        // IndexedDB 兜底：从加密存储恢复用户状态（API 和 localStorage 都失败时）
        if (!this._state.user?.user) {
            try {
                const offlineState = await OfflineStorage.loadUserState();
                if (offlineState?.user) {
                    this._state.user = offlineState;
                }
            } catch {}
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

        // IndexedDB 加密备份（容量更大，安全性更高，作为双重保险）
        try {
            await OfflineStorage.saveUserState(this._state.user);
            await OfflineStorage.saveTasks(this._state.tasks || []);
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
        // 优先使用 ExplorationMap 的 POI 数据计算总数（24个），fallback 到 StateManager.locations
        const total = (window.ExplorationMap?.campusPOIs?.length) || this._state.locations.length;
        return { discovered, total, percentage: total > 0 ? Math.round((discovered / total) * 100) : 0 };
    },

    // ============ 默认数据 ============

    _getDefaultUser() {
        return {
            user: {
                name: '同学',
                school: '合肥财经大学',
                grade: '大一',
                major: '物联网应用技术',
                goals: ['过四级', '不挂科', '学完高数'],
                apps: { timetable: 'WakeUp课程表', campus: '学习通' },
                interest: '动漫',
                lazy_level: 2,
                party_size: 2,
                long_term_goals: [],
                short_term_plans: [],
                // ===== 大学生成长画像字段 =====
                // 学业画像
                current_courses: [],          // 当前课程列表，如 ["高等数学", "大学英语"]
                weak_subjects: [],            // 薄弱科目，如 ["线性代数", "大学物理"]
                target_gpa: 3.5,              // 目标GPA，取值范围 0.0-4.0
                // 自律画像
                daily_routine: 'regular',     // 作息类型：early_bird/night_owl/regular/irregular
                task_completion_rate: 0,      // 历史任务完成率，单位：百分比(0-100)
                avg_study_duration: 0,        // 平均学习时长，单位：分钟/天
                // 兴趣画像
                interests: [],                // 兴趣方向列表，如 ["动漫", "音乐", "运动"]
                campus_preferences: [],        // 偏好校园场景列表，如 ["图书馆", "食堂", "操场"]
                // 成长阶段
                current_stage: '新生适应期'    // 成长阶段枚举：新生适应期/学业成长期/实习准备期/毕业冲刺期
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
    },

    /** 公开方法：成长阶段常量 */
    GROWTH_STAGES: GROWTH_STAGES,

    /** 根据年级自动推断成长阶段 */
    inferGrowthStage(grade) {
        if (!grade) return '新生适应期';
        if (grade.includes('大一') || grade.includes('新生')) return '新生适应期';
        if (grade.includes('大四') || grade.includes('毕业')) return '毕业冲刺期';
        if (grade.includes('大三')) return '实习准备期';
        return '学业成长期';
    }
};

// 导出
window.StateManager = StateManager;
window.AppState = StateManager; // 兼容旧代码，未来逐步废弃 AppState 引用
