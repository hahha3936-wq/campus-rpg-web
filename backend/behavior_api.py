"""
校园RPG - 用户行为埋点与统计 API
提供埋点数据接收、存储和效果统计功能
"""
import sqlite3
import os
import json
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta

behavior_bp = Blueprint('behavior', __name__)

# 埋点数据库路径
BEHAVIOR_DB = os.path.join(os.path.dirname(__file__), '..', 'data', 'behavior_log.db')
BEHAVIOR_DB = os.path.abspath(BEHAVIOR_DB)


def _get_bh_db():
    """获取埋点数据库连接"""
    os.makedirs(os.path.dirname(BEHAVIOR_DB), exist_ok=True)
    conn = sqlite3.connect(BEHAVIOR_DB, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def _init_bh_db():
    """初始化埋点数据库表"""
    conn = _get_bh_db()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS behavior_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                user_id TEXT,
                event_data TEXT,
                timestamp TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        ''')
        # 索引加速查询
        conn.execute('CREATE INDEX IF NOT EXISTS idx_event_type ON behavior_log(event_type)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_user_id ON behavior_log(user_id)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_timestamp ON behavior_log(timestamp)')
        conn.commit()
    finally:
        conn.close()


_init_bh_db()


# ============================================
# 管理员白名单（user_id 列表，可从环境变量配置 ADMIN_USERS=user1,user2）
# ============================================
ADMIN_USERS = set(filter(None, os.environ.get('ADMIN_USERS', '').split(',')))


def _is_admin(user_id):
    """检查是否为管理员"""
    return user_id in ADMIN_USERS


# ============================================
# API：接收埋点数据
# ============================================
@behavior_bp.route('/log', methods=['POST'])
def log_behavior():
    """接收前端埋点数据并存储到 SQLite"""
    try:
        body = request.json or {}
        event_type = body.get('event_type')
        user_id = body.get('user_id', 'anonymous')
        event_data = body.get('data', {})
        timestamp = body.get('timestamp', datetime.now().isoformat())

        if not event_type:
            return jsonify({'success': False, 'message': '缺少 event_type'}), 400

        conn = _get_bh_db()
        try:
            conn.execute(
                'INSERT INTO behavior_log (event_type, user_id, event_data, timestamp, created_at) '
                'VALUES (?, ?, ?, ?, ?)',
                (event_type, user_id, json.dumps(event_data, ensure_ascii=False),
                 timestamp, datetime.now().isoformat())
            )
            conn.commit()
        finally:
            conn.close()

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ============================================
# API：效果统计数据（仅管理员可访问）
# ============================================
@behavior_bp.route('/statistics', methods=['GET'])
def get_statistics():
    """获取整体效果统计数据"""
    # 从 Authorization header 中提取 user_id 进行权限校验
    auth_header = request.headers.get('Authorization', '')
    user_id = None
    if auth_header.startswith('Bearer '):
        try:
            import jwt
            token = auth_header[7:]
            payload = jwt.decode(token, os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026'),
                               algorithms=['HS256'])
            user_id = payload.get('user_id')
        except Exception:
            pass

    if ADMIN_USERS and not _is_admin(user_id):
        return jsonify({'error': '无权限访问，请联系管理员'}), 403

    conn = _get_bh_db()
    try:
        cursor = conn.cursor()
        now = datetime.now()
        week_ago = (now - timedelta(days=7)).isoformat()
        month_ago = (now - timedelta(days=30)).isoformat()

        # --- 任务完成率 ---
        # 7日内有完成记录的用户数
        cursor.execute('''
            SELECT COUNT(DISTINCT user_id) FROM behavior_log
            WHERE event_type = ? AND timestamp >= ?
        ''', ('task_completion', week_ago))
        task_active_users = cursor.fetchone()[0] or 0

        # 7日内有任意行为的用户数（作为分母）
        cursor.execute('''
            SELECT COUNT(DISTINCT user_id) FROM behavior_log WHERE timestamp >= ?
        ''', (week_ago,))
        total_active_users = cursor.fetchone()[0] or 0

        task_completion_rate = round(
            task_active_users / max(total_active_users, 1) * 100, 1
        )

        # --- 平均完成时长（秒，近30天）---
        cursor.execute('''
            SELECT AVG(CAST(json_extract(event_data, '$.duration_seconds') AS REAL))
            FROM behavior_log
            WHERE event_type = ? AND timestamp >= ?
              AND json_extract(event_data, '$.duration_seconds') IS NOT NULL
        ''', ('task_completion', month_ago))
        row = cursor.fetchone()
        avg_duration = round(row[0] if row and row[0] else 0, 1)

        # --- AR累计解锁次数 ---
        cursor.execute(
            'SELECT COUNT(*) FROM behavior_log WHERE event_type = ?',
            ('ar_marker_found',)
        )
        ar_total = cursor.fetchone()[0] or 0

        # --- AR近30日解锁次数 ---
        cursor.execute(
            'SELECT COUNT(*) FROM behavior_log WHERE event_type = ? AND timestamp >= ?',
            ('ar_marker_found', month_ago)
        )
        ar_monthly = cursor.fetchone()[0] or 0

        # --- 7日留存率 ---
        # 上周登录用户数
        two_weeks_ago = (now - timedelta(days=14)).isoformat()
        last_week_start = (now - timedelta(days=7)).isoformat()
        cursor.execute('''
            SELECT COUNT(DISTINCT user_id) FROM behavior_log
            WHERE event_type = ? AND timestamp >= ? AND timestamp < ?
        ''', ('user_login', two_weeks_ago, last_week_start))
        last_week_users = cursor.fetchone()[0] or 0

        # 本周登录用户数
        cursor.execute('''
            SELECT COUNT(DISTINCT user_id) FROM behavior_log
            WHERE event_type = ? AND timestamp >= ?
        ''', ('user_login', last_week_start))
        this_week_users = cursor.fetchone()[0] or 0

        retention_rate = (
            round(this_week_users / max(last_week_users, 1) * 100, 1)
            if last_week_users > 0 else 0.0
        )

        # --- 近7天每日任务完成趋势 ---
        daily_task_completions = []
        for i in range(6, -1, -1):
            day = (now - timedelta(days=i)).strftime('%Y-%m-%d')
            cursor.execute('''
                SELECT COUNT(*) FROM behavior_log
                WHERE event_type = ? AND timestamp LIKE ?
            ''', ('task_completion', f'{day}%'))
            daily_task_completions.append({
                'date': day,
                'count': cursor.fetchone()[0] or 0
            })

        # --- 近7天每日登录用户数 ---
        daily_logins = []
        for i in range(6, -1, -1):
            day = (now - timedelta(days=i)).strftime('%Y-%m-%d')
            cursor.execute('''
                SELECT COUNT(DISTINCT user_id) FROM behavior_log
                WHERE event_type = ? AND timestamp LIKE ?
            ''', ('user_login', f'{day}%'))
            daily_logins.append({
                'date': day,
                'count': cursor.fetchone()[0] or 0
            })

        # --- 各事件类型占比 ---
        cursor.execute('''
            SELECT event_type, COUNT(*) as cnt FROM behavior_log
            WHERE timestamp >= ? GROUP BY event_type ORDER BY cnt DESC
        ''', (month_ago,))
        event_distribution = [
            {'event_type': row['event_type'], 'count': row['cnt']}
            for row in cursor.fetchall()
        ]

        # --- 总埋点事件数 ---
        cursor.execute('SELECT COUNT(*) FROM behavior_log')
        total_events = cursor.fetchone()[0] or 0

        return jsonify({
            'success': True,
            'statistics': {
                'task_completion_rate': task_completion_rate,
                'avg_completion_duration_seconds': avg_duration,
                'ar_total_unlocks': ar_total,
                'ar_monthly_unlocks': ar_monthly,
                'retention_rate_7d': retention_rate,
                'daily_task_completions': daily_task_completions,
                'daily_logins': daily_logins,
                'event_distribution': event_distribution,
                'total_events': total_events,
                'active_users_7d': total_active_users,
                'task_active_users_7d': task_active_users
            }
        })
    finally:
        conn.close()


# ============================================
# API：获取最近埋点日志（仅管理员）
# ============================================
@behavior_bp.route('/logs', methods=['GET'])
def get_recent_logs():
    """获取最近埋点日志（分页，仅管理员）"""
    auth_header = request.headers.get('Authorization', '')
    user_id = None
    if auth_header.startswith('Bearer '):
        try:
            import jwt
            token = auth_header[7:]
            payload = jwt.decode(token, os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026'),
                               algorithms=['HS256'])
            user_id = payload.get('user_id')
        except Exception:
            pass

    if ADMIN_USERS and not _is_admin(user_id):
        return jsonify({'error': '无权限访问'}), 403

    limit = min(int(request.args.get('limit', 50)), 200)
    offset = int(request.args.get('offset', 0))

    conn = _get_bh_db()
    try:
        cursor = conn.cursor()

        cursor.execute(
            'SELECT id, event_type, user_id, event_data, timestamp, created_at '
            'FROM behavior_log ORDER BY id DESC LIMIT ? OFFSET ?',
            (limit, offset)
        )
        rows = cursor.fetchall()

        logs = []
        for row in rows:
            try:
                event_data = json.loads(row['event_data']) if row['event_data'] else {}
            except Exception:
                event_data = {}
            logs.append({
                'id': row['id'],
                'event_type': row['event_type'],
                'user_id': row['user_id'],
                'event_data': event_data,
                'timestamp': row['timestamp'],
                'created_at': row['created_at']
            })

        cursor.execute('SELECT COUNT(*) FROM behavior_log')
        total = cursor.fetchone()[0] or 0

        return jsonify({
            'success': True,
            'logs': logs,
            'total': total,
            'limit': limit,
            'offset': offset
        })
    finally:
        conn.close()
