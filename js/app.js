/**
 * 校园RPG - 主应用脚本
 * 游戏化学习系统核心逻辑
 */

// ============================================
// 全局状态管理（统一由 StateManager 处理）
// AppState 是 StateManager 的透明代理：所有 .属性读写自动路由到 StateManager
// ============================================

// AppState 代理：把普通属性访问转发到 StateManager.get/set，支持旧代码无感迁移
const AppState = new Proxy(StateManager, {
    get(target, prop) {
        // StateManager 自身方法（get/set/on/off 等）直接返回
        if (typeof target[prop] === 'function') return target[prop].bind(target);
        // 普通属性访问（user/tasks/achievements 等）转为 target.get()
        if (prop in target._state) return target.get(prop);
        return target[prop];
    },
    set(target, prop, value) {
        target.set(prop, value);
        return true;
    }
});
window.AppState = AppState;

// ============================================
// 统一 API 错误处理（safeFetch）
// ============================================
async function safeFetch(url, options = {}) {
    try {
        const resp = await fetch(url, options);
        if (!resp.ok) {
            console.warn(`[safeFetch] HTTP ${resp.status} ← ${url}`);
            return null;
        }
        const isJson = resp.headers.get('content-type')?.includes('json');
        return isJson ? await resp.json() : await resp.text();
    } catch (err) {
        console.warn(`[safeFetch] 请求失败 ← ${url}:`, err.message);
        return null;
    }
}

const DATA_PATH = {
    user: 'data/user_data.json',
    tasks: 'data/task_data.json',
    achievements: 'data/achievement_data.json'
};

// NPC对话数据（委托给 NPCManager）
// const NPC_DIALOGUES 已迁移至 js/features/npc-manager.js

// 随机事件数据
const RANDOM_EVENTS = [
    {
        id: 'study_crit',
        icon: '💥',
        title: '学习暴击！',
        description: '你的学习效率突然暴增！',
        rewards: { experience: 50, gold: 20 },
        effect: '经验x2'
    },
    {
        id: 'mermaid_time',
        icon: '😴',
        title: '摸鱼时光',
        description: '你决定休息一下，恢复精力',
        rewards: { energy: 30 },
        effect: '能量+30'
    },
    {
        id: 'roommate_chat',
        icon: '👥',
        title: '室友互动',
        description: '和室友聊了聊，收获了快乐',
        rewards: { mood: 20 },
        effect: '心情+20'
    },
    {
        id: 'coffee_break',
        icon: '☕',
        title: '咖啡加成',
        description: '喝了一杯咖啡，专注力提升',
        rewards: { focus: 25 },
        effect: '专注力+25'
    },
    {
        id: 'lucky_day',
        icon: '🍀',
        title: '幸运日！',
        description: '今天运气超好，做什么都顺利',
        rewards: { experience: 30, gold: 30 },
        effect: '经验+30, 金币+30'
    },
    {
        id: 'hidden_egg',
        icon: '🥚',
        title: '隐藏彩蛋！',
        description: '你发现了一个隐藏的秘密',
        rewards: { experience: 100, gold: 50 },
        effect: '大量经验+金币'
    }
];

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 清除引导遮罩等异常残留
        document.getElementById('onboarding-overlay')?.remove();
        document.getElementById('onboarding-tooltip')?.remove();
        document.getElementById('onboarding-spotlight')?.remove();

        // 初始化事件总线
        EventBus.emit('app:init:start');

        // 初始化音效管理器
        SoundManager.init();

        // 初始化核心模块
        ExplorationDialogue.init();

        // 加载数据（优先StateManager，失败时用本地数据）
        await loadAllData();

        // 初始化UI
        initUI();

        // 初始化事件监听
        initEventListeners();

        // 初始化粒子背景
        initParticles();

    } catch (err) {
        console.error('[app.js] 初始化出错:', err);
    }

    // 注销所有可能存在的旧版 Service Worker（在浏览器空闲时处理，不阻塞主线程）
    if ('serviceWorker' in navigator) {
        const unregisterSW = () => {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(reg => reg.unregister());
            });
        };
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(unregisterSW, { timeout: 3000 });
        } else {
            setTimeout(unregisterSW, 500);
        }
    }

    // 随机NPC对话
    randomizeNPCDialogues();

    // 更新每日任务
    updateDailyTasks();

    // 初始化签到状态
    initSigninStatus();

    // 更新探索统计显示
    updateExplorationStats();

    // 显示首次使用引导
    if (typeof Onboarding !== 'undefined') {
        setTimeout(() => Onboarding.start(), 1500);
    }

    EventBus.emit('app:init:complete');
});

// ============================================
// 数据加载
// ============================================
async function loadAllData() {
    try {
        // 优先从后端 API 加载（携带 JWT token）
        if (Auth && Auth.isLoggedIn()) {
            // 并行请求，任一失败不影响其他，使用 catch 防止雪崩
            const [userData, tasksData, achievementsData] = await Promise.all([
                API.getUser().catch(() => null),
                API.getTasks().catch(() => null),
                API.getAchievements().catch(() => null)
            ]);

            if (userData) {
                AppState.user = userData;
                if (typeof StateManager !== 'undefined') {
                    StateManager.set('user', AppState.user);
                }
            }
            if (tasksData) {
                AppState.tasks = tasksData.tasks || [];
                if (typeof StateManager !== 'undefined') {
                    StateManager.set('tasks', AppState.tasks);
                }
            }
            if (achievementsData) {
                AppState.achievements = achievementsData;
            }
        } else {
            // 未登录或无 Auth 模块：从本地 JSON 加载，任一失败不影响其他
            const [userRes, tasksRes, achievementsRes] = await Promise.all([
                fetch(DATA_PATH.user).catch(() => null),
                fetch(DATA_PATH.tasks).catch(() => null),
                fetch(DATA_PATH.achievements).catch(() => null)
            ]);

            if (userRes?.ok) {
                AppState.user = await userRes.json();
                if (typeof StateManager !== 'undefined') {
                    StateManager.set('user', AppState.user);
                }
            }
            if (tasksRes?.ok) {
                AppState.tasks = (await tasksRes.json()).tasks || [];
                if (typeof StateManager !== 'undefined') {
                    StateManager.set('tasks', AppState.tasks);
                }
            }
            if (achievementsRes?.ok) {
                AppState.achievements = await achievementsRes.json();
            }
        }

        // 使用默认数据兜底
        if (!AppState.user) {
            AppState.user = getDefaultUserData();
            if (typeof StateManager !== 'undefined') {
                StateManager.set('user', AppState.user);
            }
        }
        if (!AppState.tasks || AppState.tasks.length === 0) {
            AppState.tasks = getDefaultTasks();
            if (typeof StateManager !== 'undefined') {
                StateManager.set('tasks', AppState.tasks);
            }
        }
        if (!AppState.achievements?.achievements) {
            AppState.achievements = getDefaultAchievements();
        }

    } catch (error) {
        console.warn('数据加载失败，使用默认数据:', error);
        AppState.user = getDefaultUserData();
        AppState.tasks = getDefaultTasks();
        AppState.achievements = getDefaultAchievements();
        if (typeof StateManager !== 'undefined') {
            StateManager.set('user', AppState.user);
            StateManager.set('tasks', AppState.tasks);
        }
    }

    // 更新UI显示
    updateUserDisplay();

    // 将用户数据同步给 PlanManager（避免重复请求 API）
    if (window.PlanManager) {
        PlanManager._userData = AppState.user;
    }
}

// 默认数据（委托给 StateManager，消除重复定义）
function getDefaultUserData() {
    return StateManager.getDefaultUser();
}

function getDefaultTasks() {
    return StateManager.getDefaultTasks();
}

function getDefaultAchievements() {
    return StateManager.getDefaultAchievements();
}

// ============================================
// UI初始化
// ============================================
function initUI() {
    // 更新用户信息显示
    updateUserDisplay();
    
    // 更新统计数据
    updateStatistics();
    
    // 初始化底部导航（已改为纯 <a href> 结构，无需 JS 初始化）
}

function updateUserDisplay() {
    const user = AppState.user;
    if (!user) return;
    
    // 更新顶部栏
    document.getElementById('gold-display').textContent = user.role?.gold || 0;
    document.getElementById('level-display').textContent = user.role?.level || 1;
    
    // 更新角色卡片
    document.getElementById('role-name').textContent = user.user?.name || '同学';
    document.getElementById('role-school').textContent = user.user?.school || '未知学校';
    
    // 更新经验条
    const exp = user.role?.experience || 0;
    const exp_needed = user.role?.experience_needed || 100;
    const exp_percentage = (exp / exp_needed) * 100;
    document.getElementById('exp-text').textContent = `${exp}/${exp_needed}`;
    document.getElementById('exp-fill').style.width = `${exp_percentage}%`;
    
    // 更新等级徽章
    const levelBadge = document.querySelector('.level-badge');
    if (levelBadge) {
        levelBadge.textContent = `Lv.${user.role?.level || 1}`;
    }
    
    // 更新状态值
    if (user.stats) {
        updateStatusDisplay('energy', user.stats.energy || 100);
        updateStatusDisplay('focus', user.stats.focus || 100);
        updateStatusDisplay('mood', user.stats.mood || 100);
        updateStatusDisplay('stress', user.stats.stress || 20);
    }
}

function updateStatusDisplay(stat, value) {
    const valueEl = document.getElementById(`${stat}-value`);
    const fillEl = document.getElementById(`${stat}-fill`);
    
    if (valueEl) valueEl.textContent = value;
    if (fillEl) fillEl.style.width = `${value}%`;
}

function updateStatistics() {
    // 更新成就统计
    const stats = AppState.achievements.statistics || {};
    document.getElementById('unlocked-achievements').textContent = stats.unlocked || 0;
    document.getElementById('total-achievements').textContent = stats.total_achievements || 0;
    
    // 更新任务统计
    const tasks = AppState.tasks;
    const completed = tasks.filter(t => t.status === 'completed' || t.progress === 100).length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    
    document.getElementById('total-tasks').textContent = tasks.length;
    document.getElementById('completed-tasks').textContent = completed;
    document.getElementById('inprogress-tasks').textContent = inProgress;
}

// ============================================
// 事件监听初始化
// ============================================
function initEventListeners() {
    // 主功能按钮
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', handleMainAction);
    });
    
    // 快速操作按钮
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', handleQuickAction);
    });
    
    // 任务标签切换
    document.querySelectorAll('.task-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            AppState.currentTaskCategory = e.target.dataset.category;
            renderTasks();
        });
    });
    
    // 成就标签切换
    document.querySelectorAll('.achievement-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.achievement-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            AppState.currentAchievementCategory = e.target.dataset.category;
            renderAchievements();
        });
    });
    
    // 设置开关
    document.getElementById('sound-toggle')?.addEventListener('change', (e) => {
        AppState.settings.sound = e.target.checked;
        if (window.SoundManager) {
            SoundManager.toggle(e.target.checked);
        }
    });
    
    document.getElementById('darkmode-toggle')?.addEventListener('change', (e) => {
        const dark = e.target.checked;
        AppState.settings.darkMode = dark;
        document.body.classList.toggle('dark-mode', dark);
        localStorage.setItem('darkMode', dark ? '1' : '0');
    });
    
    document.getElementById('animation-toggle')?.addEventListener('change', (e) => {
        AppState.settings.animation = e.target.checked;
        document.body.classList.toggle('no-animation', !e.target.checked);
    });
    
    // NPC点击
    document.querySelectorAll('.npc-character').forEach(npc => {
        npc.addEventListener('click', () => handleNPCInteraction(npc.dataset.npc));
    });
}

// ============================================
// 底部导航
// — 已改为纯 <a href> 结构，由 CSS :active 和页面激活状态管理
// ============================================

// 主功能按钮处理
// ============================================
function handleMainAction(e) {
    const action = e.currentTarget.dataset.action;
    
    switch (action) {
        case 'role':
            openRoleModal();
            break;
        case 'tasks':
            openTaskModal();
            break;
        case 'achievements':
            openAchievementModal();
            break;
        case 'inventory':
            openInventoryModal();
            break;
    }
}

// ============================================
// 快速操作处理
// ============================================
function handleQuickAction(e) {
    const action = e.currentTarget.dataset.action;

    switch (action) {
        case 'quick-action':
            performQuickAction();
            break;
        case 'signin':
            showSigninModal();
            break;
        case 'random-event':
            triggerRandomEvent();
            break;
        case 'daily-summary':
            showDailySummary();
            break;
        case 'shop':
            showNotification('商店功能开发中...', 'info');
            break;
        case 'pomodoro':
            showPomodoroModal();
            break;
        case 'exploration':
            if (typeof ExplorationMap !== 'undefined') {
                ExplorationMap.open();
            }
            break;
        case 'ai-recommend':
            if (typeof RecommendModal !== 'undefined') {
                RecommendModal.open();
            }
            break;
    }
}

// ============================================
// 番茄钟（已迁移至 js/features/pomodoro-manager.js）
// ============================================

// ============================================
// 每日签到
// ============================================
async function showSigninModal() {
    const modalEl = document.getElementById('signinModal');
    const modalHeader = document.getElementById('signin-modal-header');
    const modalTitle = document.getElementById('signin-modal-title');
    const modalBody = document.getElementById('signin-modal-body');

    const result = await API.getSigninStatus();

    if (!result) {
        showNotification('无法获取签到状态，请检查网络', 'error');
        return;
    }

    const today = result.today;
    const todaySigned = result.today_signed;
    const streak = result.current_streak;
    const longest = result.longest_streak;
    const total = result.total_signins;
    const nextRewards = result.next_rewards;

    if (todaySigned) {
        // 今日已签到
        modalHeader.className = 'modal-header done-header';
        modalTitle.textContent = '✅ 今日已签到';
        modalBody.innerHTML = `
            <div class="signin-done-display">
                <div class="signin-done-icon">✅</div>
                <div class="signin-done-title">明天再来吧！</div>
                <div class="signin-done-sub">连续签到不要中断哦~</div>
                <div class="signin-done-stats">
                    <div>
                        <div class="signin-done-stat-value">${streak}</div>
                        <div class="signin-done-stat-label">当前连签</div>
                    </div>
                    <div>
                        <div class="signin-done-stat-value">${longest}</div>
                        <div class="signin-done-stat-label">历史最高</div>
                    </div>
                    <div>
                        <div class="signin-done-stat-value">${total}</div>
                        <div class="signin-done-stat-label">累计签到</div>
                    </div>
                    <div>
                        <div class="signin-done-stat-value">${streak >= 7 ? '🔥' : '❄️'}</div>
                        <div class="signin-done-stat-label">连签状态</div>
                    </div>
                </div>
                <div class="signin-done-calendar">
                    ${_renderSigninCalendar(result)}
                </div>
            </div>
        `;
    } else {
        // 今日未签到 — 显示签到预览
        const rewardTiers = _getRewardTiers(streak);
        modalHeader.className = 'modal-header signin-header';
        modalTitle.textContent = `📅 每日签到 · 第${streak}天`;
        modalBody.innerHTML = `
            <div class="signin-streak-display">
                <div class="signin-streak-number">${streak}</div>
                <div class="signin-streak-label">连续签到天数</div>
            </div>
            <div class="signin-rewards-preview">
                <div class="signin-reward-item">
                    <span class="reward-icon">⭐</span>
                    <span class="reward-value">+${nextRewards.experience}</span>
                </div>
                <div class="signin-reward-item">
                    <span class="reward-icon">💰</span>
                    <span class="reward-value">+${nextRewards.gold}</span>
                </div>
            </div>
            ${streak > 1 ? `<div class="signin-streak-bonus"><span class="bonus-text">🔥 ${streak}天连签加成！</span></div>` : ''}
            <div style="text-align:center; margin-bottom: 16px;">
                <div style="font-size:13px; color:#6b7280; margin-bottom: 12px;">近7天签到记录</div>
                <div class="signin-calendar">${_renderSigninCalendar(result)}</div>
            </div>
            <div style="font-size:12px; color:#6b7280; text-align:center; margin-bottom: 12px;">连签奖励预览</div>
            <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap; margin-bottom: 16px;">
                ${rewardTiers.map(t => `
                    <div style="background:#252540; border-radius:8px; padding:6px 10px; font-size:11px; color:${t.active ? '#00d4ff' : '#6b7280'}; border: 1px solid ${t.active ? 'rgba(0,212,255,0.3)' : 'transparent'};">
                        ${t.label}<br><strong>${t.exp}EXP ${t.gold}💰</strong>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-signin-confirm w-100" id="do-signin-btn"
                style="background: linear-gradient(135deg, #f093fb, #f5576c); border:none; color:#fff; padding:14px; border-radius:14px; font-size:16px; font-weight:700; cursor:pointer;">
                ✨ 立即签到
            </button>
        `;

        document.getElementById('do-signin-btn').addEventListener('click', async () => {
            const btn = document.getElementById('do-signin-btn');
            btn.disabled = true;
            btn.textContent = '签到中...';

            const signinResult = await API.doSignin();
            if (signinResult.success) {
                modalHeader.className = 'modal-header success-header';
                modalTitle.textContent = '🎉 签到成功！';

                const r = signinResult.rewards;
                const role = signinResult.role;
                const lvUps = signinResult.level_ups;

                if (window.SoundManager) {
                    SoundManager.play(lvUps > 0 ? 'levelup' : 'signin');
                }

                modalBody.innerHTML = `
                    <div class="signin-streak-display">
                        <div class="signin-streak-number">${signinResult.streak}</div>
                        <div class="signin-streak-label">连续签到天数</div>
                    </div>
                    ${lvUps > 0 ? `<div class="signin-streak-bonus" style="background:linear-gradient(135deg,rgba(0,212,255,0.15),rgba(0,212,255,0.05));border-color:rgba(0,212,255,0.3);"><span class="bonus-text" style="color:#00d4ff;">⬆️ 恭喜升级！Lv.${role.level} → ${role.level}</span></div>` : ''}
                    <div class="signin-success-rewards">
                        <div class="signin-reward-card">
                            <div class="card-icon">⭐</div>
                            <div class="card-value">+${r.experience}</div>
                            <div class="card-label">经验值</div>
                        </div>
                        <div class="signin-reward-card">
                            <div class="card-icon">💰</div>
                            <div class="card-value">+${r.gold}</div>
                            <div class="card-label">金币</div>
                        </div>
                        <div class="signin-reward-card">
                            <div class="card-icon">⚡</div>
                            <div class="card-value">+10</div>
                            <div class="card-label">能量值</div>
                        </div>
                        <div class="signin-reward-card">
                            <div class="card-icon">🔥</div>
                            <div class="card-value">${signinResult.streak}</div>
                            <div class="card-label">当前连签</div>
                        </div>
                    </div>
                    <button class="btn btn-signin-confirm w-100"
                        style="background:#252540; border:1px solid rgba(255,255,255,0.1); color:#e0e0f0; padding:12px; border-radius:12px; font-size:14px; cursor:pointer;"
                        data-bs-dismiss="modal">
                        太棒了！
                    </button>
                `;

                updateRoleDisplay();
                updateSigninButton(true);

                if (lvUps > 0) {
                    setTimeout(() => {
                        showRewardPopup({
                            icon: '⬆️',
                            title: '升级！',
                            message: `已达 Lv.${role.level}`,
                            reward: { exp: r.experience, gold: r.gold }
                        });
                    }, 300);
                }
            } else {
                btn.disabled = false;
                btn.textContent = '✨ 立即签到';
                showNotification(signinResult.message || '签到失败', 'error');
            }
        });
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function _renderSigninCalendar(result) {
    const records = result.records || [];
    const today = new Date();
    const days = ['日','一','二','三','四','五','六'];
    let html = '';
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayLabel = days[d.getDay()];
        const isToday = i === 0;
        const isSigned = records.includes(dateStr);
        html += `
            <div class="signin-day">
                <div class="signin-day-dot ${isSigned ? 'signed-dot' : ''} ${isToday ? 'today-dot' : ''}">
                    ${d.getDate()}
                </div>
                <div class="signin-day-label">${dayLabel}</div>
            </div>
        `;
    }
    return html;
}

function _getRewardTiers(currentStreak) {
    const tiers = [
        { days: 1, label: '1天', exp: 10, gold: 5 },
        { days: 3, label: '3天', exp: 15, gold: 10 },
        { days: 7, label: '7天', exp: 25, gold: 20 },
        { days: 14, label: '14天', exp: 40, gold: 35 },
        { days: 30, label: '30天', exp: 60, gold: 50 },
    ];
    return tiers.map(t => ({
        ...t,
        active: currentStreak >= t.days
    }));
}

function updateSigninButton(signed = false) {
    const btn = document.getElementById('signin-btn');
    const icon = document.getElementById('signin-icon');
    const text = document.getElementById('signin-text');
    if (!btn) return;
    if (signed) {
        btn.classList.add('signed');
        if (icon) icon.textContent = '✅';
        if (text) text.textContent = '已签到';
    }
}

async function initSigninStatus() {
    const result = await API.getSigninStatus();
    if (result && result.today_signed) {
        updateSigninButton(true);
    }
}

function updateExplorationStats() {
    const btn = document.getElementById('exploration-btn');
    if (!btn) return;

    // 从 StateManager 获取探索进度
    let stats = { discovered: 0, total: 0, percentage: 0 };
    if (typeof StateManager !== 'undefined') {
        stats = StateManager.getExplorationProgress();
    }

    const badge = btn.querySelector('.exploration-badge') || document.createElement('span');
    badge.className = 'exploration-badge';
    badge.textContent = stats.percentage > 0 ? `${stats.percentage}%` : '探索';
    badge.style.cssText = 'position:absolute;top:-4px;right:-4px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;';

    if (!btn.querySelector('.exploration-badge')) {
        btn.style.position = 'relative';
        btn.appendChild(badge);
    } else {
        btn.querySelector('.exploration-badge').textContent = stats.percentage > 0 ? `${stats.percentage}%` : '探索';
    }
}

// ============================================
// 角色面板
// ============================================
function openRoleModal() {
    const user = AppState.user;
    if (!user) return;
    
    const body = document.getElementById('role-modal-body');
    
    // 计算属性
    const role = user.role || {};
    const stats = user.stats || {};
    const buffs = user.buffs || [];
    const npc = user.npc_relationship || {};
    
    body.innerHTML = `
        <div class="role-detail-panel animate-fade-in">
            <!-- 属性网格 -->
            <div class="role-stats-grid">
                <div class="role-stat-item">
                    <div class="role-stat-header">
                        <span class="role-stat-icon">💰</span>
                        <span class="role-stat-label">金币</span>
                    </div>
                    <div class="role-stat-value" style="color: var(--warning-color);">${role.gold || 0}</div>
                </div>
                <div class="role-stat-item">
                    <div class="role-stat-header">
                        <span class="role-stat-icon">⭐</span>
                        <span class="role-stat-label">等级</span>
                    </div>
                    <div class="role-stat-value" style="color: var(--primary-color);">Lv.${role.level || 1}</div>
                </div>
                <div class="role-stat-item">
                    <div class="role-stat-header">
                        <span class="role-stat-icon">⚡</span>
                        <span class="role-stat-label">能量</span>
                    </div>
                    <div class="role-stat-value" style="color: #ffd93d;">${stats.energy || 100}</div>
                    <div class="progress-bar-custom role-stat-bar">
                        <div class="progress-fill energy-fill" style="width: ${stats.energy || 100}%"></div>
                    </div>
                </div>
                <div class="role-stat-item">
                    <div class="role-stat-header">
                        <span class="role-stat-icon">🎯</span>
                        <span class="role-stat-label">专注</span>
                    </div>
                    <div class="role-stat-value" style="color: var(--primary-color);">${stats.focus || 100}</div>
                    <div class="progress-bar-custom role-stat-bar">
                        <div class="progress-fill focus-fill" style="width: ${stats.focus || 100}%"></div>
                    </div>
                </div>
                <div class="role-stat-item">
                    <div class="role-stat-header">
                        <span class="role-stat-icon">😊</span>
                        <span class="role-stat-label">心情</span>
                    </div>
                    <div class="role-stat-value" style="color: var(--success-color);">${stats.mood || 100}</div>
                    <div class="progress-bar-custom role-stat-bar">
                        <div class="progress-fill mood-fill" style="width: ${stats.mood || 100}%"></div>
                    </div>
                </div>
                <div class="role-stat-item">
                    <div class="role-stat-header">
                        <span class="role-stat-icon">😰</span>
                        <span class="role-stat-label">压力</span>
                    </div>
                    <div class="role-stat-value" style="color: var(--danger-color);">${stats.stress || 20}</div>
                    <div class="progress-bar-custom role-stat-bar">
                        <div class="progress-fill stress-fill" style="width: ${stats.stress || 20}%"></div>
                    </div>
                </div>
            </div>
            
            <!-- 经验进度 -->
            <div class="experience-bar-container mb-3">
                <div class="exp-label">
                    <span>距离下一级还需</span>
                    <span id="exp-remaining">${(role.experience_needed || 100) - (role.experience || 0)}经验</span>
                </div>
                <div class="progress-bar-custom" style="height: 16px;">
                    <div class="progress-fill exp-fill" style="width: ${((role.experience || 0) / (role.experience_needed || 100)) * 100}%"></div>
                </div>
            </div>
            
            <!-- Buff效果 -->
            ${buffs.length > 0 ? `
                <div class="role-buffs">
                    <div class="role-buffs-title">✨ 当前Buff</div>
                    ${buffs.map(buff => `
                        <div class="buff-item">
                            <span class="buff-icon">${buff.icon}</span>
                            <div class="buff-info">
                                <div class="buff-name">${buff.name}</div>
                                <div class="buff-desc">${buff.description} | ${buff.duration}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <!-- NPC好感度 -->
            <div class="role-buffs">
                <div class="role-buffs-title">🎭 NPC好感度</div>
                ${Object.entries(npc).map(([npcId, data]) => `
                    <div class="buff-item">
                        <span class="buff-icon">${npcId === 'naruto' ? '🍥' : '⚡'}</span>
                        <div class="buff-info">
                            <div class="buff-name">${npcId === 'naruto' ? '漩涡鸣人老师' : '宇智波佐助助教'}</div>
                            <div class="buff-desc">${data.title} | 好感度: ${data.affection}/${data.max_affection}</div>
                            <div class="progress-bar-custom" style="margin-top: 0.25rem;">
                                <div class="progress-fill" style="width: ${(data.affection / data.max_affection) * 100}%; background: linear-gradient(90deg, var(--warning-color), var(--danger-color));"></div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // 打开模态框
    const modal = new bootstrap.Modal(document.getElementById('roleModal'));
    modal.show();
}

// ============================================
// 任务面板
// ============================================
function openTaskModal() {
    renderTasks();
    const modal = new bootstrap.Modal(document.getElementById('taskModal'));
    modal.show();
}

function renderTasks() {
    const body = document.getElementById('task-modal-body');
    const category = AppState.currentTaskCategory;

    let tasks = AppState.tasks;
    if (category !== 'all') {
        tasks = tasks.filter(t => t.category === category);
    }

    if (tasks.length === 0) {
        body.innerHTML = `
            <div class="empty-state" style="text-align:center;padding:3rem 1rem;color:var(--text-secondary);">
                <div style="font-size:3rem;margin-bottom:1rem;">📋</div>
                <div style="font-size:1.1rem;font-weight:600;margin-bottom:0.5rem;">暂无${category === 'all' ? '' : category}任务</div>
                <div style="font-size:0.85rem;opacity:0.7;">继续探索校园，发现更多任务吧！</div>
            </div>
        `;
        return;
    }

    body.innerHTML = tasks.map(task => `
        <div class="task-card ${task.category}">
            <div class="task-card-header">
                <div class="task-card-title">
                    <span>${task.category_icon}</span>
                    <h4>${task.name}</h4>
                    <span class="task-category-badge badge-${task.category}">${task.category_name}</span>
                </div>
                <span class="task-status status-${task.status}">
                    ${task.status === 'in_progress' ? '进行中' : 
                      task.status === 'completed' ? '已完成' : 
                      task.status === 'locked' ? '🔒 锁定' : '待开始'}
                </span>
            </div>
            <p class="task-description">${task.description}</p>
            
            <div class="task-progress-section">
                <div class="task-progress-header">
                    <span>进度</span>
                    <span>${task.progress}%</span>
                </div>
                <div class="task-progress-bar">
                    <div class="task-progress-fill ${task.category}" style="width: ${task.progress}%"></div>
                </div>
            </div>
            
            ${task.subtasks && task.subtasks.length > 0 ? `
                <div class="task-subtasks">
                    ${task.subtasks.map(sub => `
                        <div class="subtask-item">
                            <div class="subtask-checkbox ${sub.status === 'completed' ? 'completed' : ''}" 
                                 data-task="${task.id}" data-subtask="${sub.id}"
                                 onclick="toggleSubtask('${task.id}', '${sub.id}')"></div>
                            <span class="subtask-text ${sub.status === 'completed' ? 'completed' : ''}">${sub.name}</span>
                            <span class="subtask-reward">+${sub.experience}经验</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="task-footer">
                <div class="task-rewards">
                    ${task.reward.experience ? `<span class="task-reward-item exp">⭐ +${task.reward.experience}</span>` : ''}
                    ${task.reward.gold ? `<span class="task-reward-item gold">💰 +${task.reward.gold}</span>` : ''}
                </div>
                <div class="task-deadline">
                    ${task.deadline ? `📅 ${task.deadline}` : '无期限'}
                </div>
            </div>
        </div>
    `).join('');
    
    // 更新统计
    updateTaskStats();
}

function toggleSubtask(taskId, subtaskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const subtask = task.subtasks.find(s => s.id === subtaskId);
    if (!subtask || subtask.status === 'completed') return;
    
    // 标记完成
    subtask.status = 'completed';
    subtask.progress = 100;
    
    // 重新计算任务进度
    const completedCount = task.subtasks.filter(s => s.status === 'completed').length;
    task.progress = Math.round((completedCount / task.subtasks.length) * 100);
    
    if (task.progress === 100) {
        task.status = 'completed';
    }
    
    // 给予奖励
    const rewards = {
        experience: subtask.experience
    };
    showRewardPopup(rewards);

    // 检查成就进度
    _checkAchievementProgress('学业成就', 'ach_2');

    // 重新渲染
    renderTasks();
    
    // 更新主界面
    updateDailyTasks();
    updateStatistics();
}

function updateTaskStats() {
    const tasks = AppState.tasks;
    const completed = tasks.filter(t => t.status === 'completed' || t.progress === 100).length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    
    document.getElementById('completed-tasks').textContent = completed;
    document.getElementById('inprogress-tasks').textContent = inProgress;
}

// ============================================
// 成就进度检查
// ============================================
async function _checkAchievementProgress(category, achievementId) {
    const result = await API.updateAchievementProgress(category, achievementId, 1);
    if (result && result.success && result.just_unlocked) {
        const achievements = AppState.achievements?.achievements?.[category] || [];
        const ach = achievements.find(a => a.id === achievementId);
        if (ach) {
            showAchievementUnlock(ach);
            updateStatistics();
        }
    }
}

// ============================================
// 成就面板
// ============================================
function openAchievementModal() {
    renderAchievements();
    const modal = new bootstrap.Modal(document.getElementById('achievementModal'));
    modal.show();
}

function renderAchievements() {
    const body = document.getElementById('achievement-modal-body');
    const category = AppState.currentAchievementCategory;
    const allAchievements = AppState.achievements.achievements || {};
    
    let html = '';
    
    const categories = category === 'all' ? 
        Object.keys(allAchievements) : 
        [category];
    
    categories.forEach(cat => {
        const achievements = allAchievements[cat] || [];
        if (achievements.length === 0) return;
        
        const catIcon = cat === '学业成就' ? '📚' : 
                        cat === '探索成就' ? '🗺️' : 
                        cat === '社交成就' ? '👥' : '🔍';
        
        html += `
            <div class="mb-4">
                <h5 class="mb-3">${catIcon} ${cat}</h5>
                ${achievements.map(ach => `
                    <div class="achievement-card ${ach.status}">
                        <div class="achievement-icon">${ach.icon}</div>
                        <div class="achievement-info">
                            <div class="achievement-name">${ach.name}</div>
                            <div class="achievement-desc">${ach.desc}</div>
                            ${ach.status === 'in_progress' ? `
                                <div class="achievement-progress">
                                    <div class="achievement-progress-bar">
                                        <div class="achievement-progress-fill" style="width: ${(ach.progress / ach.total) * 100}%"></div>
                                    </div>
                                    <div class="achievement-progress-text">进度: ${ach.progress}/${ach.total}</div>
                                </div>
                            ` : ''}
                            ${ach.status === 'locked' && ach.hint ? `
                                <div class="achievement-hint">💡 ${ach.hint}</div>
                            ` : ''}
                            ${ach.status === 'unlocked' && ach.date ? `
                                <div class="achievement-date">✅ ${ach.date}</div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    });
    
    body.innerHTML = html || '<div class="text-center text-muted">暂无成就数据</div>';
}

// ============================================
// 背包面板
// ============================================
function openInventoryModal() {
    const body = document.getElementById('inventory-modal-body');
    const inventory = AppState.user?.inventory || [];
    
    if (inventory.length === 0) {
        body.innerHTML = `
            <div class="inventory-empty">
                <div class="inventory-empty-icon">🎒</div>
                <p>背包空空如也</p>
                <p class="text-muted">去完成任务获取道具吧！</p>
            </div>
        `;
    } else {
        body.innerHTML = `
            <div class="inventory-grid">
                ${inventory.map(item => `
                    <div class="inventory-item" onclick="useItem('${item.name}')">
                        <div class="inventory-icon">${item.icon}</div>
                        <div class="inventory-name">${item.name}</div>
                        <div class="inventory-quantity">x${item.quantity}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    const modal = new bootstrap.Modal(document.getElementById('inventoryModal'));
    modal.show();
}

function useItem(itemName) {
    const inventory = AppState.user?.inventory || [];
    const item = inventory.find(i => i.name === itemName);
    
    if (!item || item.quantity <= 0) {
        showNotification('道具不足！', 'error');
        return;
    }
    
    // 使用道具
    item.quantity--;
    
    // 根据道具类型给予效果
    if (itemName === '经验药水') {
        showRewardPopup({ experience: 20 });
    } else if (itemName === '能量饮料') {
        AppState.user.stats.energy = Math.min(100, AppState.user.stats.energy + 30);
        updateStatusDisplay('energy', AppState.user.stats.energy);
        showNotification('能量+30！', 'success');
    }
    
    // 重新渲染背包
    openInventoryModal();
    showNotification(`使用了 ${itemName}`, 'success');
}

// ============================================
// 每日任务推荐
// ============================================
function updateDailyTasks() {
    const container = document.getElementById('daily-task-list');
    
    // 获取今日推荐任务
    const dailyTasks = AppState.tasks
        .filter(t => t.is_daily || t.priority === 'high')
        .slice(0, 3);
    
    container.innerHTML = dailyTasks.map(task => `
        <div class="daily-task-item" onclick="openTaskModal()">
            <div class="task-priority priority-${task.priority}"></div>
            <div class="task-info">
                <div class="task-name">${task.category_icon} ${task.name}</div>
                <div class="task-meta">${task.category_name} | 进度: ${task.progress}%</div>
            </div>
            <div class="task-reward">
                ${task.reward.experience ? `<span class="reward-badge">⭐ +${task.reward.experience}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function refreshDailyTasks() {
    updateDailyTasks();
    showNotification('任务列表已刷新！', 'success');
}

// ============================================
// NPC交互（委托给 NPCManager）
// ============================================
function randomizeNPCDialogues() {
    if (typeof NPCManager !== 'undefined') {
        NPCManager.randomizeDialogues();
    }
}

function handleNPCInteraction(npcId) {
    if (typeof NPCManager !== 'undefined') {
        NPCManager.interact(npcId);
    }
}

// ============================================
// 快速行动
// ============================================
function performQuickAction() {
    // 随机选择一个可完成的任务
    const availableTasks = AppState.tasks.filter(t => 
        t.status !== 'completed' && t.status !== 'locked'
    );
    
    if (availableTasks.length === 0) {
        showNotification('没有可完成的任务了！', 'info');
        return;
    }
    
    // 随机选择
    const randomTask = availableTasks[Math.floor(Math.random() * availableTasks.length)];
    
    // 给予部分奖励
    const expReward = Math.floor(randomTask.reward.experience * 0.5);
    const goldReward = Math.floor(randomTask.reward.gold * 0.5);
    
    showRewardPopup({ experience: expReward, gold: goldReward }, `快速完成: ${randomTask.name}`);
    
    // 更新进度
    randomTask.progress = Math.min(100, randomTask.progress + 20);
    if (randomTask.progress === 100) {
        randomTask.status = 'completed';
    }
    
    updateDailyTasks();
    updateStatistics();
}

// ============================================
// 随机事件
// ============================================
function triggerRandomEvent() {
    const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
    
    const body = document.getElementById('event-modal-body');
    body.innerHTML = `
        <div class="event-icon animate-bounce">${event.icon}</div>
        <div class="event-title">${event.title}</div>
        <div class="event-description">${event.description}</div>
        <div class="event-rewards">
            ${event.rewards.experience ? `<span class="event-reward-item"><span>⭐</span> +${event.rewards.experience}</span>` : ''}
            ${event.rewards.gold ? `<span class="event-reward-item"><span>💰</span> +${event.rewards.gold}</span>` : ''}
            ${event.rewards.energy ? `<span class="event-reward-item"><span>⚡</span> +${event.rewards.energy}</span>` : ''}
            ${event.rewards.focus ? `<span class="event-reward-item"><span>🎯</span> +${event.rewards.focus}</span>` : ''}
            ${event.rewards.mood ? `<span class="event-reward-item"><span>😊</span> +${event.rewards.mood}</span>` : ''}
        </div>
        <div class="event-effect">✨ ${event.effect}</div>
    `;
    
    // 应用奖励
    if (event.rewards) {
        showRewardPopup(event.rewards);
        
        if (event.rewards.energy) {
            AppState.user.stats.energy = Math.min(100, AppState.user.stats.energy + event.rewards.energy);
            updateStatusDisplay('energy', AppState.user.stats.energy);
        }
        if (event.rewards.focus) {
            AppState.user.stats.focus = Math.min(100, AppState.user.stats.focus + event.rewards.focus);
            updateStatusDisplay('focus', AppState.user.stats.focus);
        }
        if (event.rewards.mood) {
            AppState.user.stats.mood = Math.min(100, AppState.user.stats.mood + event.rewards.mood);
            updateStatusDisplay('mood', AppState.user.stats.mood);
        }
    }
    
    const modal = new bootstrap.Modal(document.getElementById('eventModal'));
    modal.show();
}

// ============================================
// 每日总结
// ============================================
function showDailySummary() {
    const body = document.getElementById('summary-modal-body');
    const user = AppState.user;
    
    // 计算今日统计
    const completedTasks = AppState.tasks.filter(t => t.status === 'completed').length;
    const totalTasks = AppState.tasks.length;
    const completionRate = Math.round((completedTasks / totalTasks) * 100);
    
    body.innerHTML = `
        <div class="summary-header">
            <div class="summary-icon">📊</div>
            <h4>${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} 总结</h4>
        </div>
        
        <div class="role-stats-grid">
            <div class="role-stat-item">
                <div class="role-stat-label">完成任务</div>
                <div class="role-stat-value" style="color: var(--success-color);">${completedTasks}/${totalTasks}</div>
            </div>
            <div class="role-stat-item">
                <div class="role-stat-label">完成率</div>
                <div class="role-stat-value" style="color: var(--primary-color);">${completionRate}%</div>
            </div>
            <div class="role-stat-item">
                <div class="role-stat-label">获得经验</div>
                <div class="role-stat-value" style="color: var(--primary-color);">+${user.role?.experience || 0}</div>
            </div>
            <div class="role-stat-item">
                <div class="role-stat-label">获得金币</div>
                <div class="role-stat-value" style="color: var(--warning-color);">+${user.role?.gold || 0}</div>
            </div>
        </div>
        
        <div class="summary-chart">
            <canvas id="summaryChart" width="300" height="150"></canvas>
        </div>
        
        <div class="text-center text-muted mt-3">
            <p>继续保持，明天会更棒！💪</p>
        </div>
    `;
    
    const modal = new bootstrap.Modal(document.getElementById('summaryModal'));
    modal.show();

    // 绘制图表（确保 Chart.js 加载后再渲染，非阻塞）
    const renderChart = () => {
        const ctx = document.getElementById('summaryChart');
        if (!ctx) return;
        if (typeof Chart === 'undefined') {
            // Chart.js 尚未加载，动态加载后再重试
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => requestAnimationFrame(() => doRender(ctx));
            document.head.appendChild(script);
        } else {
            requestAnimationFrame(() => doRender(ctx));
        }
    };

    const doRender = (ctx) => {
        if (typeof Chart === 'undefined') return;
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['已完成', '进行中', '待开始'],
                datasets: [{
                    data: [
                        completedTasks,
                        AppState.tasks.filter(t => t.status === 'in_progress').length,
                        AppState.tasks.filter(t => t.status === 'pending').length
                    ],
                    backgroundColor: ['#48bb78', '#ed8936', '#718096']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#a0aec0' }
                    }
                }
            }
        });
    };

    // 延迟到下一帧渲染，避免阻塞首屏
    requestAnimationFrame(renderChart);
}

// ============================================
// 奖励弹窗
// ============================================
function showRewardPopup(rewards, title = '获得奖励！') {
    const body = document.getElementById('reward-body');
    
    let html = '<div class="reward-items">';
    
    if (rewards.experience) {
        AppState.user.role.experience += rewards.experience;
        html += `<div class="reward-item exp">⭐ 经验 +${rewards.experience}</div>`;
        
        // 检查是否升级
        checkLevelUp();
    }
    
    if (rewards.gold) {
        AppState.user.role.gold += rewards.gold;
        html += `<div class="reward-item gold">💰 金币 +${rewards.gold}</div>`;
    }
    
    html += '</div>';
    body.innerHTML = html;
    
    // 更新显示
    updateUserDisplay();
    
    // 显示弹窗
    const modal = new bootstrap.Modal(document.getElementById('rewardModal'));
    modal.show();

    // 播放音效
    if (window.SoundManager) SoundManager.play(rewards.experience ? 'complete' : 'buff');

    // 播放动画效果
    playRewardAnimation();
}

function checkLevelUp() {
    const role = AppState.user.role;

    if (role.experience >= role.experience_needed) {
        // 升级
        role.level++;
        role.experience -= role.experience_needed;
        role.experience_needed = role.level * 100;

        // 显示升级特效
        showLevelUpEffect();
    }
}

function updateRoleDisplay() {
    updateUserDisplay();
}

function updateStatBars() {
    updateUserDisplay();
}

function showLevelUpEffect() {
    const overlay = document.createElement('div');
    overlay.className = 'level-up-overlay';
    overlay.innerHTML = `
        <div class="level-up-content">
            <div class="level-up-title">🎉 等级提升!</div>
            <div class="level-up-number">Lv.${AppState.user.role.level}</div>
            <div class="level-up-rewards">
                <span class="level-up-reward">💰 +50 金币</span>
                <span class="level-up-reward">🎁 神秘礼物</span>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // 增加金币奖励
    AppState.user.role.gold += 50;
    
    // 3秒后移除
    setTimeout(() => {
        overlay.remove();
    }, 3000);
}

function playRewardAnimation() {
    // 创建飞涨的经验值动画
    const popup = document.createElement('div');
    popup.className = 'exp-popup';
    popup.textContent = '+' + (AppState.user?.role?.experience || 0);
    popup.style.left = '50%';
    popup.style.top = '50%';
    document.body.appendChild(popup);
    
    setTimeout(() => popup.remove(), 1000);
}

// ============================================
// 成就解锁全屏特效
// ============================================
function showAchievementUnlock(achievement) {
    // 播放成就解锁音效
    if (window.SoundManager) SoundManager.play('achievement');

    const overlay = document.createElement('div');
    overlay.id = 'ach-unlock-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.85);
        display: flex; align-items: center; justify-content: center;
        animation: achOverlayIn 0.3s ease-out;
    `;
    overlay.innerHTML = `
        <style>
            @keyframes achOverlayIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes achCardIn {
                0% { opacity: 0; transform: scale(0.5) translateY(30px); }
                60% { transform: scale(1.05) translateY(-5px); }
                100% { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes achShine {
                0% { left: -75%; }
                100% { left: 125%; }
            }
            @keyframes achIconBounce {
                0%, 100% { transform: translateY(0) scale(1); }
                30% { transform: translateY(-15px) scale(1.2); }
                50% { transform: translateY(0) scale(0.95); }
                70% { transform: translateY(-5px) scale(1.05); }
            }
            @keyframes achGlow {
                0%, 100% { box-shadow: 0 0 30px rgba(255,215,0,0.3), 0 0 60px rgba(255,215,0,0.1); }
                50% { box-shadow: 0 0 50px rgba(255,215,0,0.5), 0 0 100px rgba(255,215,0,0.2); }
            }
            @keyframes achParticles {
                0% { opacity: 1; transform: translateY(0) scale(1); }
                100% { opacity: 0; transform: translateY(-200px) scale(0); }
            }
        </style>
        <div style="
            text-align: center;
            animation: achCardIn 0.6s cubic-bezier(0.34,1.56,0.64,1);
        ">
            <div style="
                background: linear-gradient(135deg, #1a1a2e, #252540);
                border: 2px solid rgba(255,215,0,0.4);
                border-radius: 24px;
                padding: 40px 48px;
                max-width: 400px;
                position: relative;
                overflow: hidden;
                animation: achGlow 2s ease-in-out infinite;
            ">
                <div style="
                    position: absolute; top: 0; left: 0; right: 0; height: 100%;
                    background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%);
                    animation: achShine 1.5s ease-in-out 0.3s;
                "></div>
                <div style="font-size:14px; color:#ffd700; font-weight:600; margin-bottom:12px; letter-spacing:2px;">
                    ✦ 成 就 解 锁 ✦
                </div>
                <div style="
                    font-size: 72px; margin: 16px 0;
                    animation: achIconBounce 0.8s ease-out 0.3s;
                    text-shadow: 0 0 30px rgba(255,215,0,0.5);
                ">${achievement.icon || '🏆'}</div>
                <div style="font-size: 22px; font-weight: 700; color: #ffd700; margin-bottom: 8px;">
                    ${achievement.name || '未知成就'}
                </div>
                <div style="font-size: 14px; color: #9ca3af; margin-bottom: 20px; line-height: 1.6;">
                    ${achievement.desc || ''}
                </div>
                ${achievement.reward ? `
                    <div style="
                        display: flex; gap: 16px; justify-content: center;
                        background: rgba(255,215,0,0.1);
                        border-radius: 12px; padding: 12px 20px;
                        border: 1px solid rgba(255,215,0,0.2);
                    ">
                        ${achievement.reward.experience ? `<span style="color:#ffd700;">⭐ +${achievement.reward.experience}</span>` : ''}
                        ${achievement.reward.gold ? `<span style="color:#ffd700;">💰 +${achievement.reward.gold}</span>` : ''}
                    </div>
                ` : ''}
            </div>
            <div style="margin-top: 20px; font-size: 13px; color: #6b7280;">
                点击任意处关闭
            </div>
        </div>
        <div id="ach-particle-container" style="position:fixed;inset:0;pointer-events:none;z-index:99998;"></div>
    `;

    document.body.appendChild(overlay);

    // 粒子
    const pContainer = document.getElementById('ach-particle-container');
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        const x = Math.random() * 100;
        const y = 50 + Math.random() * 30;
        const icons = ['⭐', '💰', '✨', '🎉', '🌟', '💎', '🔥', '⚡'];
        const delay = Math.random() * 0.5;
        const dur = 1.5 + Math.random();
        p.style.cssText = `
            position: absolute; left: ${x}%; top: ${y}%;
            font-size: ${12 + Math.random() * 16}px;
            animation: achParticles ${dur}s ease-out ${delay}s forwards;
            opacity: 0;
        `;
        p.textContent = icons[Math.floor(Math.random() * icons.length)];
        pContainer.appendChild(p);
    }

    overlay.addEventListener('click', () => {
        overlay.style.animation = 'achOverlayIn 0.3s ease-out reverse';
        setTimeout(() => overlay.remove(), 300);
    });

    // 3秒自动关闭
    setTimeout(() => {
        if (document.getElementById('ach-unlock-overlay')) {
            overlay.style.animation = 'achOverlayIn 0.3s ease-out reverse';
            setTimeout(() => overlay.remove(), 300);
        }
    }, 4000);
}

// ============================================
// 通知系统（委托至全局 NotificationService）
// ============================================
function showNotification(message, type = 'info') {
    if (typeof NotificationService !== 'undefined' && NotificationService) {
        NotificationService.show(message, type);
    }
}

// ============================================
// 粒子背景
// ============================================
function initParticles() {
    const container = document.getElementById('particles-bg');
    if (!container) return;
    
    // 创建简单粒子效果
    for (let i = 0; i < 8; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = `${10 + i * 10}%`;
        particle.style.background = [
            'var(--primary-color)',
            'var(--warning-color)',
            'var(--success-color)',
            'var(--info-color)'
        ][i % 4];
        particle.style.animationDelay = `${i * 2}s`;
        particle.style.animationDuration = `${20 + i * 2}s`;
        container.appendChild(particle);
    }
}

// ============================================
// 数据重置
// ============================================
function resetData() {
    if (confirm('确定要重置所有数据吗？此操作不可撤销！')) {
        localStorage.clear();
        location.reload();
    }
}

// 导出函数供全局调用
window.toggleSubtask = toggleSubtask;
window.useItem = useItem;
window.openTaskModal = openTaskModal;
window.openAchievementModal = openAchievementModal;
window.openRoleModal = openRoleModal;
window.refreshDailyTasks = refreshDailyTasks;
window.resetData = resetData;
