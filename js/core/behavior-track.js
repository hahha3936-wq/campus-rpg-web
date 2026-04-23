/**
 * 校园RPG - 用户行为埋点模块
 * 统一采集任务完成、AR识别、登录等关键行为
 * 支持离线暂存 + 网络恢复后自动补发
 */

const BehaviorTrack = {
    _queue: [],
    _isProcessing: false,
    _maxRetries: 3,
    _retryDelay: 5000,
    _storageKey: 'behavior_track_queue',

    /**
     * 初始化：从本地恢复未发送的埋点
     */
    init() {
        const saved = localStorage.getItem(this._storageKey);
        if (saved) {
            try {
                this._queue = JSON.parse(saved);
            } catch {
                this._queue = [];
            }
        }
        this._processQueue();
        setInterval(() => this._processQueue(), 30000);
    },

    /**
     * 通用的网络请求方法（带重试）
     * @param {Object} payload - 埋点数据
     * @returns {boolean} 是否成功
     */
    async _send(payload) {
        for (let attempt = 0; attempt < this._maxRetries; attempt++) {
            try {
                const resp = await fetch(window.apiUrl('/api/behavior/log'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Auth.getToken() || ''}`
                    },
                    body: JSON.stringify(payload)
                });
                if (resp.ok) return true;
            } catch {
                // 网络异常，忽略
            }
            if (attempt < this._maxRetries - 1) {
                await new Promise(r => setTimeout(r, this._retryDelay));
            }
        }
        return false;
    },

    /**
     * 核心上报方法：添加到队列并尝试发送
     * @param {string} eventType - 事件类型
     * @param {Object} eventData - 事件数据
     */
    async track(eventType, eventData) {
        const item = {
            event_type: eventType,
            user_id: Auth.getUser()?.id || 'anonymous',
            timestamp: new Date().toISOString(),
            data: eventData
        };

        // 先加入队列（保证不丢失）
        this._queue.push(item);
        this._saveQueue();

        // 尝试发送
        const sent = await this._send(item);
        if (sent) {
            // 发送成功后从队列移除
            const idx = this._queue.indexOf(item);
            if (idx !== -1) this._queue.splice(idx, 1);
            this._saveQueue();
        }
    },

    /**
     * 处理队列中待发送的埋点（离线恢复后补发）
     */
    async _processQueue() {
        if (this._isProcessing || this._queue.length === 0) return;
        this._isProcessing = true;

        const remaining = [];
        for (const item of this._queue) {
            const ok = await this._send(item);
            if (!ok) remaining.push(item);
        }
        this._queue = remaining;
        this._saveQueue();
        this._isProcessing = false;
    },

    /**
     * 保存队列到本地存储
     */
    _saveQueue() {
        try {
            localStorage.setItem(this._storageKey, JSON.stringify(this._queue.slice(-100)));
        } catch {
            // 存储已满，忽略
        }
    },

    // ==================== 业务埋点方法 ====================

    /**
     * 任务完成埋点
     * @param {string} taskId - 任务ID
     * @param {string} taskType - 任务类型（main/side/daily/hidden）
     * @param {number} completionDuration - 完成耗时（秒）
     */
    trackTaskCompletion(taskId, taskType, completionDuration) {
        this.track('task_completion', {
            task_id: taskId,
            task_type: taskType,
            duration_seconds: completionDuration
        });
    },

    /**
     * AR标记识别成功埋点
     * @param {string} markerId - 标记ID
     * @param {number} recognitionDuration - 识别耗时（毫秒）
     */
    trackARMarkerFound(markerId, recognitionDuration) {
        this.track('ar_marker_found', {
            marker_id: markerId,
            recognition_duration_ms: recognitionDuration
        });
    },

    /**
     * 用户登录埋点
     * @param {string} loginTime - 登录时间（ISO字符串）
     * @param {string} deviceInfo - 设备信息
     */
    trackUserLogin(loginTime, deviceInfo) {
        this.track('user_login', {
            login_time: loginTime,
            device: deviceInfo || {}
        });
    }
};

// 自动初始化
document.addEventListener('DOMContentLoaded', () => BehaviorTrack.init());

window.BehaviorTrack = BehaviorTrack;
