"""
校园RPG - 离线数据同步 API
提供批量同步、拉取云端最新数据、冲突检测功能
"""
import sqlite3, os, json, functools
from flask import Blueprint, request, jsonify
from datetime import datetime

sync_bp = Blueprint('sync', __name__)

BACKEND_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(BACKEND_DIR, '..'))
SYNC_DB = os.path.join(PROJECT_DIR, 'data', 'sync_meta.db')
USER_DATA_DIR = os.path.join(PROJECT_DIR, 'data', 'user_data')
os.makedirs(os.path.dirname(SYNC_DB), exist_ok=True)
os.makedirs(USER_DATA_DIR, exist_ok=True)


def _get_sync_db():
    conn = sqlite3.connect(SYNC_DB, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def _init_sync_db():
    conn = _get_sync_db()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                operation_id TEXT NOT NULL,
                operation_type TEXT,
                entity_id TEXT,
                action TEXT,
                payload TEXT,
                local_timestamp TEXT,
                server_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, operation_id)
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_sync_user ON sync_log(user_id)')
        conn.commit()
    finally:
        conn.close()


_init_sync_db()


# ============================================
# 认证装饰器（与 server.py / ar_api.py 保持一致）
# ============================================
def _require_auth(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': '未登录'}), 401

        token = auth_header[7:]
        try:
            import base64
            parts = base64.b64decode(token).decode().split(':')
            user_id = parts[0]
            if not user_id:
                return jsonify({'error': '无效token'}), 401
        except:
            return jsonify({'error': 'token格式错误'}), 401

        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated


def _user_data_path(user_id):
    return os.path.join(USER_DATA_DIR, 'user_data_' + user_id + '.json')


def _load_user_data(user_id):
    path = _user_data_path(user_id)
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {}


def _save_user_data(user_id, data):
    path = _user_data_path(user_id)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ============================================
# 幂等性检查：operation_id 已在 sync_log 中则跳过
# ============================================
def _is_processed(user_id, operation_id):
    conn = _get_sync_db()
    try:
        cur = conn.execute(
            'SELECT 1 FROM sync_log WHERE user_id=? AND operation_id=?',
            (user_id, str(operation_id))
        )
        return cur.fetchone() is not None
    finally:
        conn.close()


def _log_operation(user_id, op_id, op_type, entity_id, action, payload, local_ts):
    conn = _get_sync_db()
    try:
        conn.execute('''
            INSERT OR IGNORE INTO sync_log
            (user_id, operation_id, operation_type, entity_id, action, payload, local_timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, str(op_id), op_type, entity_id, action,
              json.dumps(payload, ensure_ascii=False), local_ts))
        conn.commit()
    finally:
        conn.close()


# ============================================
# API：POST /api/sync/batch
# 批量同步操作
# ============================================
@sync_bp.route('/batch', methods=['POST'])
@_require_auth
def sync_batch():
    """
    请求体：
    {
      "operations": [
        { "id": "1", "type": "task_complete", "entity_id": "...", "action": "update",
          "payload": {...}, "local_timestamp": "ISO8601" },
        ...
      ]
    }
    响应：
    { "success": true, "synced": 5, "conflicts": [...] }
    """
    body = request.json or {}
    operations = body.get('operations', [])
    user_id = request.user_id
    synced_count = 0
    conflicts = []

    user_data = _load_user_data(user_id)

    for op in operations:
        op_id = op.get('id') or op.get('local_timestamp', '')
        if not op_id:
            continue

        if _is_processed(user_id, op_id):
            continue

        op_type = op.get('type')
        entity_id = op.get('entity_id')
        action = op.get('action', 'update')
        payload = op.get('payload', {})
        local_ts = op.get('local_timestamp', datetime.now().isoformat())

        if op_type == 'task_complete':
            task_updated = user_data.get('_task_meta', {}).get(entity_id, {}).get('updated_at')
            if task_updated and task_updated > local_ts:
                conflicts.append({
                    'type': 'task_complete',
                    'entity_id': entity_id,
                    'local_data': payload,
                    'server_data': user_data.get('tasks', []),
                    'server_timestamp': task_updated,
                    'local_timestamp': local_ts
                })
                continue

            if 'tasks' not in user_data:
                user_data['tasks'] = []
            tasks = user_data['tasks']
            sub_id = payload.get('subtaskId')
            for t in tasks:
                if t.get('id') == entity_id:
                    for s in (t.get('subtasks') or []):
                        if s.get('id') == sub_id:
                            s['status'] = payload.get('status', 'completed')
                            s['progress'] = payload.get('progress', 100)
                    break
            if '_task_meta' not in user_data:
                user_data['_task_meta'] = {}
            user_data['_task_meta'][entity_id] = {'updated_at': datetime.now().isoformat()}

        elif op_type == 'ar_unlock':
            if 'ar_unlocks' not in user_data:
                user_data['ar_unlocks'] = []
            ar_list = user_data['ar_unlocks']
            if not any(r.get('marker_id') == entity_id for r in ar_list):
                ar_list.append({
                    'marker_id': entity_id,
                    'data': payload,
                    'unlocked_at': local_ts
                })

        _log_operation(user_id, op_id, op_type, entity_id, action, payload, local_ts)
        synced_count += 1

    _save_user_data(user_id, user_data)

    return jsonify({
        'success': True,
        'synced': synced_count,
        'conflicts': conflicts
    })


# ============================================
# API：GET /api/sync/pull
# 拉取用户最新云端数据
# ============================================
@sync_bp.route('/pull', methods=['GET'])
@_require_auth
def sync_pull():
    user_id = request.user_id
    user_data = _load_user_data(user_id)

    return jsonify({
        'success': True,
        'user_state': user_data.get('user'),
        'tasks': user_data.get('tasks', []),
        'ar_records': user_data.get('ar_unlocks', []),
        'server_timestamp': datetime.now().isoformat()
    })
