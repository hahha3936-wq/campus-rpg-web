/**
 * 校园RPG - 离线加密存储模块
 *
 * 功能特性：
 * 1. IndexedDB 持久化存储（容量大，支持结构化数据）
 * 2. AES-256 加密存储敏感数据（任务数据、用户状态等）
 * 3. 自动判断数据类型：敏感数据自动加密，普通数据明文存储
 * 4. Promise 异步接口，与 localStorage 逻辑一致
 * 5. 自动兼容现有 StateManager / AppState 的数据结构
 *
 * 数据结构（与后端 SQLite 表完全兼容）：
 * - store: user_tasks    | 任务数据（敏感，加密）
 * - store: ar_records    | AR解锁记录（敏感，加密）
 * - store: user_state    | 用户状态快照（敏感，加密）
 * - store: operation_log | 本地操作日志（普通，明文）
 * - store: sync_queue    | 待同步队列（普通，明文）
 */

const OfflineStorage = (() => {
    const DB_NAME = 'campus_rpg_offline';
    const DB_VERSION = 1;
    /**
     * AES 加密密钥。
     * 当前使用固定密钥，适用于普通隐私保护。
     * 如需更高安全性，可改为：用户密码 + 盐值衍生的动态密钥，
     * 需确保加密密钥与用户登录态绑定。
     */
    const ENCRYPT_KEY = 'campus_rpg_2026_secure_key';
    let _db = null;

    // ==================== IndexedDB 初始化 ====================

    /**
     * 打开（首次创建）IndexedDB 数据库
     * @returns {Promise<IDBDatabase>}
     */
    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                // 创建 5 个对象存储区
                const stores = [
                    { name: 'user_tasks',     keyPath: 'id' },         // 任务数据
                    { name: 'ar_records',     keyPath: 'marker_id' },  // AR解锁记录
                    { name: 'user_state',     keyPath: 'id' },         // 用户状态快照
                    { name: 'operation_log',  keyPath: 'id', autoIncrement: true }, // 操作日志
                    { name: 'sync_queue',     keyPath: 'id', autoIncrement: true }  // 待同步队列
                ];
                stores.forEach(({ name, keyPath, autoIncrement }) => {
                    if (!db.objectStoreNames.contains(name)) {
                        db.createObjectStore(name, { keyPath, autoIncrement: !!autoIncrement });
                    }
                });
            };

            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * 获取数据库实例（单例，延迟初始化）
     */
    async function getDB() {
        if (!_db) _db = await openDB();
        return _db;
    }

    // ==================== AES 加密/解密 ====================

    /**
     * 使用 AES-256 加密数据
     * @param {string|object} plaintext - 原始数据
     * @returns {string} Base64 编码的密文
     */
    function encrypt(plaintext) {
        if (typeof plaintext === 'object') plaintext = JSON.stringify(plaintext);
        return CryptoJS.AES.encrypt(plaintext, ENCRYPT_KEY).toString();
    }

    /**
     * 解密 AES-256 密文
     * @param {string} ciphertext - 密文
     * @returns {object|null} 解析后的对象，失败返回 null
     */
    function decrypt(ciphertext) {
        try {
            const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPT_KEY);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            return decrypted ? JSON.parse(decrypted) : null;
        } catch {
            return null;
        }
    }

    // ==================== 核心存储操作（Promise API）====================

    /**
     * 写入数据到指定存储区
     * @param {string} store - 存储区名称
     * @param {*} value - 要存储的数据（对象）
     * @param {string} [key] - 可选键名（默认使用 id 字段或时间戳）
     * @param {boolean} [sensitive=true] - 是否加密存储（默认加密）
     * @returns {Promise<string>} 写入记录的键名
     */
    async function setItem(store, value, key, sensitive = true) {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            const os = tx.objectStore(store);

            let record;
            if (sensitive && typeof value === 'object') {
                // 敏感数据：加密原始数据，并保留元信息
                record = { _encrypted: true, _data: encrypt(value) };
            } else {
                // 普通数据：明文存储
                record = { ...value };
            }

            // 确定键名
            if (key) {
                record.id = key;
            } else if (record.id === undefined) {
                record.id = Date.now().toString();
            }

            const req = os.put(record);
            req.onsuccess = () => resolve(record.id);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * 从指定存储区读取数据
     * @param {string} store - 存储区名称
     * @param {string} [key] - 键名（不填则读取全部记录）
     * @returns {Promise<*>} 单条数据或数组
     */
    async function getItem(store, key) {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const os = tx.objectStore(store);

            if (key) {
                const req = os.get(key);
                req.onsuccess = () => {
                    const record = req.result;
                    if (!record) return resolve(null);
                    resolve(record._encrypted ? decrypt(record._data) : record);
                };
                req.onerror = () => reject(req.error);
            } else {
                const req = os.getAll();
                req.onsuccess = () => {
                    resolve((req.result || []).map(r =>
                        r._encrypted ? decrypt(r._data) : r
                    ));
                };
                req.onerror = () => reject(req.error);
            }
        });
    }

    /**
     * 从指定存储区删除数据
     * @param {string} store - 存储区名称
     * @param {string} key - 键名
     * @returns {Promise<void>}
     */
    async function removeItem(store, key) {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * 清空指定存储区的所有数据
     * @param {string} store - 存储区名称
     * @returns {Promise<void>}
     */
    async function clear(store) {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    // ==================== 便捷业务方法 ====================

    /**
     * 保存用户任务数据（加密存储）
     * @param {Array} tasks - 任务数组
     * @returns {Promise<string>}
     */
    async function saveTasks(tasks) {
        return await setItem('user_tasks', {
            id: 'tasks',
            tasks: tasks,
            savedAt: new Date().toISOString()
        });
    }

    /**
     * 读取用户任务数据
     * @returns {Promise<Array>} 任务数组
     */
    async function loadTasks() {
        const data = await getItem('user_tasks', 'tasks');
        return data?.tasks || [];
    }

    /**
     * 保存 AR 标记解锁记录（加密存储）
     * @param {string} markerId - 标记ID
     * @param {object} extraData - 额外数据
     * @returns {Promise<string>}
     */
    async function saveARRecord(markerId, extraData) {
        return await setItem('ar_records', {
            marker_id: markerId,
            ...extraData,
            unlockedAt: new Date().toISOString()
        });
    }

    /**
     * 读取 AR 解锁记录列表
     * @returns {Promise<Array>}
     */
    async function loadARRecords() {
        return await getItem('ar_records');
    }

    /**
     * 保存用户状态快照（加密存储）
     * @param {object} state - 完整用户状态对象
     * @returns {Promise<string>}
     */
    async function saveUserState(state) {
        return await setItem('user_state', {
            id: 'current',
            ...state,
            savedAt: new Date().toISOString()
        });
    }

    /**
     * 读取用户状态快照
     * @returns {Promise<object|null>}
     */
    async function loadUserState() {
        return await getItem('user_state', 'current');
    }

    /**
     * 添加操作日志（明文存储，不加密）
     * @param {string} operation - 操作名称
     * @param {object} detail - 详细信息
     * @returns {Promise<string>}
     */
    async function addOperationLog(operation, detail) {
        return await setItem('operation_log', {
            operation: operation,
            detail: detail,
            timestamp: new Date().toISOString()
        }, null, false);
    }

    /**
     * 添加数据到同步队列（明文存储）
     * @param {object} item - 待同步项
     * @returns {Promise<string>}
     */
    async function addToSyncQueue(item) {
        return await setItem('sync_queue', {
            ...item,
            queuedAt: new Date().toISOString()
        }, null, false);
    }

    // ==================== 公开 API ====================

    return {
        setItem, getItem, removeItem, clear,
        saveTasks, loadTasks,
        saveARRecord, loadARRecords,
        saveUserState, loadUserState,
        addOperationLog, addToSyncQueue
    };
})();


// ==================== 网络状态监听 ====================

/**
 * 网络状态监听模块
 * 全局暴露 window.isOnline 变量
 * 同时通过 EventBus 发送 network:online / network:offline 事件
 */
const NetworkMonitor = (() => {
    /**
     * 更新网络状态
     */
    function updateStatus() {
        window.isOnline = navigator.onLine;
        // 通过 EventBus 通知其他模块
        if (window.EventBus) {
            window.EventBus.emit(window.isOnline ? 'network:online' : 'network:offline');
        }
        // 同时派发原生 CustomEvent，供未接入 EventBus 的模块使用
        window.dispatchEvent(new CustomEvent('network-change', {
            detail: { online: window.isOnline }
        }));
    }

    // 绑定事件监听
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    // 初始化：防止页面加载时状态不一致
    updateStatus();

    return {
        /** 获取当前网络状态 */
        isOnline: () => window.isOnline,
        /** 添加网络状态变化监听器 */
        addListener: (callback) => {
            window.addEventListener('network-change', (e) => callback(e.detail.online));
        }
    };
})();

// 暴露全局
window.OfflineStorage = OfflineStorage;
window.NetworkMonitor = NetworkMonitor;


// ==================== 离线数据同步模块 ====================

/**
 * 离线数据同步模块
 *
 * 核心逻辑：
 * 1. 离线时，所有操作（任务完成、AR解锁、状态更新）写入 sync_queue
 * 2. 网络恢复后，读取队列按顺序批量同步到后端
 * 3. 冲突检测：后端更新时间 > 本地更新时间时提示用户选择
 * 4. 同步成功后清空队列，更新本地 IndexedDB 数据
 *
 * 同步队列每条记录格式：
 * {
 *   id: 'auto_inc',
 *   type: 'task_complete | ar_unlock | user_state_update',
 *   entity_id: 'xxx',          // 关联实体ID
 *   action: 'create | update | delete',
 *   payload: { ... },          // 操作数据
 *   local_timestamp: 'ISO8601', // 本地操作时间
 *   synced: false,
 *   retry_count: 0
 * }
 */
const DataSync = (() => {
    const SYNC_BATCH_SIZE = 20;
    const SYNC_INTERVAL = 30000;
    let _syncTimer = null;
    let _isSyncing = false;

    function _getDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('campus_rpg_offline', 1);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => reject(req.error);
        });
    }

    function _dispatchStatus(status) {
        window.dispatchEvent(new CustomEvent('sync-status-change', {
            detail: { status }
        }));
        if (window.EventBus) {
            window.EventBus.emit('sync:' + status);
        }
    }

    async function enqueueOperation(type, entityId, action, payload) {
        const item = {
            type: type,
            entity_id: entityId,
            action: action,
            payload: payload,
            local_timestamp: new Date().toISOString(),
            synced: false,
            retry_count: 0
        };
        return await OfflineStorage.setItem('sync_queue', item, null, false);
    }

    async function getPendingQueue() {
        const all = await OfflineStorage.getItem('sync_queue');
        return (all || []).filter(function(i) { return !i.synced; }).sort(function(a, b) {
            return new Date(a.local_timestamp) - new Date(b.local_timestamp);
        });
    }

    async function markSynced(id) {
        const db = await _getDB();
        return new Promise(function(resolve, reject) {
            const tx = db.transaction('sync_queue', 'readwrite');
            const req = tx.objectStore('sync_queue').get(id);
            req.onsuccess = function() {
                var record = req.result;
                if (record) {
                    record.synced = true;
                    tx.objectStore('sync_queue').put(record);
                }
                resolve();
            };
            req.onerror = function() { reject(req.error); };
        });
    }

    async function removeSyncedItems() {
        const db = await _getDB();
        return new Promise(function(resolve, reject) {
            const tx = db.transaction('sync_queue', 'readwrite');
            const req = tx.objectStore('sync_queue').getAll();
            req.onsuccess = function() {
                var toDelete = (req.result || []).filter(function(i) { return i.synced; });
                toDelete.forEach(function(i) { tx.objectStore('sync_queue').delete(i.id); });
                resolve(toDelete.length);
            };
            req.onerror = function() { reject(req.error); };
        });
    }

    async function _applyResolution(conflict) {
        if (conflict.resolution === 'server') {
            if (conflict.type === 'task_complete') {
                await OfflineStorage.saveTasks(conflict.server_data && conflict.server_data.tasks || []);
            } else if (conflict.type === 'ar_unlock') {
                await OfflineStorage.saveARRecord(conflict.entity_id, conflict.server_data);
            }
        }
    }

    async function pullAndUpdateLocal() {
        try {
            var resp = await fetch(window.apiUrl('/api/sync/pull'), {
                headers: {
                    'Authorization': 'Bearer ' + (localStorage.getItem('campus_rpg_token') || '')
                }
            });
            if (!resp.ok) return;
            var cloud = await resp.json();
            if (cloud.user_state) await OfflineStorage.saveUserState(cloud.user_state);
            if (cloud.tasks) await OfflineStorage.saveTasks(cloud.tasks);
            if (cloud.ar_records) {
                cloud.ar_records.forEach(function(r) {
                    OfflineStorage.saveARRecord(r.marker_id, r).catch(function() {});
                });
            }
            window.dispatchEvent(new CustomEvent('sync-data-updated', { detail: cloud }));
        } catch(err) {
            console.warn('[DataSync] pullAndUpdateLocal failed:', err);
        }
    }

    async function triggerSync() {
        if (_isSyncing || !window.isOnline) return;
        _isSyncing = true;
        _dispatchStatus('syncing');

        try {
            var pending = await getPendingQueue();
            if (pending.length === 0) {
                _dispatchStatus('idle');
                _isSyncing = false;
                return;
            }

            var batch = pending.slice(0, SYNC_BATCH_SIZE);
            var resp = await fetch(window.apiUrl('/api/sync/batch'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (localStorage.getItem('campus_rpg_token') || '')
                },
                body: JSON.stringify({ operations: batch })
            });

            if (!resp.ok) throw new Error('HTTP ' + resp.status);

            var result = await resp.json();

            if (result.conflicts && result.conflicts.length > 0) {
                await new Promise(function(resolve) {
                    window.dispatchEvent(new CustomEvent('sync-conflict', {
                        detail: {
                            conflicts: result.conflicts,
                            resolver: function(resolved) {
                                resolved.forEach(function(c) { _applyResolution(c); });
                                resolve();
                            }
                        }
                    }));
                    setTimeout(resolve, 30000);
                });
            }

            for (var i = 0; i < batch.length; i++) {
                await markSynced(batch[i].id);
            }
            await removeSyncedItems();
            await pullAndUpdateLocal();

            _dispatchStatus('success');
            setTimeout(function() { _dispatchStatus('idle'); }, 3000);

        } catch(err) {
            console.warn('[DataSync] 同步失败:', err);
            _dispatchStatus('error');
        }

        _isSyncing = false;
    }

    async function syncTaskComplete(taskId, subtaskId, progress) {
        if (window.isOnline) {
            try {
                await fetch(window.apiUrl('/api/tasks/' + taskId + '/subtask/' + subtaskId), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + (localStorage.getItem('campus_rpg_token') || '')
                    },
                    body: JSON.stringify(progress)
                });
            } catch(err) {
                await enqueueOperation('task_complete', taskId, 'update', { subtaskId: subtaskId, progress: progress });
            }
        } else {
            await enqueueOperation('task_complete', taskId, 'update', { subtaskId: subtaskId, progress: progress });
        }
    }

    async function syncARUnlock(markerId, data) {
        if (window.isOnline) {
            try {
                await fetch(window.apiUrl('/api/ar/' + markerId), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + (localStorage.getItem('campus_rpg_token') || '')
                    },
                    body: JSON.stringify(data)
                });
            } catch(err) {
                await enqueueOperation('ar_unlock', markerId, 'create', data);
            }
        } else {
            await enqueueOperation('ar_unlock', markerId, 'create', data);
        }
    }

    function init() {
        window.addEventListener('network-change', function(e) {
            if (e.detail.online) triggerSync();
        });
        _syncTimer = setInterval(function() {
            if (window.isOnline && !_isSyncing) triggerSync();
        }, SYNC_INTERVAL);
    }

    return {
        init: init,
        triggerSync: triggerSync,
        enqueueOperation: enqueueOperation,
        getPendingQueue: getPendingQueue,
        syncTaskComplete: syncTaskComplete,
        syncARUnlock: syncARUnlock
    };
})();

window.DataSync = DataSync;

// 自动初始化 DataSync（在模块定义完成后立即初始化）
// 使用 setTimeout 确保所有脚本都已加载完成
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        DataSync.init();
    });
} else {
    // DOM 已经就绪
    setTimeout(function() {
        if (DataSync && DataSync.init) {
            DataSync.init();
        }
    }, 0);
}
