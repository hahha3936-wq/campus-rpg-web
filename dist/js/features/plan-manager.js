/**
 * 校园RPG - 计划管理模块
 * 管理长期目标和短期计划的 CRUD 操作
 * 支持与任务系统的联动
 */

const PlanManager = {
    // 缓存当前用户数据中的计划
    _userData: null,
    _modalInstance: null,

    /**
     * 初始化模块，加载用户数据
     */
    async init() {
        let data = await API.getUser();
        if (!data || !data.user) {
            // 尝试从 localStorage 读取用户隔离的数据
            const uid = localStorage.getItem('campus_rpg_user') ? JSON.parse(localStorage.getItem('campus_rpg_user')).id : 'guest';
            const userKey = `campus_rpg_user_data_${uid}`;
            try {
                const saved = JSON.parse(localStorage.getItem(userKey) || 'null');
                if (saved?.user) {
                    data = saved;
                }
            } catch {}
        }
        if (!data || !data.user) {
            if (typeof StateManager !== 'undefined' && typeof StateManager.getDefaultUser === 'function') {
                data = StateManager.getDefaultUser();
            } else {
                data = null;
            }
        }
        this._userData = data;
        return this._userData;
    },

    /**
     * 获取长期目标列表
     */
    getLongTermGoals() {
        return this._userData?.user?.long_term_goals || [];
    },

    /**
     * 获取短期计划列表
     */
    getShortTermPlans() {
        return this._userData?.user?.short_term_plans || [];
    },

    /**
     * 获取用户基础信息
     */
    getBasicInfo() {
        return this._userData?.user || {};
    },

    /**
     * 生成唯一 ID
     */
    _generateId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    },

    // ============================================
    // 长期目标 CRUD
    // ============================================

    /**
     * 添加长期目标
     */
    addLongTermGoal(goal) {
        const user = this._userData?.user;
        if (!user) return null;
        if (!user.long_term_goals) user.long_term_goals = [];

        const newGoal = {
            id: this._generateId('lt'),
            title: goal.title || '',
            description: goal.description || '',
            target_date: goal.target_date || '',
            status: goal.status || 'active',
            progress: parseInt(goal.progress) || 0,
            tags: goal.tags || []
        };

        user.long_term_goals.push(newGoal);
        return newGoal;
    },

    /**
     * 更新长期目标
     */
    updateLongTermGoal(id, updates) {
        const user = this._userData?.user;
        if (!user?.long_term_goals) return null;

        const goal = user.long_term_goals.find(g => g.id === id);
        if (!goal) return null;

        Object.assign(goal, {
            title: updates.title ?? goal.title,
            description: updates.description ?? goal.description,
            target_date: updates.target_date ?? goal.target_date,
            status: updates.status ?? goal.status,
            progress: parseInt(updates.progress) ?? goal.progress,
            tags: updates.tags ?? goal.tags
        });

        return goal;
    },

    /**
     * 删除长期目标（同时清除关联的短期计划的 linked_long_term）
     */
    deleteLongTermGoal(id) {
        const user = this._userData?.user;
        if (!user?.long_term_goals) return false;

        const idx = user.long_term_goals.findIndex(g => g.id === id);
        if (idx === -1) return false;

        user.long_term_goals.splice(idx, 1);

        // 清除关联的短期计划
        if (user.short_term_plans) {
            user.short_term_plans.forEach(p => {
                if (p.linked_long_term === id) {
                    p.linked_long_term = null;
                }
            });
        }

        return true;
    },

    /**
     * 长期目标进度增加（被短期计划完成时调用）
     */
    increaseGoalProgress(goalId, amount = 10) {
        const user = this._userData?.user;
        if (!user?.long_term_goals) return;

        const goal = user.long_term_goals.find(g => g.id === goalId);
        if (goal) {
            goal.progress = Math.min(100, (goal.progress || 0) + amount);
            if (goal.progress >= 100) {
                goal.status = 'completed';
            }
        }
    },

    // ============================================
    // 短期计划 CRUD
    // ============================================

    /**
     * 添加短期计划
     */
    addShortTermPlan(plan) {
        const user = this._userData?.user;
        if (!user) return null;
        if (!user.short_term_plans) user.short_term_plans = [];

        const newPlan = {
            id: this._generateId('st'),
            title: plan.title || '',
            description: plan.description || '',
            deadline: plan.deadline || '',
            priority: plan.priority || 'medium',
            status: plan.status || 'pending',
            linked_long_term: plan.linked_long_term || null,
            estimated_hours: parseFloat(plan.estimated_hours) || 0,
            tasks: plan.tasks || []
        };

        user.short_term_plans.push(newPlan);
        return newPlan;
    },

    /**
     * 更新短期计划
     */
    updateShortTermPlan(id, updates) {
        const user = this._userData?.user;
        if (!user?.short_term_plans) return null;

        const plan = user.short_term_plans.find(p => p.id === id);
        if (!plan) return null;

        Object.assign(plan, {
            title: updates.title ?? plan.title,
            description: updates.description ?? plan.description,
            deadline: updates.deadline ?? plan.deadline,
            priority: updates.priority ?? plan.priority,
            status: updates.status ?? plan.status,
            linked_long_term: updates.linked_long_term ?? plan.linked_long_term,
            estimated_hours: updates.estimated_hours ?? plan.estimated_hours,
            tasks: updates.tasks ?? plan.tasks
        });

        return plan;
    },

    /**
     * 删除短期计划
     */
    deleteShortTermPlan(id) {
        const user = this._userData?.user;
        if (!user?.short_term_plans) return false;

        const idx = user.short_term_plans.findIndex(p => p.id === id);
        if (idx === -1) return false;

        user.short_term_plans.splice(idx, 1);
        return true;
    },

    /**
     * 完成短期计划，同时推动关联的长期目标进度
     */
    completeShortTermPlan(id) {
        const user = this._userData?.user;
        if (!user?.short_term_plans) return false;

        const plan = user.short_term_plans.find(p => p.id === id);
        if (!plan) return false;

        plan.status = 'completed';

        // 推动关联的长期目标进度
        if (plan.linked_long_term) {
            this.increaseGoalProgress(plan.linked_long_term, 10);
        }

        return true;
    },

    // ============================================
    // 保存到后端
    // ============================================

    /**
     * 保存所有更改到后端
     */
    async save() {
        if (!this._userData) {
            console.error('[PlanManager] _userData 为空，无法保存。请检查用户是否已登录。');
            return false;
        }

        try {
            const result = await API.updateUserProfile({
                name: this._userData.user?.name,
                school: this._userData.user?.school,
                grade: this._userData.user?.grade,
                apps: this._userData.user?.apps,
                interest: this._userData.user?.interest,
                lazy_level: this._userData.user?.lazy_level,
                party_size: this._userData.user?.party_size,
                goals: this._userData.user?.goals,
                long_term_goals: this._userData.user?.long_term_goals,
                short_term_plans: this._userData.user?.short_term_plans
            });

            if (result?.success) {
                if (result.user) {
                    this._userData = result.user;
                }
                return true;
            } else {
                if (result?.error?.includes('登录') || result?.error?.includes('token') || result?.error?.includes('过期')) {
                    console.warn('[PlanManager] 未登录或登录已过期，数据仅保存在本地:', result.error);
                } else if (result?.message?.includes('保存失败')) {
                    console.error('[PlanManager] 后端保存失败:', result.message);
                } else {
                    console.warn('[PlanManager] 保存返回失败:', result);
                }
                return false;
            }
        } catch (e) {
            console.error('[PlanManager] 保存异常:', e);
            return false;
        }
    },

    // ============================================
    // UI 渲染
    // ============================================

    /**
     * 打开计划管理弹窗（嵌入 settingsModal 的 Tab 内容区）
     */
    openPlanner() {
        this._renderPlannerContent();
    },

    /**
     * 渲染计划管理弹窗内容
     */
    _renderPlannerContent() {
        let body = document.getElementById('settings-modal-body');
        if (!body) {
            body = document.createElement('div');
            body.id = 'settings-modal-body';
            const modal = document.getElementById('settingsModal');
            const modalBody = modal?.querySelector('.modal-body');
            if (modalBody) {
                modalBody.appendChild(body);
            }
        }

        const goals = this.getLongTermGoals();
        const plans = this.getShortTermPlans();
        const basic = this.getBasicInfo();

        body.innerHTML = `
            <div class="profile-tabs">
                <button type="button" class="profile-tab active" data-tab="basic">
                    <span>📋</span> 个人资料
                </button>
                <button type="button" class="profile-tab" data-tab="goals">
                    <span>🎯</span> 长期目标
                </button>
                <button type="button" class="profile-tab" data-tab="plans">
                    <span>📅</span> 短期计划
                </button>
            </div>

            <div class="profile-tab-content" id="tab-basic">
                ${this._renderBasicForm(basic)}
            </div>

            <div class="profile-tab-content" id="tab-goals" style="display:none;">
                ${this._renderGoalsList(goals)}
            </div>

            <div class="profile-tab-content" id="tab-plans" style="display:none;">
                ${this._renderPlansList(plans, goals)}
            </div>

            <div class="profile-actions">
                <button type="button" class="btn btn-primary profile-save-btn" onclick="PlanManager.saveAndClose()">
                    💾 保存设置
                </button>
            </div>
        `;

        // Tab 切换（委托，避免未挂载节点或默认 button 类型导致异常）
        body.onclick = (e) => {
            const tab = e.target && e.target.closest && e.target.closest('.profile-tab');
            if (!tab || !body.contains(tab)) return;
            e.preventDefault();
            body.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            body.querySelectorAll('.profile-tab-content').forEach(c => { c.style.display = 'none'; });
            const target = body.querySelector(`#tab-${tabName}`);
            if (target) target.style.display = 'block';
        };
    },

    /**
     * 渲染个人资料表单
     */
    _renderBasicForm(basic) {
        return `
            <div class="profile-form">
                <div class="form-group">
                    <label>姓名</label>
                    <input type="text" id="pf-name" value="${basic.name || ''}" placeholder="你的名字">
                </div>
                <div class="form-group">
                    <label>学校</label>
                    <input type="text" id="pf-school" value="${basic.school || ''}" placeholder="所在学校">
                </div>
                <div class="form-group">
                    <label>年级</label>
                    <select id="pf-grade">
                        <option value="大一" ${basic.grade === '大一' ? 'selected' : ''}>大一</option>
                        <option value="大二" ${basic.grade === '大二' ? 'selected' : ''}>大二</option>
                        <option value="大三" ${basic.grade === '大三' ? 'selected' : ''}>大三</option>
                        <option value="大四" ${basic.grade === '大四' ? 'selected' : ''}>大四</option>
                        <option value="大五" ${basic.grade === '大五' ? 'selected' : ''}>大五</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>兴趣</label>
                    <input type="text" id="pf-interest" value="${basic.interest || ''}" placeholder="你的兴趣爱好">
                </div>
                <div class="form-group">
                    <label>社团规模</label>
                    <select id="pf-party_size">
                        <option value="1" ${basic.party_size === 1 ? 'selected' : ''}>独自行动</option>
                        <option value="2" ${basic.party_size === 2 ? 'selected' : ''}>2人小队</option>
                        <option value="3" ${basic.party_size === 3 ? 'selected' : ''}>3人小队</option>
                        <option value="4" ${basic.party_size === 4 ? 'selected' : ''}>4人小队</option>
                        <option value="5" ${(basic.party_size || 0) > 4 ? 'selected' : ''}>5人+团队</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>懒散程度（影响任务推荐难度）</label>
                    <div class="lazy-slider-container">
                        <input type="range" id="pf-lazy_level" min="1" max="5" value="${basic.lazy_level || 2}" class="lazy-slider">
                        <div class="lazy-labels">
                            <span>勤奋</span><span>躺平</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染长期目标列表
     */
    _renderGoalsList(goals) {
        if (!goals || goals.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">🎯</div>
                    <div>还没有长期目标</div>
                    <div class="empty-hint">设定目标，让学习更有方向感</div>
                </div>
                <button type="button" class="btn btn-add" onclick="PlanManager.showGoalForm()">+ 添加长期目标</button>

                <!-- 空列表时也必须挂载 #goal-form，否则 showGoalForm 找不到节点 -->
                <div class="inline-form" id="goal-form" style="display:none;">
                    <div class="inline-form-title" id="goal-form-title">添加长期目标</div>
                    <input type="hidden" id="goal-form-id">
                    <div class="form-group">
                        <label>目标名称 *</label>
                        <input type="text" id="goal-form-title-input" placeholder="例如：通过英语四级">
                    </div>
                    <div class="form-group">
                        <label>描述</label>
                        <textarea id="goal-form-desc" placeholder="详细描述这个目标..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>截止日期</label>
                        <input type="date" id="goal-form-date">
                    </div>
                    <div class="form-group">
                        <label>进度</label>
                        <input type="range" id="goal-form-progress" min="0" max="100" value="0" class="lazy-slider">
                        <span id="goal-form-progress-label">0%</span>
                    </div>
                    <div class="form-group">
                        <label>标签（用逗号分隔）</label>
                        <input type="text" id="goal-form-tags" placeholder="英语, 考试, 四级">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="PlanManager.hideGoalForm()">取消</button>
                        <button type="button" class="btn btn-primary" onclick="PlanManager.saveGoal()">保存目标</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="goals-list">
                ${goals.map(g => `
                    <div class="goal-item ${g.status}" data-id="${g.id}">
                        <div class="goal-header">
                            <div class="goal-title">${g.title}</div>
                            <div class="goal-actions">
                                <button type="button" class="btn-icon" onclick="PlanManager.showGoalForm('${g.id}')" title="编辑">✏️</button>
                                <button type="button" class="btn-icon" onclick="PlanManager.deleteGoal('${g.id}')" title="删除">🗑️</button>
                            </div>
                        </div>
                        <div class="goal-desc">${g.description || ''}</div>
                        <div class="goal-meta">
                            <span>📅 截止 ${g.target_date || '未设置'}</span>
                            <span class="goal-status-badge ${g.status}">${g.status === 'completed' ? '✅ 已完成' : g.status === 'active' ? '🔵 进行中' : '⚪ 待开始'}</span>
                        </div>
                        <div class="goal-progress-bar">
                            <div class="goal-progress-fill" style="width:${g.progress || 0}%"></div>
                        </div>
                        <div class="goal-progress-text">进度 ${g.progress || 0}%</div>
                        ${(g.tags || []).length > 0 ? `
                            <div class="goal-tags">
                                ${g.tags.map(t => `<span class="goal-tag">${t}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
            <button type="button" class="btn btn-add" onclick="PlanManager.showGoalForm()">+ 添加长期目标</button>

            <!-- 目标表单弹窗 -->
            <div class="inline-form" id="goal-form" style="display:none;">
                <div class="inline-form-title" id="goal-form-title">添加长期目标</div>
                <input type="hidden" id="goal-form-id">
                <div class="form-group">
                    <label>目标名称 *</label>
                    <input type="text" id="goal-form-title-input" placeholder="例如：通过英语四级">
                </div>
                <div class="form-group">
                    <label>描述</label>
                    <textarea id="goal-form-desc" placeholder="详细描述这个目标..."></textarea>
                </div>
                <div class="form-group">
                    <label>截止日期</label>
                    <input type="date" id="goal-form-date">
                </div>
                <div class="form-group">
                    <label>进度</label>
                    <input type="range" id="goal-form-progress" min="0" max="100" value="0" class="lazy-slider">
                    <span id="goal-form-progress-label">0%</span>
                </div>
                <div class="form-group">
                    <label>标签（用逗号分隔）</label>
                    <input type="text" id="goal-form-tags" placeholder="英语, 考试, 四级">
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="PlanManager.hideGoalForm()">取消</button>
                    <button type="button" class="btn btn-primary" onclick="PlanManager.saveGoal()">保存目标</button>
                </div>
            </div>
        `;
    },

    /**
     * 渲染短期计划列表
     */
    _renderPlansList(plans, goals) {
        if (!plans || plans.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📅</div>
                    <div>还没有短期计划</div>
                    <div class="empty-hint">把大目标拆解成小计划，一步步完成</div>
                </div>
                <button type="button" class="btn btn-add" onclick="PlanManager.showPlanForm()">+ 添加短期计划</button>

                <div class="inline-form" id="plan-form" style="display:none;">
                    <div class="inline-form-title" id="plan-form-title">添加短期计划</div>
                    <input type="hidden" id="plan-form-id">
                    <div class="form-group">
                        <label>计划名称 *</label>
                        <input type="text" id="plan-form-title-input" placeholder="例如：本周高数复习">
                    </div>
                    <div class="form-group">
                        <label>描述</label>
                        <textarea id="plan-form-desc" placeholder="详细描述这个计划..."></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>截止日期</label>
                            <input type="date" id="plan-form-deadline">
                        </div>
                        <div class="form-group">
                            <label>优先级</label>
                            <select id="plan-form-priority">
                                <option value="high">高</option>
                                <option value="medium" selected>中</option>
                                <option value="low">低</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>预计耗时（小时）</label>
                        <input type="number" id="plan-form-hours" min="0" max="200" value="1" placeholder="1">
                    </div>
                    <div class="form-group">
                        <label>关联长期目标</label>
                        <select id="plan-form-linked">
                            <option value="">-- 不关联 --</option>
                            ${(goals || []).map(g => `<option value="${g.id}">${g.title}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="PlanManager.hidePlanForm()">取消</button>
                        <button type="button" class="btn btn-primary" onclick="PlanManager.savePlan()">保存计划</button>
                    </div>
                </div>
            `;
        }

        const priorityColors = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' };
        const statusLabels = { pending: '🔵 待开始', in_progress: '🟡 进行中', completed: '✅ 已完成', paused: '⏸️ 已暂停' };

        return `
            <div class="plans-list">
                ${plans.map(p => {
                    const linkedGoal = goals.find(g => g.id === p.linked_long_term);
                    return `
                        <div class="plan-item ${p.status}" data-id="${p.id}">
                            <div class="plan-header">
                                <div class="plan-title">${p.title}</div>
                                <div class="plan-actions">
                                    <button type="button" class="btn-icon" onclick="PlanManager.showPlanForm('${p.id}')" title="编辑">✏️</button>
                                    <button type="button" class="btn-icon" onclick="PlanManager.deletePlan('${p.id}')" title="删除">🗑️</button>
                                </div>
                            </div>
                            <div class="plan-desc">${p.description || ''}</div>
                            <div class="plan-meta">
                                <span>📅 ${p.deadline || '未设截止日期'}</span>
                                <span style="color:${priorityColors[p.priority] || '#6b7280'}">● ${p.priority === 'high' ? '高优先级' : p.priority === 'medium' ? '中优先级' : '低优先级'}</span>
                                <span>⏱️ 预计${p.estimated_hours || 0}小时</span>
                            </div>
                            ${linkedGoal ? `<div class="plan-linked-goal">🎯 关联目标: ${linkedGoal.title}</div>` : ''}
                            <div class="plan-status">${statusLabels[p.status] || ''}</div>
                        </div>
                    `;
                }).join('')}
            </div>
            <button type="button" class="btn btn-add" onclick="PlanManager.showPlanForm()">+ 添加短期计划</button>

            <!-- 计划表单弹窗 -->
            <div class="inline-form" id="plan-form" style="display:none;">
                <div class="inline-form-title" id="plan-form-title">添加短期计划</div>
                <input type="hidden" id="plan-form-id">
                <div class="form-group">
                    <label>计划名称 *</label>
                    <input type="text" id="plan-form-title-input" placeholder="例如：本周高数复习">
                </div>
                <div class="form-group">
                    <label>描述</label>
                    <textarea id="plan-form-desc" placeholder="详细描述这个计划..."></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>截止日期</label>
                        <input type="date" id="plan-form-deadline">
                    </div>
                    <div class="form-group">
                        <label>优先级</label>
                        <select id="plan-form-priority">
                            <option value="high">高</option>
                            <option value="medium" selected>中</option>
                            <option value="low">低</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>预计耗时（小时）</label>
                    <input type="number" id="plan-form-hours" min="0" max="200" value="1" placeholder="1">
                </div>
                <div class="form-group">
                    <label>关联长期目标</label>
                    <select id="plan-form-linked">
                        <option value="">-- 不关联 --</option>
                        ${goals.map(g => `<option value="${g.id}">${g.title}</option>`).join('')}
                    </select>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="PlanManager.hidePlanForm()">取消</button>
                    <button type="button" class="btn btn-primary" onclick="PlanManager.savePlan()">保存计划</button>
                </div>
            </div>
        `;
    },

    // ============================================
    // 表单操作
    // ============================================

    /**
     * 显示目标表单
     */
    showGoalForm(id = null) {
        const form = document.getElementById('goal-form');
        if (!form) return;

        form.style.display = 'block';

        const titleInput = document.getElementById('goal-form-title-input');
        const descInput = document.getElementById('goal-form-desc');
        const dateInput = document.getElementById('goal-form-date');
        const progressInput = document.getElementById('goal-form-progress');
        const tagsInput = document.getElementById('goal-form-tags');
        const formTitle = document.getElementById('goal-form-title');

        if (id) {
            // 编辑模式
            const goal = this.getLongTermGoals().find(g => g.id === id);
            if (!goal) return;
            formTitle.textContent = '编辑长期目标';
            document.getElementById('goal-form-id').value = id;
            titleInput.value = goal.title || '';
            descInput.value = goal.description || '';
            dateInput.value = goal.target_date || '';
            progressInput.value = goal.progress || 0;
            document.getElementById('goal-form-progress-label').textContent = `${goal.progress || 0}%`;
            tagsInput.value = (goal.tags || []).join(', ');
        } else {
            // 新增模式
            formTitle.textContent = '添加长期目标';
            document.getElementById('goal-form-id').value = '';
            titleInput.value = '';
            descInput.value = '';
            dateInput.value = '';
            progressInput.value = 0;
            document.getElementById('goal-form-progress-label').textContent = '0%';
            tagsInput.value = '';
        }

        // 进度滑块联动
        progressInput.oninput = () => {
            document.getElementById('goal-form-progress-label').textContent = `${progressInput.value}%`;
        };
    },

    /**
     * 隐藏目标表单
     */
    hideGoalForm() {
        const form = document.getElementById('goal-form');
        if (form) form.style.display = 'none';
    },

    /**
     * 保存目标
     */
    saveGoal() {
        const id = document.getElementById('goal-form-id').value;
        const data = {
            title: document.getElementById('goal-form-title-input').value.trim(),
            description: document.getElementById('goal-form-desc').value.trim(),
            target_date: document.getElementById('goal-form-date').value,
            progress: parseInt(document.getElementById('goal-form-progress').value) || 0,
            tags: document.getElementById('goal-form-tags').value.split(',').map(t => t.trim()).filter(Boolean)
        };

        if (!data.title) {
            showNotification('请输入目标名称', 'error');
            return;
        }

        if (id) {
            this.updateLongTermGoal(id, data);
        } else {
            this.addLongTermGoal(data);
        }

        this.hideGoalForm();
        this._refreshGoalsList();
    },

    /**
     * 删除目标
     */
    async deleteGoal(id) {
        if (!confirm('确定删除此目标吗？关联的短期计划将取消关联。')) return;
        this.deleteLongTermGoal(id);
        await this.save();
        this._refreshGoalsList();
    },

    /**
     * 刷新目标列表
     */
    _refreshGoalsList() {
        const container = document.getElementById('tab-goals');
        if (container) {
            container.innerHTML = this._renderGoalsList(this.getLongTermGoals());
        }
    },

    /**
     * 显示计划表单
     */
    showPlanForm(id = null) {
        const form = document.getElementById('plan-form');
        if (!form) return;

        form.style.display = 'block';

        const titleInput = document.getElementById('plan-form-title-input');
        const descInput = document.getElementById('plan-form-desc');
        const deadlineInput = document.getElementById('plan-form-deadline');
        const priorityInput = document.getElementById('plan-form-priority');
        const hoursInput = document.getElementById('plan-form-hours');
        const linkedInput = document.getElementById('plan-form-linked');
        const formTitle = document.getElementById('plan-form-title');
        const goals = this.getLongTermGoals();

        // 重新渲染关联目标下拉框
        if (goals.length > 0) {
            linkedInput.innerHTML = `<option value="">-- 不关联 --</option>` +
                goals.map(g => `<option value="${g.id}">${g.title}</option>`).join('');
        }

        if (id) {
            const plan = this.getShortTermPlans().find(p => p.id === id);
            if (!plan) return;
            formTitle.textContent = '编辑短期计划';
            document.getElementById('plan-form-id').value = id;
            titleInput.value = plan.title || '';
            descInput.value = plan.description || '';
            deadlineInput.value = plan.deadline || '';
            priorityInput.value = plan.priority || 'medium';
            hoursInput.value = plan.estimated_hours || 1;
            linkedInput.value = plan.linked_long_term || '';
        } else {
            formTitle.textContent = '添加短期计划';
            document.getElementById('plan-form-id').value = '';
            titleInput.value = '';
            descInput.value = '';
            deadlineInput.value = '';
            priorityInput.value = 'medium';
            hoursInput.value = 1;
            linkedInput.value = '';
        }
    },

    /**
     * 隐藏计划表单
     */
    hidePlanForm() {
        const form = document.getElementById('plan-form');
        if (form) form.style.display = 'none';
    },

    /**
     * 保存计划
     */
    savePlan() {
        const id = document.getElementById('plan-form-id').value;
        const data = {
            title: document.getElementById('plan-form-title-input').value.trim(),
            description: document.getElementById('plan-form-desc').value.trim(),
            deadline: document.getElementById('plan-form-deadline').value,
            priority: document.getElementById('plan-form-priority').value,
            estimated_hours: parseFloat(document.getElementById('plan-form-hours').value) || 1,
            linked_long_term: document.getElementById('plan-form-linked').value || null
        };

        if (!data.title) {
            showNotification('请输入计划名称', 'error');
            return;
        }

        if (id) {
            this.updateShortTermPlan(id, data);
        } else {
            this.addShortTermPlan(data);
        }

        this.hidePlanForm();
        this._refreshPlansList();
    },

    /**
     * 删除计划
     */
    async deletePlan(id) {
        if (!confirm('确定删除此计划吗？')) return;
        this.deleteShortTermPlan(id);
        await this.save();
        this._refreshPlansList();
    },

    /**
     * 刷新计划列表
     */
    _refreshPlansList() {
        const container = document.getElementById('tab-plans');
        if (container) {
            const goals = this.getLongTermGoals();
            container.innerHTML = this._renderPlansList(this.getShortTermPlans(), goals);
        }
    },

    // ============================================
    // 保存并关闭
    // ============================================

    /**
     * 保存所有更改并关闭弹窗
     */
    async saveAndClose() {
        // 收集个人资料表单数据
        const name = document.getElementById('pf-name')?.value.trim();
        const school = document.getElementById('pf-school')?.value.trim();
        const grade = document.getElementById('pf-grade')?.value;
        const interest = document.getElementById('pf-interest')?.value.trim();
        const party_size = parseInt(document.getElementById('pf-party_size')?.value) || 2;
        const lazy_level = parseInt(document.getElementById('pf-lazy_level')?.value) || 2;

        if (this._userData?.user) {
            this._userData.user.name = name;
            this._userData.user.school = school;
            this._userData.user.grade = grade;
            this._userData.user.interest = interest;
            this._userData.user.party_size = party_size;
            this._userData.user.lazy_level = lazy_level;
        }

        const success = await this.save();

        if (success) {
            showNotification('设置已保存！', 'success');
            // 通知 StateManager 刷新
            if (window.StateManager) {
                StateManager.set('user', this._userData);
            }
            // 更新 AppState
            if (window.AppState) {
                AppState.user = this._userData;
            }
        } else {
            showNotification('保存失败，请重试', 'error');
        }

        // 关闭设置弹窗
        const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
        if (modal) modal.hide();
    },

    /**
     * 打开个人设置（由外部调用）
     */
    async openProfileEditor() {
        await this.init();
        this._renderPlannerContent();
    }
};

// 全局导出
window.PlanManager = PlanManager;
