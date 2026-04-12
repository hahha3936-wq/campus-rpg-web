/**
 * 校园RPG - UI组件模块
 * 提供可复用的UI组件生成函数
 */

/**
 * 全局通知服务：统一所有页面的 toast 提示
 * 在 Components 对象上实现，并通过 window.showNotification 全局暴露
 */
const NotificationService = {
    _containerId: 'notification-container',

    /**
     * 显示通知 toast
     * @param {string} message - 通知文本
     * @param {string} type - 类型：success | error | warning | info
     * @param {number} duration - 显示时长（毫秒），默认 3000
     */
    show(message, type = 'info', duration = 3000) {
        let container = document.getElementById(this._containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = this._containerId;
            container.className = 'notification-container';
            document.body.appendChild(container);
        }

        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${icons[type] || icons.info}</span>
            <span class="notification-text">${message}</span>
        `;

        container.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 300);
        }, duration);
    }
};

/** 全局暴露，兼容所有模块 */
window.NotificationService = NotificationService;
window.showNotification = (msg, type, duration) => NotificationService.show(msg, type, duration);

const Components = {
    // ============================================
    // 任务卡片组件
    // ============================================
    
    /**
     * 生成任务卡片HTML
     */
    taskCard(task, options = {}) {
        const {
            onSubtaskClick = null,
            onTaskClick = null,
            showActions = true
        } = options;
        
        const statusLabels = {
            'in_progress': '进行中',
            'completed': '已完成',
            'pending': '待开始',
            'locked': '🔒 锁定'
        };
        
        return `
            <div class="task-card ${task.category}" ${onTaskClick ? `onclick="${onTaskClick}('${task.id}')"` : ''}>
                <div class="task-card-header">
                    <div class="task-card-title">
                        <span>${task.category_icon || '📋'}</span>
                        <h4>${task.name}</h4>
                        <span class="task-category-badge badge-${task.category}">${task.category_name || ''}</span>
                    </div>
                    <span class="task-status status-${task.status}">
                        ${statusLabels[task.status] || task.status}
                    </span>
                </div>
                <p class="task-description">${task.description || ''}</p>
                
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
                                     ${onSubtaskClick ? `onclick="${onSubtaskClick}('${task.id}', '${sub.id}', event)"` : ''}></div>
                                <span class="subtask-text ${sub.status === 'completed' ? 'completed' : ''}">${sub.name}</span>
                                ${sub.experience ? `<span class="subtask-reward">+${sub.experience}经验</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <div class="task-footer">
                    <div class="task-rewards">
                        ${task.reward?.experience ? `<span class="task-reward-item exp">⭐ +${task.reward.experience}</span>` : ''}
                        ${task.reward?.gold ? `<span class="task-reward-item gold">💰 +${task.reward.gold}</span>` : ''}
                        ${task.reward?.skill_points ? `<span class="task-reward-item skill">📈 +${task.reward.skill_points}技能点</span>` : ''}
                    </div>
                    ${task.deadline ? `<div class="task-deadline">📅 ${task.deadline}</div>` : ''}
                </div>
            </div>
        `;
    },
    
    /**
     * 渲染任务列表
     */
    renderTaskList(tasks, container, options = {}) {
        if (!tasks || tasks.length === 0) {
            container.innerHTML = '<div class="text-center text-muted p-4">暂无任务</div>';
            return;
        }
        
        container.innerHTML = tasks.map(task => this.taskCard(task, options)).join('');
    },
    
    // ============================================
    // 成就卡片组件
    // ============================================
    
    /**
     * 生成成就卡片HTML
     */
    achievementCard(achievement) {
        const statusClass = achievement.status === 'unlocked' ? 'unlocked' : 
                           achievement.status === 'in_progress' ? 'in_progress' : 'locked';
        
        return `
            <div class="achievement-card ${statusClass}">
                <div class="achievement-icon">${achievement.icon || '🏆'}</div>
                <div class="achievement-info">
                    <div class="achievement-name">${achievement.name}</div>
                    <div class="achievement-desc">${achievement.desc || ''}</div>
                    
                    ${achievement.status === 'in_progress' ? `
                        <div class="achievement-progress">
                            <div class="achievement-progress-bar">
                                <div class="achievement-progress-fill" style="width: ${(achievement.progress / achievement.total) * 100}%"></div>
                            </div>
                            <div class="achievement-progress-text">进度: ${achievement.progress}/${achievement.total}</div>
                        </div>
                    ` : ''}
                    
                    ${achievement.status === 'locked' && achievement.hint ? `
                        <div class="achievement-hint">💡 ${achievement.hint}</div>
                    ` : ''}
                    
                    ${achievement.status === 'unlocked' && achievement.date ? `
                        <div class="achievement-date">✅ ${achievement.date}</div>
                    ` : ''}
                </div>
            </div>
        `;
    },
    
    /**
     * 渲染成就列表
     */
    renderAchievementList(achievements, container) {
        if (!achievements || Object.keys(achievements).length === 0) {
            container.innerHTML = '<div class="text-center text-muted p-4">暂无成就</div>';
            return;
        }
        
        let html = '';
        const categoryIcons = {
            '学业成就': '📚',
            '探索成就': '🗺️',
            '社交成就': '👥',
            '隐藏成就': '🔍'
        };
        
        for (const [category, items] of Object.entries(achievements)) {
            if (!items || items.length === 0) continue;
            
            html += `
                <div class="mb-4">
                    <h5 class="mb-3">${categoryIcons[category] || '📋'} ${category}</h5>
                    ${items.map(ach => this.achievementCard(ach)).join('')}
                </div>
            `;
        }
        
        container.innerHTML = html || '<div class="text-center text-muted p-4">暂无成就</div>';
    },
    
    // ============================================
    // 角色状态卡片组件
    // ============================================
    
    /**
     * 生成状态卡片HTML
     */
    statusCard(stat, value, icon, color) {
        return `
            <div class="status-card ${stat}-card">
                <div class="status-header">
                    <span class="status-icon">${icon}</span>
                    <span class="status-title">${stat === 'energy' ? '能量值' : 
                                              stat === 'focus' ? '专注力' : 
                                              stat === 'mood' ? '心情值' : '压力值'}</span>
                </div>
                <div class="status-value" style="color: ${color}">${value}</div>
                <div class="progress-bar-custom">
                    <div class="progress-fill ${stat}-fill" style="width: ${value}%"></div>
                </div>
            </div>
        `;
    },
    
    /**
     * 渲染状态网格
     */
    renderStatusGrid(container, stats) {
        const {
            energy = 100,
            focus = 100,
            mood = 100,
            stress = 20
        } = stats;
        
        container.innerHTML = `
            ${this.statusCard('energy', energy, '⚡', '#ffd93d')}
            ${this.statusCard('focus', focus, '🎯', '#667eea')}
            ${this.statusCard('mood', mood, '😊', '#48bb78')}
            ${this.statusCard('stress', stress, '😰', '#f56565')}
        `;
    },
    
    // ============================================
    // NPC组件
    // ============================================
    
    /**
     * 生成NPC卡片HTML
     */
    npcCard(npcId, npcData, dialogue) {
        const names = {
            naruto: { name: '漩涡鸣人老师', icon: '🍥' },
            sasuke: { name: '宇智波佐助助教', icon: '⚡' }
        };
        
        const info = names[npcId] || { name: '未知NPC', icon: '👤' };
        const maxAffection = npcData.max_affection || 1;
        const affectionPercent = (npcData.affection / maxAffection) * 100;
        
        return `
            <div class="npc-character" data-npc="${npcId}">
                <div class="npc-avatar">
                    <span class="npc-icon">${info.icon}</span>
                </div>
                <div class="npc-name">${info.name}</div>
                <div class="npc-affection">
                    <span class="affection-label">好感度</span>
                    <div class="affection-bar">
                        <div class="affection-fill" style="width: ${affectionPercent}%"></div>
                    </div>
                    <span class="affection-value">${npcData.affection}/${npcData.max_affection}</span>
                </div>
                <div class="npc-dialogue">
                    <div class="dialogue-bubble" id="${npcId}-dialogue">
                        ${dialogue || '点击获取新对话...'}
                    </div>
                </div>
            </div>
        `;
    },
    
    // ============================================
    // 背包物品组件
    // ============================================
    
    /**
     * 生成物品卡片HTML
     */
    inventoryItem(item, onUse = null) {
        return `
            <div class="inventory-item" ${onUse ? `onclick="${onUse}('${item.name}')"` : ''}>
                <div class="inventory-icon">${item.icon || '📦'}</div>
                <div class="inventory-name">${item.name}</div>
                <div class="inventory-quantity">x${item.quantity}</div>
            </div>
        `;
    },
    
    /**
     * 渲染背包
     */
    renderInventory(container, items, onUse = null) {
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="inventory-empty">
                    <div class="inventory-empty-icon">🎒</div>
                    <p>背包空空如也</p>
                    <p class="text-muted">去完成任务获取道具吧！</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="inventory-grid">
                ${items.map(item => this.inventoryItem(item, onUse)).join('')}
            </div>
        `;
    },
    
    // ============================================
    // 事件卡片组件
    // ============================================
    
    /**
     * 生成事件卡片HTML
     */
    eventCard(event) {
        return `
            <div class="event-modal-content">
                <div class="event-icon animate-bounce">${event.icon}</div>
                <div class="event-title">${event.title}</div>
                <div class="event-description">${event.description}</div>
                <div class="event-rewards">
                    ${event.rewards?.experience ? `<span class="event-reward-item"><span>⭐</span> +${event.rewards.experience}</span>` : ''}
                    ${event.rewards?.gold ? `<span class="event-reward-item"><span>💰</span> +${event.rewards.gold}</span>` : ''}
                    ${event.rewards?.energy ? `<span class="event-reward-item"><span>⚡</span> +${event.rewards.energy}</span>` : ''}
                    ${event.rewards?.focus ? `<span class="event-reward-item"><span>🎯</span> +${event.rewards.focus}</span>` : ''}
                    ${event.rewards?.mood ? `<span class="event-reward-item"><span>😊</span> +${event.rewards.mood}</span>` : ''}
                </div>
                <div class="event-effect">✨ ${event.effect}</div>
            </div>
        `;
    },
    
    // ============================================
    // 奖励弹窗组件
    // ============================================
    
    /**
     * 生成奖励弹窗HTML
     */
    rewardModal(rewards, title = '获得奖励！') {
        return `
            <div class="reward-modal-content">
                <div class="reward-header">
                    <span class="reward-icon animate-bounce">🎉</span>
                    <h4>${title}</h4>
                </div>
                <div class="reward-body">
                    <div class="reward-items">
                        ${rewards?.experience ? `<div class="reward-item exp">⭐ 经验 +${rewards.experience}</div>` : ''}
                        ${rewards?.gold ? `<div class="reward-item gold">💰 金币 +${rewards.gold}</div>` : ''}
                        ${rewards?.item ? `<div class="reward-item item">🎁 ${rewards.item}</div>` : ''}
                    </div>
                </div>
                <div class="reward-footer">
                    <button type="button" class="btn btn-primary" data-bs-dismiss="modal">领取</button>
                </div>
            </div>
        `;
    },
    
    // ============================================
    // 每日任务推荐组件
    // ============================================
    
    /**
     * 生成每日推荐任务项HTML
     */
    dailyTaskItem(task, onClick = null) {
        return `
            <div class="daily-task-item" ${onClick ? `onclick="${onClick}('${task.id}')"` : ''}>
                <div class="task-priority priority-${task.priority || 'medium'}"></div>
                <div class="task-info">
                    <div class="task-name">${task.category_icon || '📋'} ${task.name}</div>
                    <div class="task-meta">${task.category_name || ''} | 进度: ${task.progress}%</div>
                </div>
                <div class="task-reward">
                    ${task.reward?.experience ? `<span class="reward-badge">⭐ +${task.reward.experience}</span>` : ''}
                </div>
            </div>
        `;
    },
    
    /**
     * 渲染每日推荐列表
     */
    renderDailyTasks(container, tasks, onClick = null) {
        if (!tasks || tasks.length === 0) {
            container.innerHTML = '<div class="text-center text-muted p-4">今日暂无推荐任务</div>';
            return;
        }
        
        container.innerHTML = tasks.slice(0, 3).map(task => this.dailyTaskItem(task, onClick)).join('');
    },
    
    // ============================================
    // 标签切换组件
    // ============================================
    
    /**
     * 生成标签切换HTML
     */
    tabSwitcher(tabs, container, onTabChange) {
        container.innerHTML = tabs.map(tab => `
            <button class="${tab.active ? 'active' : ''}" data-category="${tab.value}">
                ${tab.label}
            </button>
        `).join('');
        
        // 绑定事件
        container.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (onTabChange) onTabChange(btn.dataset.category);
            });
        });
    },
    
    // ============================================
    // 通知组件（委托至全局 NotificationService）
    // ============================================

    /**
     * 显示通知（委托至 NotificationService.show）
     */
    showNotification(message, type = 'info', duration = 3000) {
        NotificationService.show(message, type, duration);
    },

    /**
     * 创建通知容器（如不存在则自动由 NotificationService 创建）
     */
    createNotificationContainer() {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
        return container;
    },
    
    /**
     * 格式化日期
     */
    formatDate(date) {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },
    
    /**
     * 格式化时间
     */
    formatTime(date) {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
};

// 辅助函数
function createNotificationContainer() {
    return Components.createNotificationContainer();
}

// 导出
window.Components = Components;
