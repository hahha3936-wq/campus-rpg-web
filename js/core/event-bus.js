/**
 * 校园RPG - 事件总线
 * 实现模块间松耦合通信
 */

const EventBus = {
    _events: {},

    /**
     * 监听事件
     * @param {string} event - 事件名
     * @param {function} callback - 回调函数
     * @returns {function} 取消订阅函数
     */
    on(event, callback) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(callback);
        return () => this.off(event, callback);
    },

    /**
     * 监听一次性事件
     */
    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);
            this.off(event, wrapper);
        };
        return this.on(event, wrapper);
    },

    /**
     * 触发事件
     */
    emit(event, ...args) {
        const listeners = this._events[event] || [];
        listeners.forEach((cb, i) => {
            try { cb(...args); } catch (e) { console.error(`EventBus[${event}][${i}]:`, e); }
        });
    },

    /**
     * 取消监听
     */
    off(event, callback) {
        if (!this._events[event]) return;
        this._events[event] = this._events[event].filter(cb => cb !== callback);
    },

    /**
     * 清空某事件的所有监听
     */
    clear(event) {
        if (event) {
            delete this._events[event];
        } else {
            this._events = {};
        }
    }
};

// ============ 预定义事件常量 ============
const EVENTS = {
    // 数据加载
    DATA_LOADED: 'data:loaded',
    USER_UPDATED: 'user:updated',
    TASKS_UPDATED: 'tasks:updated',
    ACHIEVEMENTS_UPDATED: 'achievements:updated',

    // 探索
    LOCATION_DISCOVERED: 'exploration:location_discovered',
    BUFF_ACTIVATED: 'exploration:buff_activated',
    HIDDEN_EVENT_FOUND: 'exploration:hidden_event',
    ACHIEVEMENT_UNLOCKED: 'achievement:unlocked',

    // 等级
    LEVEL_UP: 'role:level_up',

    // 签到
    SIGNIN_COMPLETE: 'signin:complete',

    // 任务
    TASK_COMPLETED: 'task:completed',
    SUBTASK_COMPLETED: 'subtask:completed',

    // 番茄钟
    POMODORO_START: 'pomodoro:start',
    POMODORO_COMPLETE: 'pomodoro:complete',
    POMODORO_TICK: 'pomodoro:tick',

    // AI对话
    CHAT_READY: 'chat:ready',
    CHAT_MESSAGE: 'chat:message',
    CHAT_ERROR: 'chat:error',

    // 探索模式
    EXPLORATION_OPEN: 'exploration:open',
    EXPLORATION_CLOSE: 'exploration:close',
};

// 导出
window.EventBus = EventBus;
window.EVENTS = EVENTS;
