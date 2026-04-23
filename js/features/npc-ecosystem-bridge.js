/**
 * 校园RPG - NPC系统集成器
 * 
 * 功能职责：
 * 1. 兼容原有 npc.html 页面的 NPCManager
 * 2. 桥接新旧NPC数据格式
 * 3. 提供统一的NPC生态入口
 * 4. 与 StateManager、EventBus 深度集成
 */

(function() {
    'use strict';

    // ============================================
    // 等待依赖模块
    // ============================================
    function _waitForModules() {
        return new Promise((resolve) => {
            const check = () => {
                if (typeof NPC_ECOSYSTEM_DATA !== 'undefined' && 
                    typeof NPCEcosystem !== 'undefined' && 
                    typeof StateManager !== 'undefined') {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    // ============================================
    // NPCEcosystemBridge - 兼容层
    // ============================================
    const NPCEcosystemBridge = {

        /**
         * 初始化NPC生态（异步）
         */
        async init() {
            await _waitForModules();
            await NPCEcosystem.init();
            
            // 同步原有NPC数据到生态系统
            this._syncLegacyNPCData();
            
            // 注册全局事件监听
            this._registerGlobalListeners();
            
            console.log('[NPCEcosystemBridge] NPC生态系统初始化完成');
        },

        /**
         * 同步原有NPC数据到新生态系统
         * 使用NPCEcosystem的公开API，避免直接访问私有属性
         */
        _syncLegacyNPCData() {
            const legacyNPCs = ['naruto', 'sasuke'];
            const legacyMapping = {
                'naruto': 'mentor_wang',
                'sasuke': 'mentor_li'
            };

            for (const legacyId of legacyNPCs) {
                const legacyRelation = NPCManager?._relations?.[legacyId];
                if (legacyRelation && legacyRelation.affection > 0) {
                    const newId = legacyMapping[legacyId];
                    if (newId && NPCEcosystem) {
                        const npc = NPCEcosystem.getNPC(newId);
                        if (npc?.id) {
                            const info = NPCEcosystem.getAffectionInfo(newId);
                            if (info && info.affection === 0) {
                                NPCEcosystem.addAffection(newId, legacyRelation.affection, 'legacy_sync');
                            }
                        }
                    }
                }
            }
        },

        /**
         * 注册全局事件监听
         */
        _registerGlobalListeners() {
            if (!window.EventBus) return;

            // 任务完成 → NPC好感度提升
            EventBus.on('task:completed', (task) => {
                if (!NPCEcosystem?.isInitialized?.()) return;
                
                const unlockedNPCs = Object.keys(NPCEcosystem._unlockedNPCs || {});
                for (const npcId of unlockedNPCs) {
                    const npc = NPCEcosystem._allNPCs?.[npcId];
                    if (!npc?.affection?.gain_conditions) continue;
                    
                    const cond = npc.affection.gain_conditions.find(c => c.action === 'complete_task');
                    if (cond) {
                        NPCEcosystem.addAffection(npcId, cond.factor, 'task_complete:' + task?.id);
                    }
                }
            });

            // 签到完成 → NPC好感度提升
            EventBus.on('signin:complete', () => {
                if (!NPCEcosystem?.isInitialized?.()) return;
                
                const unlockedNPCs = Object.keys(NPCEcosystem._unlockedNPCs || {});
                for (const npcId of unlockedNPCs) {
                    const npc = NPCEcosystem._allNPCs?.[npcId];
                    if (!npc?.affection?.gain_conditions) continue;
                    
                    const cond = npc.affection.gain_conditions.find(c => c.action === 'daily_signin');
                    if (cond) {
                        NPCEcosystem.addAffection(npcId, cond.factor, 'daily_signin');
                    }
                }
            });

            // AR解锁 → NPC解锁检查
            EventBus.on('ar:marker_scanned', async (data) => {
                if (!NPCEcosystem?.isInitialized?.()) return;
                
                const { markerId } = data || {};
                if (markerId) {
                    const newlyUnlocked = await NPCEcosystem.checkARUnlock(markerId);
                    for (const { npcId, npc } of newlyUnlocked) {
                        _showUnlockNotification(npcId, npc);
                    }
                }
            });

            // 成就解锁 → NPC解锁检查
            EventBus.on('achievement:unlocked', async (achievement) => {
                if (!NPCEcosystem?.isInitialized?.()) return;
                
                const newlyUnlocked = await NPCEcosystem.checkAchievementUnlock(achievement?.id);
                for (const { npcId, npc } of newlyUnlocked) {
                    _showUnlockNotification(npcId, npc);
                }
            });

            // 等级提升 → NPC好感度提升 + 解锁检查
            EventBus.on('role:level_up', async (data) => {
                if (!NPCEcosystem?.isInitialized?.()) return;
                
                const unlockedNPCs = Object.keys(NPCEcosystem._unlockedNPCs || {});
                for (const npcId of unlockedNPCs) {
                    const npc = NPCEcosystem._allNPCs?.[npcId];
                    if (!npc?.affection?.gain_conditions) continue;
                    
                    const cond = npc.affection.gain_conditions.find(c => c.action === 'level_up');
                    if (cond) {
                        NPCEcosystem.addAffection(npcId, cond.factor, 'level_up:' + data?.level);
                    }
                }
            });

            // 每日重置 → 好感度衰减检查
            EventBus.on('app:daily_reset', () => {
                if (!NPCEcosystem?.isInitialized?.()) return;
                NPCEcosystem.processDailyDecay();
            });

            // 彩蛋触发
            EventBus.on('exploration:easter_egg', (egg) => {
                if (!NPCEcosystem?.isInitialized?.()) return;
                NPCEcosystem.triggerCornerEgg(egg?.triggerId);
            });
        },

        /**
         * 获取NPC列表（兼容原有API）
         */
        getAllNPCs() {
            return NPC_ECOSYSTEM_DATA;
        },

        /**
         * 获取已解锁NPC（兼容原有API）
         */
        getUnlockedNPCs() {
            return NPCEcosystem?.getUnlockedNPCs() || {};
        },

        /**
         * 获取单个NPC（兼容原有API）
         */
        getNPC(npcId) {
            return NPCEcosystem?.getNPC?.(npcId) || null;
        },

        /**
         * 获取好感度（兼容原有API）
         */
        getAffection(npcId) {
            const info = NPCEcosystem?.getAffectionInfo?.(npcId);
            if (!info) return 0;
            return info.affection || 0;
        },

        /**
         * 获取好感度进度（兼容原有API）
         */
        getAffectionProgress(npcId) {
            const info = NPCEcosystem?.getAffectionInfo?.(npcId);
            if (!info) return 0;
            return info.percentage || 0;
        },

        /**
         * 增加好感度（兼容原有API）
         */
        addAffection(npcId, amount) {
            return NPCEcosystem?.addAffection(npcId, amount, 'manual') || null;
        },

        /**
         * 获取对话历史（兼容原有API）
         */
        getHistory(npcId) {
            return NPCEcosystem?.getHistory?.(npcId) || [];
        },

        /**
         * 发起AI对话（兼容原有API）
         */
        async chat(npcId, message) {
            return await NPCEcosystem?.chat?.(npcId, message) || {};
        },

        /**
         * 记录每日互动
         */
        recordDailyInteraction(npcId) {
            NPCEcosystem?.recordDailyInteraction?.(npcId);
        },

        /**
         * 获取解锁进度
         */
        getUnlockProgress() {
            return NPCEcosystem?.getUnlockProgress?.() || { total: 0, unlocked: 0, percentage: 0 };
        },

        /**
         * 检查时间彩蛋
         */
        checkTimeEggs() {
            NPCEcosystem?.checkTimeEggs?.();
        },

        /**
         * 打开NPC面板（显示新界面）
         */
        openPanel() {
            if (window.NPCUI) {
                NPCUI.open();
            }
        },

        /**
         * 打开指定NPC详情
         */
        openNPC(npcId) {
            if (window.NPCUI) {
                NPCUI.openNPC(npcId);
            }
        },

        /**
         * 获取解锁进度百分比
         */
        getProgressPercentage() {
            const progress = this.getUnlockProgress();
            return progress.percentage || 0;
        },

        /**
         * 获取指定分类的NPC
         */
        getNPCsByCategory(category) {
            return NPCEcosystem?.getNPCsByCategory?.(category) || {};
        },

        /**
         * 获取推荐对话
         */
        getSuggestedDialogues(npcId) {
            return NPCEcosystem?.getSuggestedDialogues?.(npcId) || [];
        }
    };

    // ============================================
    // 辅助函数
    // ============================================

    /**
     * 显示解锁通知
     */
    function _showUnlockNotification(npcId, npc) {
        if (!npc) return;

        // 显示浏览器通知
        if (window.showNotification) {
            showNotification(`🎉 解锁新NPC：${npc.name}！`, 'success');
        }

        // 触发事件
        if (window.EventBus) {
            EventBus.emit('npc:unlock_notification', { npcId, npc });
        }
    }

    /**
     * 检查并触发时间彩蛋（定时检查）
     */
    let _timeEggTimer = null;
    function _startTimeEggChecker() {
        // 每5分钟检查一次时间彩蛋
        _timeEggTimer = setInterval(() => {
            if (NPCEcosystem?.isInitialized?.()) {
                NPCEcosystem?.checkTimeEggs?.();
            }
        }, 5 * 60 * 1000);
        
        // 页面加载时立即检查一次
        setTimeout(() => {
            if (NPCEcosystem?.isInitialized?.()) {
                NPCEcosystem?.checkTimeEggs?.();
            }
        }, 3000);
    }

    // ============================================
    // 导出到全局
    // ============================================
    window.NPCEcosystemBridge = NPCEcosystemBridge;

    // ============================================
    // 自动初始化
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
            // 等待所有依赖模块加载
            await NPCEcosystemBridge.init();
            _startTimeEggChecker();
        });
    } else {
        // DOM已就绪
        setTimeout(async () => {
            await NPCEcosystemBridge.init();
            _startTimeEggChecker();
        }, 100);
    }

    // ============================================
    // 兼容原有全局函数
    // ============================================
    
    /**
     * 切换NPC（兼容原有HTML onclick）
     * @deprecated 使用 NPCEcosystemBridge.openNPC 代替
     */
    window.switchNPC = function(npcId) {
        NPCEcosystemBridge.openNPC(npcId);
    };

    /**
     * 触发对话（兼容原有HTML onclick）
     * @deprecated 使用 NPCEcosystemBridge.openPanel 代替
     */
    window.triggerDialogue = function() {
        NPCEcosystemBridge.openPanel();
    };

    /**
     * 赠送礼物（保留原有逻辑）
     */
    window.sendGift = function() {
        // 原有逻辑保持不变
        if (typeof NPCManager?.sendGift === 'function') {
            NPCManager.sendGift();
        }
    };

    /**
     * 发送用户消息（保留原有逻辑）
     */
    window.sendUserMessage = function() {
        // 原有逻辑保持不变
        if (typeof NPCManager?.sendUserMessage === 'function') {
            NPCManager.sendUserMessage();
        }
    };

})();
