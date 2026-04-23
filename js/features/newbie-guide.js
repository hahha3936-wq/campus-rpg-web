/**
 * 校园RPG - 新手引导与用户画像采集模块
 * 3步式引导流程：欢迎页 -> 基础画像采集 -> AR新手体验
 *
 * 触发条件：新用户首次登录（days_active === 1 且 localStorage 无完成标记）
 * 独立于现有 Onboarding 模块，使用全屏模态对话框而非元素高亮
 */

(function () {
    'use strict';

    const STORAGE_KEY_DONE = 'campus_rpg_newbie_done';

    /**
     * NewbieGuide 模块
     * 提供新用户首次登录引导的完整流程控制
     */
    const NewbieGuide = {
        /** 当前步骤索引，0-based */
        _step: 0,

        /** 模态框根 DOM 元素 */
        _modal: null,

        /** 遮罩层 DOM 元素 */
        _overlay: null,

        /** 用户采集的画像数据 */
        _profileData: {},

        /**
         * 判断是否需要显示新手引导
         * 条件：localStorage 无完成标记 且 AppState.user.days_active === 1
         */
        shouldShow() {
            if (localStorage.getItem(STORAGE_KEY_DONE)) return false;
            const user = window.AppState?.user;
            if (!user) return false;
            // days_active === 1 表示新注册用户（后端默认设置为1）
            return (user.days_active === 1 || user.days_active === undefined);
        },

        /**
         * 启动引导（供外部调用）
         */
        start() {
            if (!this.shouldShow()) return;
            this._step = 0;
            this._profileData = {};
            this._renderOverlay();
            this._showStep(0);
        },

        /**
         * 创建全屏遮罩层
         */
        _renderOverlay() {
            if (this._overlay) this._overlay.remove();

            const overlay = document.createElement('div');
            overlay.id = 'newbie-overlay';
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:9996;',
                'background:rgba(0,0,0,0.75);',
                'display:flex;align-items:center;justify-content:center;',
                'font-family:\'Noto Sans SC\',sans-serif;'
            ].join('');
            document.body.appendChild(overlay);
            this._overlay = overlay;
        },

        /**
         * 显示指定步骤
         * @param {number} index 步骤索引
         */
        _showStep(index) {
            this._step = index;
            if (this._modal) this._modal.remove();

            switch (index) {
                case 0: this._renderWelcome(); break;
                case 1: this._renderProfile(); break;
                case 2: this._renderAR(); break;
                default: this._finish(); return;
            }
        },

        // ============================================
        // Step 0: 欢迎页
        // ============================================
        _renderWelcome() {
            const modal = this._createModal(480, '欢迎来到校园RPG！');
            const body = modal.querySelector('.ng-modal-body');
            body.innerHTML = this._tpl('welcome');
            this._overlay.appendChild(modal);
            this._modal = modal;

            modal.querySelector('#ng-welcome-next').addEventListener('click', () => {
                this._showStep(1);
            });
        },

        // ============================================
        // Step 1: 基础画像采集
        // ============================================
        _renderProfile() {
            const modal = this._createModal(520, '设定你的角色');
            const body = modal.querySelector('.ng-modal-body');
            body.innerHTML = this._tpl('profile');
            this._overlay.appendChild(modal);
            this._modal = modal;

            // 选填区折叠/展开
            const toggleBtn = modal.querySelector('#ng-optional-toggle');
            const optionalSection = modal.querySelector('#ng-optional-section');
            toggleBtn.addEventListener('click', () => {
                const isHidden = optionalSection.style.display === 'none';
                optionalSection.style.display = isHidden ? 'block' : 'none';
                toggleBtn.textContent = isHidden ? '收起选填项 ▲' : '添加更多画像 ▼';
            });

            // 跳过按钮
            modal.querySelector('#ng-skip').addEventListener('click', () => {
                this._showStep(2);
            });

            // 提交按钮
            modal.querySelector('#ng-submit-profile').addEventListener('click', async () => {
                const grade = modal.querySelector('#ng-grade')?.value?.trim();
                const school = modal.querySelector('#ng-school')?.value?.trim();
                const major = modal.querySelector('#ng-major')?.value?.trim();

                // 必填验证
                if (!grade || !school || !major) {
                    this._showError(modal, '请填写年级、院校和专业（均为必填项）');
                    return;
                }

                this._profileData = {
                    grade: grade,
                    school: school,
                    major: major,
                    // 选填字段
                    interests: this._getCheckedValues(modal, 'interest'),
                    goals: this._getCheckedValues(modal, 'goal'),
                    daily_routine: modal.querySelector('#ng-routine')?.value || ''
                };

                // 提交到后端
                const btn = modal.querySelector('#ng-submit-profile');
                btn.disabled = true;
                btn.textContent = '保存中...';

                try {
                    await this._saveProfile(this._profileData);
                    // 合并到本地 AppState
                    if (window.AppState?.user) {
                        Object.assign(window.AppState.user, {
                            grade: this._profileData.grade,
                            school: this._profileData.school,
                            major: this._profileData.major
                        });
                    }
                    this._showStep(2);
                } catch (err) {
                    btn.disabled = false;
                    btn.textContent = '保存失败，点击重试';
                    this._showError(modal, '保存失败：' + (err.message || '请检查网络后重试'));
                }
            });
        },

        /**
         * 将画像数据提交到后端 /api/user/profile
         * @param {object} data 画像数据
         */
        async _saveProfile(data) {
            const resp = await window.Auth.apiFetch('/api/user/profile', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (!resp || !resp.ok) {
                const err = await resp?.json().catch(() => ({}));
                throw new Error(err.message || '保存失败');
            }
            return resp.json();
        },

        /**
         * 从复选框组中获取已选值
         */
        _getCheckedValues(modal, name) {
            const checked = modal.querySelectorAll(`input[name="${name}"]:checked`);
            return Array.from(checked).map(el => el.value);
        },

        /**
         * 在模态框底部显示错误提示
         */
        _showError(modal, message) {
            const errEl = modal.querySelector('#ng-error');
            if (errEl) {
                errEl.textContent = message;
                errEl.style.display = 'block';
                setTimeout(() => { errEl.style.display = 'none'; }, 4000);
            }
        },

        // ============================================
        // Step 2: AR 新手体验
        // ============================================
        _renderAR() {
            const modal = this._createModal(480, 'AR 新手体验');
            const body = modal.querySelector('.ng-modal-body');
            body.innerHTML = this._tpl('ar');
            this._overlay.appendChild(modal);
            this._modal = modal;

            // 监听 AR 识别成功事件
            this._arHandler = this._onARFound.bind(this);
            window.addEventListener('ar-marker-found', this._arHandler);

            // 启动AR按钮
            modal.querySelector('#ng-start-ar').addEventListener('click', () => {
                if (window.ARUI && window.ARUI.toggleAR) {
                    window.ARUI.toggleAR();
                    window.showNotification('请将摄像头对准 AR 标记', 'info');
                } else {
                    window.showNotification('AR 功能暂不可用，请稍后重试', 'warning');
                }
            });

            // 跳过 AR（直接完成）
            modal.querySelector('#ng-skip-ar').addEventListener('click', () => {
                window.removeEventListener('ar-marker-found', this._arHandler);
                this._arHandler = null;
                this._triggerAIShortcutTask();
                this._finish();
            });
        },

        /**
         * AR 识别成功回调
         */
        _onARFound() {
            window.removeEventListener('ar-marker-found', this._arHandler);
            this._arHandler = null;

            // 显示奖励动画
            this._showRewardAnimation();

            // 延迟发放奖励，确保动画有足够时间展示
            setTimeout(() => {
                this._grantReward();
                this._triggerAIShortcutTask();
                this._finish();
            }, 2500);
        },

        /**
         * 显示奖励动画（仅更新模态框 body 内容，保留 header）
         */
        _showRewardAnimation() {
            if (!this._modal) return;
            const body = this._modal.querySelector('.ng-modal-body');
            if (!body) return;

            body.innerHTML = this._tpl('reward');
            body.style.textAlign = 'center';
        },

        /**
         * 发放新手奖励（金币+100，经验+50）
         */
        async _grantReward() {
            const user = window.AppState?.user;
            if (user) {
                user.role = user.role || {};
                user.role.gold = (user.role.gold || 0) + 100;
                user.role.experience = (user.role.experience || 0) + 50;

                // 尝试同步到后端
                window.Auth.apiFetch('/api/user', {
                    method: 'POST',
                    body: JSON.stringify({ gold: user.role.gold, experience: user.role.experience })
                }).catch(() => {});
            }

            // 显示系统通知
            if (window.showNotification) {
                window.showNotification('AR识别成功！获得 新手礼包：金币+100，经验+50', 'success');
            }
        },

        /**
         * 触发 AI 生成新手快捷任务（通过 chat API）
         * 若调用失败则静默降级，不阻塞流程
         */
        async _triggerAIShortcutTask() {
            try {
                const resp = await window.Auth.apiFetch('/api/chat/generate-task', {
                    method: 'POST',
                    body: JSON.stringify({
                        context: 'newbie_shortcut',
                        user_profile: this._profileData,
                        task_type: '主线'
                    })
                });
                if (resp && resp.ok) {
                    console.log('[NewbieGuide] AI 新手任务生成成功');
                }
            } catch (e) {
                // 静默降级
                console.warn('[NewbieGuide] AI 任务生成调用失败（可接受）', e.message);
            }
        },

        // ============================================
        // 完成引导
        // ============================================
        _finish() {
            localStorage.setItem(STORAGE_KEY_DONE, 'true');
            if (this._modal) { this._modal.remove(); this._modal = null; }
            if (this._overlay) { this._overlay.remove(); this._overlay = null; }

            // 通知游戏主循环刷新界面
            if (window.AppState?.refresh) window.AppState.refresh();
        },

        // ============================================
        // DOM 工厂方法
        // ============================================

        /**
         * 创建标准模态框容器
         * @param {number} maxWidth 最大宽度（px）
         * @param {string} title 标题文本
         * @returns {HTMLElement}
         */
        _createModal(maxWidth, title) {
            const modal = document.createElement('div');
            modal.className = 'ng-modal';
            modal.style.cssText = [
                `max-width:${maxWidth}px;width:92vw;`,
                'position:relative;z-index:9997;',
                'background:#1D2B53;',
                'border:3px solid #FFF1E8;',
                'box-shadow:6px 6px 0 #000,0 0 40px rgba(41,173,255,0.15);',
                'border-radius:4px;',
                'animation:ngModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1);',
                'font-family:\'Noto Sans SC\',sans-serif;'
            ].join('');

            const header = document.createElement('div');
            header.className = 'ng-modal-header';
            header.style.cssText = [
                'background:linear-gradient(180deg,#5D275D,#3a1940);',
                'border-bottom:3px solid #B13E53;',
                'padding:14px 18px;',
                'display:flex;align-items:center;gap:10px;'
            ].join('');
            header.innerHTML = `<span style="font-size:20px;">🎮</span><span style="font-size:12px;color:#FFCD75;font-family:\'Press Start 2P\',monospace;">${title}</span>`;
            modal.appendChild(header);

            const body = document.createElement('div');
            body.className = 'ng-modal-body';
            body.style.cssText = 'padding:20px 18px;color:#F4F4F4;';
            modal.appendChild(body);

            return modal;
        },

        // ============================================
        // 模板
        // ============================================

        /** 内联 CSS（每次渲染重新注入，确保样式隔离） */
        _css() {
            return `<style>
            @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
            @keyframes ngModalIn {
                from{opacity:0;transform:scale(0.85);}
                to{opacity:1;transform:scale(1);}
            }
            @keyframes ngRewardPop {
                0%{transform:scale(0.5);opacity:0;}
                60%{transform:scale(1.1);}
                100%{transform:scale(1);opacity:1;}
            }
            @keyframes ngFloat {
                0%,100%{transform:translateY(0);}
                50%{transform:translateY(-6px);}
            }
            .ng-welcome-icon{font-size:56px;display:block;text-align:center;margin-bottom:16px;animation:ngFloat 2s ease-in-out infinite;}
            .ng-welcome-title{font-size:16px;color:#FFCD75;text-align:center;margin-bottom:12px;font-weight:700;line-height:1.6;}
            .ng-welcome-desc{font-size:13px;color:#C2C3C7;text-align:center;line-height:2;margin-bottom:20px;}
            .ng-btn{display:inline-block;padding:10px 24px;font-family:\'Press Start 2P\',monospace;font-size:10px;cursor:pointer;border-width:2px;border-style:solid;image-rendering:pixelated;box-shadow:3px 3px 0 rgba(0,0,0,0.5);transition:all 0.1s;}
            .ng-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 rgba(0,0,0,0.5);}
            .ng-btn-primary{background:#008751;color:#FFF1E8;border-color:#00E436;}
            .ng-btn-primary:hover{background:#00E436;}
            .ng-btn-secondary{background:transparent;color:#C2C3C7;border-color:#5F574F;}
            .ng-btn-secondary:hover{border-color:#FFF1E8;color:#FFF1E8;}
            .ng-form-group{margin-bottom:14px;}
            .ng-label{display:block;font-size:11px;color:#FFCD75;margin-bottom:6px;font-weight:500;}
            .ng-input,.ng-select{width:100%;background:#0d1b3e;border:2px solid #5F574F;color:#FFF1E8;padding:8px 10px;font-family:inherit;font-size:13px;outline:none;border-radius:2px;box-sizing:border-box;}
            .ng-input:focus,.ng-select:focus{border-color:#29ADFF;}
            .ng-select option{background:#1D2B53;}
            .ng-error{display:none;background:rgba(177,62,83,0.2);border:2px solid #B13E53;color:#FFCD75;padding:8px 10px;font-size:11px;margin-bottom:10px;border-radius:2px;}
            .ng-row{display:flex;gap:10px;}
            .ng-row .ng-form-group{flex:1;}
            .ng-optional-toggle{background:transparent;border:none;color:#29ADFF;font-size:11px;cursor:pointer;padding:4px 0;margin-bottom:8px;font-family:inherit;}
            .ng-optional-toggle:hover{text-decoration:underline;}
            .ng-optional-section{display:none;margin-top:8px;padding-top:12px;border-top:2px dashed #29ADFF;}
            .ng-checkbox-grid{display:flex;flex-wrap:wrap;gap:6px;}
            .ng-checkbox-label{display:flex;align-items:center;gap:5px;background:#0d1b3e;border:2px solid #5F574F;padding:5px 10px;font-size:12px;color:#C2C3C7;cursor:pointer;border-radius:2px;transition:all 0.1s;}
            .ng-checkbox-label input{display:none;}
            .ng-checkbox-label:has(input:checked){border-color:#29ADFF;background:rgba(41,173,255,0.15);color:#73EFF7;}
            .ng-ar-intro{font-size:13px;color:#C2C3C7;line-height:2;margin-bottom:16px;}
            .ng-ar-step{font-size:12px;color:#73EFF7;line-height:2;margin-bottom:16px;padding-left:8px;border-left:3px solid #29ADFF;}
            .ng-reward-box{background:#1a1a2e;border:3px solid #FFCD75;padding:24px 20px;margin:20px auto;max-width:280px;border-radius:4px;box-shadow:4px 4px 0 #000;}
            .ng-reward-title{font-size:12px;color:#FFCD75;text-align:center;margin-bottom:16px;font-family:\'Press Start 2P\',monospace;}
            .ng-reward-items{text-align:center;}
            .ng-reward-item{font-size:24px;display:block;margin-bottom:8px;}
            .ng-reward-text{font-size:13px;color:#A7F070;}
            .ng-footer{display:flex;justify-content:space-between;align-items:center;padding-top:16px;border-top:2px dashed #5D275D;margin-top:16px;flex-wrap:wrap;gap:8px;}
            @media(max-width:480px){
                .ng-row{flex-direction:column;}
                .ng-btn{font-size:8px;padding:8px 14px;}
            }
            </style>`;
        },

        /** Step 0: 欢迎页模板 */
        _tpl(name) {
            const tpls = {

                welcome: `
                <div class="ng-modal-body">
                    <span class="ng-welcome-icon">🗺️</span>
                    <div class="ng-welcome-title">把校园变成开放世界<br>把学习变成冒险</div>
                    <div class="ng-welcome-desc">
                        「阿游」——你的专属AI校园向导已上线！<br>
                        在这里，每一次上课都是一次副本挑战，<br>
                        每一份作业都是任务道具，学习即升级！<br><br>
                        完成首个AR识别，领取 <strong style="color:#FFCD75;">新手大礼包</strong>。
                    </div>
                    <div style="text-align:center;">
                        <button class="ng-btn ng-btn-primary" id="ng-welcome-next">了解玩法 ></button>
                    </div>
                </div>`,

                profile: `
                <div class="ng-modal-body">
                    <div style="font-size:12px;color:#73EFF7;margin-bottom:14px;line-height:1.8;">
                        为了给你生成专属的任务和剧情，请完善以下基本信息
                    </div>

                    <div class="ng-error" id="ng-error"></div>

                    <!-- 必填项 -->
                    <div class="ng-form-group">
                        <label class="ng-label" for="ng-grade">年级 *</label>
                        <select class="ng-select" id="ng-grade">
                            <option value="">请选择年级</option>
                            <option value="大一">大一</option>
                            <option value="大二">大二</option>
                            <option value="大三">大三</option>
                            <option value="大四">大四</option>
                            <option value="研一">研一</option>
                            <option value="研二">研二</option>
                            <option value="研三">研三</option>
                            <option value="博一">博一</option>
                            <option value="其他">其他</option>
                        </select>
                    </div>

                    <div class="ng-row">
                        <div class="ng-form-group">
                            <label class="ng-label" for="ng-school">院校名称 *</label>
                            <input class="ng-input" type="text" id="ng-school" placeholder="如：合肥财经大学" maxlength="40">
                        </div>
                        <div class="ng-form-group">
                            <label class="ng-label" for="ng-major">院系/专业 *</label>
                            <input class="ng-input" type="text" id="ng-major" placeholder="如：物联网应用技术" maxlength="40">
                        </div>
                    </div>

                    <!-- 选填项 -->
                    <button class="ng-optional-toggle" id="ng-optional-toggle" type="button">添加更多画像 ▼</button>
                    <div class="ng-optional-section" id="ng-optional-section">

                        <div class="ng-form-group">
                            <label class="ng-label">兴趣方向（可多选）</label>
                            <div class="ng-checkbox-grid">
                                ${['动漫','音乐','运动','阅读','编程','游戏','摄影','旅行'].map(v =>
                                    `<label class="ng-checkbox-label"><input type="checkbox" name="interest" value="${v}">${v}</label>`
                                ).join('')}
                            </div>
                        </div>

                        <div class="ng-form-group">
                            <label class="ng-label">学业目标（可多选）</label>
                            <div class="ng-checkbox-grid">
                                ${['考研','考公','就业','出国','创业','转专业','奖学金'].map(v =>
                                    `<label class="ng-checkbox-label"><input type="checkbox" name="goal" value="${v}">${v}</label>`
                                ).join('')}
                            </div>
                        </div>

                        <div class="ng-form-group">
                            <label class="ng-label" for="ng-routine">学习习惯</label>
                            <select class="ng-select" id="ng-routine">
                                <option value="">请选择（选填）</option>
                                <option value="早起型">早起型（6-8点效率最高）</option>
                                <option value="正常型">正常型（8-18点效率最高）</option>
                                <option value="夜猫型">夜猫型（夜间效率最高）</option>
                                <option value="碎片化">碎片化（利用零散时间）</option>
                            </select>
                        </div>

                    </div>

                    <div class="ng-footer">
                        <button class="ng-btn ng-btn-secondary" id="ng-skip">先跳过，稍后补充</button>
                        <button class="ng-btn ng-btn-primary" id="ng-submit-profile">生成新手任务！</button>
                    </div>
                </div>`,

                ar: `
                <div class="ng-modal-body">
                    <div class="ng-ar-intro">
                        AR（增强现实）识别是校园RPG的核心玩法之一。<br>
                        将摄像头对准项目提供的 AR 测试标记，即可在现实世界中召唤虚拟角色和任务！
                    </div>
                    <div class="ng-ar-step">
                        Step 1. 点击下方「启动AR识别」按钮<br>
                        Step 2. 将摄像头对准 AR 测试标记（docs/ 中的标记图片）<br>
                        Step 3. 识别成功后，自动领取 <strong style="color:#FFCD75;">金币+100，经验+50</strong>
                    </div>
                    <div style="text-align:center;margin-bottom:16px;">
                        <button class="ng-btn ng-btn-primary" id="ng-start-ar" style="font-size:10px;padding:10px 24px;">
                            🎯 启动AR识别
                        </button>
                    </div>
                    <div style="font-size:11px;color:#5F574F;text-align:center;margin-bottom:16px;">
                        若无标记或网络原因无法识别，可直接跳过
                    </div>
                    <div class="ng-footer">
                        <button class="ng-btn ng-btn-secondary" id="ng-skip-ar">跳过AR体验</button>
                        <span></span>
                    </div>
                </div>`,

                reward: `
                <div class="ng-reward-box">
                    <div class="ng-reward-title">识别成功!</div>
                    <div class="ng-reward-items">
                        <span class="ng-reward-item">🪙</span>
                        <div class="ng-reward-text">金币 +100</div>
                        <span class="ng-reward-item" style="margin-top:12px;">⭐</span>
                        <div class="ng-reward-text">经验 +50</div>
                    </div>
                </div>
                <div style="text-align:center;font-size:12px;color:#73EFF7;margin-top:8px;">正在生成你的专属任务...</div>`
            };
            return tpls[name] || '';
        }
    };

    // 挂载到全局
    window.NewbieGuide = NewbieGuide;

})();
