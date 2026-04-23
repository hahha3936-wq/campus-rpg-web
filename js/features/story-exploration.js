/**
 * 校园RPG - 剧情探索系统
 * 迷雾地图叠加层、隐藏探索点、角落彩蛋触发
 */

(function() {
    'use strict';

    const StoryExploration = {
        _explorationData: null,

        /**
         * 加载探索进度
         */
        async loadProgress() {
            try {
                const resp = await window.Auth.apiFetch('/api/story/progress');
                if (resp && resp.ok) {
                    const data = await resp.json();
                    if (data.success && data.progress) {
                        this._explorationData = data.progress.exploration_progress || {};
                        return data.progress;
                    }
                }
            } catch (e) {
                console.error('[StoryExploration] 加载探索数据失败:', e);
            }
            return null;
        },

        /**
         * 获取探索状态
         */
        getStatus() {
            return this._explorationData || { discovered_areas: [], total_clues_found: 0 };
        },

        /**
         * 检查并触发角落彩蛋
         * @param {string} locationId - 地点ID
         * @param {Object} locationData - 地点数据
         */
        async checkCornerEasterEgg(locationId, locationData) {
            // 检查是否是剧情相关的探索点
            const storyLocations = [
                'scenic_corner', 'library_2f', 'sports_field_corner',
                'teaching_abc_top', 'canteen', 'library_study_room'
            ];
            if (!storyLocations.includes(locationId)) return null;

            try {
                const resp = await window.Auth.apiFetch('/api/story/hidden');
                if (resp && resp.ok) {
                    const data = await resp.json();
                    // 检查是否有可触发的隐藏任务
                    const task = (data.hidden_tasks || []).find(ht =>
                        !ht.is_completed &&
                        (ht.trigger_type === 'map_click' || ht.trigger_type === 'time')
                    );
                    if (task) {
                        // 检查触发条件
                        if (this._checkTrigger(task, locationId)) {
                            return this._triggerHiddenTask(task);
                        }
                    }
                }
            } catch (e) {
                console.error('[StoryExploration] 检查角落彩蛋失败:', e);
            }
            return null;
        },

        _checkTrigger(task, locationId) {
            const cond = task.trigger_condition || '';
            if (task.trigger_type === 'map_click') {
                if (cond.includes('exploration_progress')) {
                    const match = cond.match(/exploration_progress\s*>=?\s*(\d+)/);
                    if (match) {
                        const required = parseInt(match[1]);
                        const current = this._getExplorationProgress();
                        return current >= required;
                    }
                }
                return true;
            }
            if (task.trigger_type === 'time') {
                const hour = new Date().getHours();
                if (task.task_id.includes('fresh_002')) return hour >= 22; // 深夜食堂
                if (task.task_id.includes('career_002')) return hour >= 23; // 深夜自习室
            }
            return false;
        },

        _getExplorationProgress() {
            if (!this._explorationData) return 0;
            const areas = this._explorationData.discovered_areas || [];
            // 假设总共24个探索点
            return Math.round((areas.length / 24) * 100);
        },

        async _triggerHiddenTask(task) {
            // 显示隐藏任务发现通知
            if (window.StoryClue) {
                window.StoryClue.showNotification({
                    name: task.name,
                    description: task.description,
                    rarity: 'epic'
                });
            }
            return task;
        },

        /**
         * 完成隐藏任务
         */
        async completeHiddenTask(taskId) {
            try {
                const resp = await window.Auth.apiFetch(`/api/story/hidden/${taskId}/complete`, {
                    method: 'POST'
                });
                if (resp && resp.ok) {
                    const data = await resp.json();
                    if (data.success && !data.already_completed) {
                        window.showNotification(`隐藏任务「${data.task_name}」完成！`, 'success');
                        if (data.rewards) {
                            const rewards = data.rewards;
                            let msg = '';
                            if (rewards.experience) msg += `经验+${rewards.experience} `;
                            if (rewards.gold) msg += `金币+${rewards.gold} `;
                            if (rewards.clues) msg += `获得${rewards.clues.length}条线索 `;
                            if (msg) window.showNotification(msg.trim(), 'success');
                        }
                    }
                    return data;
                }
            } catch (e) {
                console.error('[StoryExploration] 完成隐藏任务失败:', e);
            }
            return null;
        },

        /**
         * 获取所有隐藏任务状态
         */
        async getHiddenTasks() {
            try {
                const resp = await window.Auth.apiFetch('/api/story/hidden');
                if (resp && resp.ok) {
                    return await resp.json();
                }
            } catch (e) {
                console.error('[StoryExploration] 获取隐藏任务失败:', e);
            }
            return null;
        },

        /**
         * 获取特定地点的剧情提示
         */
        getLocationStoryHint(locationId) {
            const hints = {
                'teaching_complex': '这里有鸣人老师的实验室，也许藏着学习的秘诀...',
                'library': '图书馆的角落里似乎有些不寻常的符号...',
                'sports_field': '操场跑道的一角，草坪下面似乎有空洞...',
                'canteen': '深夜22:00后，这个窗口会亮起温暖的灯光...',
                'library_study_room': '23:00后的自习室，总有一盏灯为你而亮...',
                'history_archive': '校史馆的照片墙上，缺失了一个年份...'
            };
            return hints[locationId] || null;
        }
    };

    window.StoryExploration = StoryExploration;
})();
