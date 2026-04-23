/**
 * 校园RPG - AI 任务推荐弹窗
 * 通过 DeepSeek AI 根据用户目标生成个性化任务推荐
 * 使用非流式 API (/api/tasks/recommend)，返回完整 JSON
 */

const RecommendModal = {
    _bsModal: null,

    /**
     * 打开 AI 任务推荐弹窗
     */
    async open() {
        this._ensureModalExists();
        const modal = document.getElementById('recommendModal');
        if (!modal) return;

        const body = document.getElementById('recommend-modal-body');
        const header = document.getElementById('recommend-modal-header');
        const footer = document.getElementById('recommend-modal-footer');

        header.innerHTML = `<h5 class="modal-title">🪄 AI 智能任务推荐</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>`;
        footer.style.display = 'none';

        body.innerHTML = `
            <div class="recommend-loading" id="recommend-loading">
                <div class="recommend-loading-icon">🪄</div>
                <div class="recommend-loading-text">阿游正在分析你的目标...</div>
                <div class="recommend-loading-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
            <div class="recommend-content" id="recommend-content" style="display:none;"></div>
        `;

        this._bsModal = bootstrap.Modal.getOrCreateInstance(modal);
        this._bsModal.show();

        await this._fetchRecommendations();
    },

    /**
     * 确保弹窗 DOM 存在
     */
    _ensureModalExists() {
        if (document.getElementById('recommendModal')) return;

        const modalHTML = `
            <div class="modal fade" id="recommendModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" id="recommend-modal-header" style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;">
                            <h5 class="modal-title">🪄 AI 智能任务推荐</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="recommend-modal-body"></div>
                        <div class="modal-footer" id="recommend-modal-footer" style="display:none;">
                            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    /**
     * 调用非流式推荐接口
     */
    async _fetchRecommendations() {
        const loading = document.getElementById('recommend-loading');
        const content = document.getElementById('recommend-content');
        const footer = document.getElementById('recommend-modal-footer');

        try {
            const token = localStorage.getItem('campus_rpg_token');
            const resp = await fetch(window.apiUrl('/api/tasks/recommend'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({})
            });

            const data = await resp.json();

            loading.style.display = 'none';
            content.style.display = 'block';

            if (!data.success && data.error) {
                this._renderError(data.error);
                footer.style.display = 'flex';
                return;
            }

            const tasks = data.tasks || [];
            if (tasks.length === 0) {
                // AI 返回了内容但不是结构化任务，显示原始文本
                if (data.content) {
                    this._renderRawText(data.content);
                } else {
                    this._renderError('AI 未返回有效任务，请稍后重试');
                }
            } else {
                this._renderTasks(tasks);
            }

            footer.style.display = 'flex';

        } catch (err) {
            console.warn('[RecommendModal] 获取推荐失败:', err);
            loading.style.display = 'none';
            content.style.display = 'block';
            this._renderError(`获取推荐失败: ${err.message}`);
            footer.style.display = 'flex';
        }
    },

    /**
     * 渲染任务卡片
     */
    _renderTasks(tasks) {
        const content = document.getElementById('recommend-modal-body');
        const difficultyColors = { easy: '#4ade80', medium: '#f59e0b', hard: '#ef4444' };
        const categoryLabels = { main: '🎯 主线', side: '📋 支线', daily: '📅 日常', hidden: '🔍 隐藏' };

        content.innerHTML = `
            <div class="recommend-header">
                <div class="recommend-header-icon">✨</div>
                <div class="recommend-header-title">根据你的目标，为你推荐以下任务：</div>
            </div>
            <div class="recommend-tasks" id="recommend-tasks">
                ${tasks.map((task, idx) => `
                    <div class="recommend-task-card" data-idx="${idx}">
                        <div class="recommend-task-header">
                            <div class="recommend-task-name">${task.name || `任务 ${idx + 1}`}</div>
                            <div class="recommend-task-badges">
                                <span class="recommend-badge category">${categoryLabels[task.category] || task.category || '任务'}</span>
                                <span class="recommend-badge difficulty" style="color:${difficultyColors[task.difficulty] || '#6b7280'}">${task.difficulty === 'easy' ? '⭐ 简单' : task.difficulty === 'medium' ? '⭐⭐ 中等' : task.difficulty === 'hard' ? '⭐⭐⭐ 困难' : task.difficulty || ''}</span>
                            </div>
                        </div>
                        <div class="recommend-task-desc">${task.description || ''}</div>
                        <div class="recommend-task-meta">
                            ${task.deadline ? `<span>📅 截止 ${task.deadline}</span>` : ''}
                            ${task.estimated_hours ? `<span>⏱️ ${task.estimated_hours}h</span>` : ''}
                        </div>
                        ${(task.tags || []).length > 0 ? `
                            <div class="recommend-task-tags">
                                ${(task.tags).map(t => `<span class="recommend-tag">${t}</span>`).join('')}
                            </div>
                        ` : ''}
                        ${task.reward ? `
                            <div class="recommend-task-reward">
                                <span class="reward-chip exp">⭐ +${task.reward.experience || 0}</span>
                                ${task.reward.gold ? `<span class="reward-chip gold">💰 +${task.reward.gold}</span>` : ''}
                                ${task.reward.skill_points ? `<span class="reward-chip skill">🎯 +${task.reward.skill_points}</span>` : ''}
                            </div>
                        ` : ''}
                        ${(task.suggested_subtasks || []).length > 0 ? `
                            <div class="recommend-subtasks">
                                <div class="recommend-subtasks-title">子任务：</div>
                                ${(task.suggested_subtasks).map(st => `<div class="recommend-subtask">• ${typeof st === 'string' ? st : (st.name || '')}</div>`).join('')}
                            </div>
                        ` : ''}
                        <div class="recommend-task-actions">
                            <button class="btn btn-sm btn-add-task" onclick="RecommendModal.addToTasks(${idx}, ${this._escapeForHtml(JSON.stringify(task))})">
                                ➕ 添加到我的任务
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * 渲染错误信息
     */
    _renderError(msg) {
        const content = document.getElementById('recommend-modal-body');
        content.innerHTML = `
            <div class="recommend-error">
                <div class="recommend-error-icon">⚠️</div>
                <div>${msg}</div>
                <div class="recommend-error-hint">请检查网络或稍后重试</div>
                <button class="btn btn-outline-primary btn-sm mt-3" onclick="RecommendModal._fetchRecommendations()">
                    🔄 重试
                </button>
            </div>
        `;
    },

    /**
     * 渲染 AI 返回的原始文本（非结构化时）
     */
    _renderRawText(text) {
        const content = document.getElementById('recommend-modal-body');
        content.innerHTML = `
            <div class="recommend-raw">
                <div class="recommend-raw-title">💭 阿游的建议</div>
                <div class="recommend-raw-text">${text.replace(/\n/g, '<br>')}</div>
                <div class="recommend-raw-hint">阿游还没有返回结构化的任务列表，你可以把这段话告诉阿游，让她帮你规划</div>
            </div>
        `;
    },

    /**
     * HTML 转义（用于 JSON 嵌入 onclick）
     */
    _escapeForHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /**
     * 将推荐任务添加到任务列表
     */
    async addToTasks(idx, task) {
        const btn = document.querySelector(`.recommend-task-card[data-idx="${idx}"] .btn-add-task`);
        if (btn) {
            btn.textContent = '添加中...';
            btn.disabled = true;
        }

        try {
            // 解析任务对象（如果是字符串的话）
            let taskObj = task;
            if (typeof task === 'string') {
                try { taskObj = JSON.parse(task); } catch { taskObj = { name: task }; }
            }

            const newTask = {
                id: `rec_${Date.now()}_${idx}`,
                name: taskObj.name || `推荐任务 ${idx + 1}`,
                description: taskObj.description || '',
                category: taskObj.category || 'side',
                category_name: taskObj.category === 'main' ? '主线任务' : taskObj.category === 'daily' ? '日常任务' : taskObj.category === 'hidden' ? '隐藏任务' : '支线任务',
                category_icon: taskObj.category === 'main' ? '🎯' : taskObj.category === 'daily' ? '📅' : taskObj.category === 'hidden' ? '🔍' : '📋',
                status: 'in_progress',
                progress: 0,
                reward: {
                    experience: taskObj.reward?.experience || 20,
                    gold: taskObj.reward?.gold || 10
                },
                deadline: taskObj.deadline || '',
                priority: taskObj.difficulty === 'easy' ? 'low' : taskObj.difficulty === 'hard' ? 'high' : 'medium',
                tags: taskObj.tags || [],
                subtasks: (taskObj.suggested_subtasks || []).map((st, i) => ({
                    id: `rec_${Date.now()}_${idx}_sub_${i}`,
                    name: typeof st === 'string' ? st : (st.name || `子任务 ${i + 1}`),
                    status: 'pending',
                    progress: 0,
                    experience: Math.floor((taskObj.reward?.experience || 20) / Math.max(1, (taskObj.suggested_subtasks || []).length))
                }))
            };

            // 调用 API 添加任务
            const tasksData = await API.getTasks();
            const taskList = tasksData?.tasks || [];
            const existingIds = taskList.map(t => t.id);

            if (!existingIds.includes(newTask.id)) {
                taskList.push(newTask);
                await API.updateTasks({ tasks: taskList, last_updated: new Date().toISOString() });
            }

            if (btn) {
                btn.textContent = '✅ 已添加';
                btn.classList.remove('btn-add-task');
                btn.classList.add('btn-success');
            }

            showNotification(`「${newTask.name}」已添加到任务列表！`, 'success');

            // 通知刷新
            if (window.StateManager) {
                const updated = await API.getTasks();
                if (updated) {
                    StateManager.set('tasks', updated.tasks || []);
                }
            }

        } catch (err) {
            console.error('[RecommendModal] 添加任务失败:', err);
            if (btn) {
                btn.textContent = '添加失败';
                btn.disabled = false;
            }
            showNotification('添加任务失败，请重试', 'error');
        }
    },

    /**
     * 获取最近一次推荐（从后端）
     */
    async getLastRecommendations() {
        try {
            return await API.getRecommendedTasks();
        } catch {
            return { tasks: [], recommended_at: '' };
        }
    }
};

// 全局导出
window.RecommendModal = RecommendModal;
