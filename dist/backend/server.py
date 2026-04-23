"""
校园RPG - Flask 后端服务器
提供RESTful API接口，支持数据持久化
"""

from flask import Flask, jsonify, request, send_from_directory, Response, make_response
from flask_cors import CORS
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta
import random
import sqlite3
import time
import functools
import jwt
import hashlib
import uuid
import requests

app = Flask(__name__, static_folder='..')
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:*", "http://127.0.0.1:*"]}})

# 注册AR蓝图（新增AR接口，不修改现有路由）
try:
    from ar_api import ar_bp
    app.register_blueprint(ar_bp, url_prefix='/api/ar')
except ImportError as e:
    print(f'[AR] ar_api.py 加载失败: {e}，AR功能暂时不可用')

# 注册语音对话蓝图（DeepSeek Chat）
try:
    from chat_api import chat_bp
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
except ImportError as e:
    print(f'[Chat] chat_api.py 加载失败: {e}，语音对话功能暂时不可用')

# ============================================
# JWT / 密码认证配置
# ============================================
JWT_SECRET = os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = 24 * 7  # 7天有效期

# ============================================
# SQLite 用户数据库
# ============================================
DB_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'users.db')
DB_FILE = os.path.abspath(DB_FILE)

def _get_db():
    """获取数据库连接（每次请求创建新连接，线程安全）"""
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def _init_db():
    """初始化用户数据库表"""
    conn = _get_db()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                nickname TEXT,
                created_at TEXT NOT NULL,
                last_login TEXT
            )
        ''')
        conn.commit()
    finally:
        conn.close()

_init_db()

def _hash_password(password):
    """对密码进行 SHA-256 + salt 哈希"""
    salt = 'campus_rpg_salt_2026'
    return hashlib.sha256((salt + password).encode()).hexdigest()

def _generate_token(user_id):
    """生成 JWT token"""
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def _verify_token(token):
    """验证并解码 JWT token，返回 user_id 或 None"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get('user_id')
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def _require_auth(f):
    """API 认证装饰器：验证 Authorization: Bearer <token>"""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': '未登录，请先登录'}), 401
        token = auth_header[7:]
        user_id = _verify_token(token)
        if not user_id:
            return jsonify({'error': '登录已过期，请重新登录'}), 401
        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated

def _get_user_data_file(user_id=None):
    """根据 user_id 获取用户数据文件路径"""
    uid = user_id or getattr(request, 'user_id', None) or 'guest'
    return os.path.join(DATA_DIR, f'user_data_{uid}.json')

def _load_user_data(user_id=None):
    """加载当前登录用户的数据（未登录则返回空）"""
    uid = user_id or getattr(request, 'user_id', None)
    if not uid:
        return None
    filepath = _get_user_data_file(uid)
    return load_json(filepath)

def _save_user_data(data, user_id=None):
    """保存当前登录用户的数据"""
    uid = user_id or getattr(request, 'user_id', None)
    if not uid:
        return False
    filepath = _get_user_data_file(uid)
    return save_json(filepath, data)

def _get_or_create_user_data(user_id=None):
    """获取用户数据，不存在则创建默认数据"""
    uid = user_id or getattr(request, 'user_id', None)
    if not uid:
        return get_default_user_data()
    filepath = _get_user_data_file(uid)
    data = load_json(filepath)
    if data is None:
        data = get_default_user_data()
        save_json(filepath, data)
    return data

# ============================================
# 认证 API 路由
# ============================================

@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    """用户注册"""
    data = request.json or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    nickname = (data.get('nickname') or username or '冒险者').strip()

    if not username or len(username) < 3:
        return jsonify({'error': '用户名至少需要3个字符'}), 400
    if len(password) < 6:
        return jsonify({'error': '密码至少需要6个字符'}), 400

    conn = _get_db()
    try:
        # 检查用户名是否已存在
        existing = conn.execute(
            'SELECT id FROM users WHERE username = ?', (username,)
        ).fetchone()
        if existing:
            return jsonify({'error': '用户名已存在'}), 409

        # 创建新用户
        user_id = str(uuid.uuid4())[:8]
        password_hash = _hash_password(password)
        created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        conn.execute(
            'INSERT INTO users (id, username, password_hash, nickname, created_at) VALUES (?, ?, ?, ?, ?)',
            (user_id, username, password_hash, nickname, created_at)
        )
        conn.commit()

        # 为新用户创建默认数据
        default_data = get_default_user_data()
        default_data['user']['name'] = nickname
        user_file = _get_user_data_file(user_id)
        save_json(user_file, default_data)

        token = _generate_token(user_id)
        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': user_id,
                'username': username,
                'nickname': nickname
            }
        })
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """用户登录"""
    data = request.json or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return jsonify({'error': '请输入用户名和密码'}), 400

    conn = _get_db()
    try:
        user = conn.execute(
            'SELECT id, username, password_hash, nickname FROM users WHERE username = ?',
            (username,)
        ).fetchone()

        if not user or user['password_hash'] != _hash_password(password):
            return jsonify({'error': '用户名或密码错误'}), 401

        # 更新最后登录时间
        conn.execute(
            'UPDATE users SET last_login = ? WHERE id = ?',
            (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), user['id'])
        )
        conn.commit()

        token = _generate_token(user['id'])
        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'nickname': user['nickname'] or user['username']
            }
        })
    finally:
        conn.close()

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    """登出（前端删除 token 即可，后端无需操作）"""
    return jsonify({'success': True})

@app.route('/api/auth/me', methods=['GET'])
@_require_auth
def auth_me():
    """获取当前登录用户信息"""
    conn = _get_db()
    try:
        user = conn.execute(
            'SELECT id, username, nickname, created_at, last_login FROM users WHERE id = ?',
            (request.user_id,)
        ).fetchone()
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        return jsonify({
            'id': user['id'],
            'username': user['username'],
            'nickname': user['nickname'] or user['username'],
            'created_at': user['created_at'],
            'last_login': user['last_login']
        })
    finally:
        conn.close()

# ============================================
# 数据目录
# ============================================
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
DATA_DIR = os.path.abspath(DATA_DIR)
os.makedirs(DATA_DIR, exist_ok=True)

# 数据文件路径
TASKS_DATA_FILE = os.path.join(DATA_DIR, 'task_data.json')
ACHIEVEMENTS_DATA_FILE = os.path.join(DATA_DIR, 'achievement_data.json')

def _acquire_lock(filepath):
    """跨平台文件锁（Windows: msvcrt / Unix: fcntl），使用非阻塞锁避免永久阻塞"""
    lock_path = filepath + '.lock'
    for attempt in range(50):
        try:
            lock_file = open(lock_path, 'w')
            if sys.platform == 'win32':
                import msvcrt
                try:
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                    return lock_file
                except (IOError, OSError):
                    lock_file.close()
                    time.sleep(0.05)
                    continue
            else:
                import fcntl
                try:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    return lock_file
                except (IOError, OSError):
                    lock_file.close()
                    time.sleep(0.05)
                    continue
        except Exception:
            time.sleep(0.05)
            continue
    # 超时：返回 None，让调用者决定如何处理
    return None

def _release_lock(lock_file, filepath):
    """释放文件锁"""
    lock_path = filepath + '.lock'
    if sys.platform == 'win32':
        import msvcrt
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    lock_file.close()
    try:
        os.remove(lock_path)
    except OSError:
        pass

def load_json(filepath, default=None):
    """加载JSON文件（带锁保护，防止读到正在写入的半成品数据）"""
    lock_path = filepath + '.lock'
    for attempt in range(5):
        try:
            if os.path.exists(filepath):
                # 非阻塞尝试获取锁
                lock_file = open(lock_path, 'w')
                if sys.platform == 'win32':
                    import msvcrt
                    try:
                        msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                    except (IOError, OSError):
                        lock_file.close()
                        time.sleep(0.05)
                        continue
                else:
                    import fcntl
                    try:
                        fcntl.flock(lock_file.fileno(), fcntl.LOCK_SH | fcntl.LOCK_NB)
                    except (IOError, OSError):
                        lock_file.close()
                        time.sleep(0.05)
                        continue
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        return json.load(f)
                finally:
                    if sys.platform == 'win32':
                        msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                    else:
                        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
                    lock_file.close()
                    try:
                        os.remove(lock_path)
                    except OSError:
                        pass
        except Exception as e:
            print(f"加载文件失败 {filepath}: {e}")
            return default
    # 重试失败，直接读（大概率是旧数据）
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default

def save_json(filepath, data):
    """保存JSON文件（原子写入 + 非阻塞跨平台文件锁，防止永久阻塞）"""
    try:
        lock_file = _acquire_lock(filepath)
        if lock_file is None:
            # 锁超时，尝试直接写入（可能覆盖其他进程数据，但避免永久阻塞）
            print(f"警告：无法获取文件锁 {filepath}，尝试直接写入")
            fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(filepath), suffix='.tmp')
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, filepath)
            return True
        try:
            # 原子写入：先写临时文件，再 rename（rename 在 POSIX 下原子）
            fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(filepath), suffix='.tmp')
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, filepath)  # 原子覆盖
        finally:
            if lock_file:
                _release_lock(lock_file, filepath)
        return True
    except Exception as e:
        print(f"保存文件失败 {filepath}: {e}")
        return False

def get_default_user_data():
    """获取默认用户数据"""
    return {
        "user": {
            "name": "同学",
            "school": "合肥财经大学·物联网应用技术",
            "grade": "大一",
            "goals": ["过四级", "不挂科", "学完高数"],
            "apps": {"timetable": "WakeUp课程表", "campus": "学习通"},
            "interest": "动漫",
            "lazy_level": 2,
            "party_size": 2,
            "long_term_goals": [],
            "short_term_plans": []
        },
        "role": {
            "level": 1,
            "experience": 0,
            "experience_needed": 100,
            "gold": 50
        },
        "stats": {
            "energy": 100,
            "focus": 100,
            "mood": 100,
            "stress": 20,
            "total_tasks_completed": 0,
            "total_achievements_unlocked": 5,
            "days_active": 1,
            "current_streak": 1
        },
        "npc_relationship": {
            "naruto": {"affection": 20, "max_affection": 100, "title": "热血导师"},
            "sasuke": {"affection": 10, "max_affection": 100, "title": "傲娇助教"}
        },
        "buffs": [
            {"name": "动漫联动", "description": "学习效率+15%", "duration": "今日有效", "icon": "🎬"}
        ],
        "inventory": [
            {"name": "经验药水", "description": "使用后获得20点经验", "quantity": 3, "icon": "🧪"},
            {"name": "能量饮料", "description": "恢复30点能量", "quantity": 2, "icon": "🥤"}
        ],
        "exploration": {
            "discovered_locations": [],
            "current_location": "dorm",
            "exploration_streak": 0,
            "hidden_events_found": []
        },
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

# ============================================
# API路由 - 用户数据
# ============================================

@app.route('/api/user', methods=['GET'])
@_require_auth
def get_user():
    """获取用户数据"""
    data = _load_user_data(request.user_id)
    if data is not None:
        return jsonify(data)
    data = get_default_user_data()
    return jsonify(data)

@app.route('/api/user', methods=['POST'])
@_require_auth
def update_user():
    """更新用户数据"""
    data = request.json
    if data:
        data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if _save_user_data(data):
            return jsonify({"success": True, "message": "用户数据已更新"})
    return jsonify({"success": False, "message": "更新失败"}), 400

@app.route('/api/user/stats', methods=['POST'])
@_require_auth
def update_user_stats():
    """更新用户状态值"""
    data = _get_or_create_user_data()
    stats_update = request.json

    if stats_update:
        if 'stats' not in data:
            data['stats'] = {}

        for key, value in stats_update.items():
            if key in ['energy', 'focus', 'mood', 'stress']:
                data['stats'][key] = max(0, min(100, value))
            elif key in ['gold', 'experience']:
                data['role'][key] = max(0, value)
            else:
                data[key] = value

        data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if _save_user_data(data):
            return jsonify({"success": True, "data": data})

    return jsonify({"success": False, "message": "更新失败"}), 400


@app.route('/api/user/profile', methods=['POST'])
@_require_auth
def update_user_profile():
    """更新用户个人资料和目标计划"""
    body = request.json or {}
    user_data = _get_or_create_user_data()
    user_section = user_data.get('user', {})

    # 允许更新的个人资料字段
    profile_fields = ['name', 'school', 'grade', 'apps', 'interest', 'lazy_level', 'party_size', 'goals']
    for field in profile_fields:
        if field in body:
            user_section[field] = body[field]

    # 允许更新的长期目标
    if 'long_term_goals' in body:
        user_section['long_term_goals'] = body['long_term_goals']

    # 允许更新的短期计划
    if 'short_term_plans' in body:
        user_section['short_term_plans'] = body['short_term_plans']

    user_data['user'] = user_section
    user_data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if _save_user_data(user_data):
        return jsonify({"success": True, "user": user_data})

    return jsonify({"success": False, "message": "保存失败"}), 400


# ============================================
# AI 任务推荐系统
# ============================================
TASK_RECOMMEND_SYSTEM = """你扮演「阿游」的任务规划专家。你需要根据用户的目标和当前状态，生成3-5个可执行的学习/成长任务。

输出要求：只返回JSON数组，不要任何其他文字说明，不要markdown格式。

每个任务必须包含以下字段：
- name: 任务名称（简短有力）
- description: 详细描述（1-2句话）
- category: 任务类别，必须是 main / side / daily / hidden 之一
- difficulty: 难度，必须是 easy / medium / hard 之一
- reward: {"experience": 数字, "gold": 数字, "skill_points": 数字}
- deadline: 建议完成日期（格式 YYYY-MM-DD，距离今天不超过14天）
- tags: 与目标相关的标签数组（2-4个中文标签）
- suggested_subtasks: 子任务数组，每个子任务包含 id 和 name

分析以下信息后生成任务：
1. 用户的长期目标
2. 用户的短期计划
3. 用户的角色等级和状态
4. 已有未完成的任务（避免重复推荐）
5. 用户的懒散程度（lazy_level: 1-5，越高越需要简单任务引导）

只推荐当前用户最需要的3-5个任务，按优先级排序。"""


def _build_recommend_context(user_data, existing_tasks):
    """构建传递给 AI 的用户上下文"""
    user = user_data.get('user', {})
    role = user_data.get('role', {})

    # 过滤掉已完成的任务ID
    completed_ids = [t['id'] for t in existing_tasks if t.get('status') == 'completed']
    pending_tasks = [t for t in existing_tasks if t.get('status') != 'completed']

    # 收集已有任务的标签，避免重复
    existing_tags = set()
    for t in existing_tasks:
        for tag in t.get('tags', []):
            existing_tags.add(tag)

    return {
        'long_term_goals': user.get('long_term_goals', []),
        'short_term_plans': user.get('short_term_plans', []),
        'basic_info': {
            'name': user.get('name', '同学'),
            'school': user.get('school', ''),
            'grade': user.get('grade', ''),
            'interest': user.get('interest', ''),
            'lazy_level': user.get('lazy_level', 2),
        },
        'role': {
            'level': role.get('level', 1),
            'experience': role.get('experience', 0),
            'experience_needed': role.get('experience_needed', 100),
        },
        'stats': user_data.get('stats', {}),
        'existing_tasks': pending_tasks[:10],  # 只传前10个
        'existing_tags': list(existing_tags),
        'today': datetime.now().strftime('%Y-%m-%d')
    }


@app.route('/api/tasks/recommend', methods=['POST'])
@_require_auth
def recommend_tasks():
    """AI 根据用户目标推荐个性化任务"""
    try:
        user_data = _get_or_create_user_data()
        tasks_data = load_json(TASKS_DATA_FILE) or {"tasks": []}
        existing_tasks = tasks_data.get('tasks', [])

        context = _build_recommend_context(user_data, existing_tasks)

        context_text = f"""
用户信息：
- 姓名：{context['basic_info']['name']}
- 学校：{context['basic_info']['school']} {context['basic_info']['grade']}
- 兴趣：{context['basic_info']['interest']}
- 懒散程度：{context['basic_info']['lazy_level']}/5

角色状态：
- 等级：Lv.{context['role']['level']}
- 经验：{context['role']['experience']}/{context['role']['experience_needed']}

长期目标（{len(context['long_term_goals'])}个）：
{chr(10).join([f"  - {g.get('title', '')}: {g.get('description', '')}" for g in context['long_term_goals']]) if context['long_term_goals'] else '  （暂无）'}

短期计划（{len(context['short_term_plans'])}个）：
{chr(10).join([f"  - {p.get('title', '')}（截止 {p.get('deadline', '未设')}）" for p in context['short_term_plans']]) if context['short_term_plans'] else '  （暂无）'}

今日日期：{context['today']}

请根据以上信息生成3-5个个性化任务，输出JSON数组。
"""

        # 非流式调用 DeepSeek API（在请求上下文中完成，存储逻辑不受 SSE 影响）
        headers_ds = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {DEEPSEEK_API_KEY}'
        }
        payload = {
            'model': DEEPSEEK_MODEL,
            'messages': [
                {'role': 'system', 'content': TASK_RECOMMEND_SYSTEM},
                {'role': 'user', 'content': context_text}
            ],
            'stream': False
        }

        resp = requests.post(
            f'{DEEPSEEK_BASE_URL}/chat/completions',
            json=payload, headers=headers_ds, timeout=60
        )

        if not resp.ok:
            err_msg = ''
            try:
                err_msg = resp.json().get('error', {}).get('message', resp.text[:200])
            except Exception:
                err_msg = resp.text[:200]
            return jsonify({'error': f'AI错误: {err_msg}'}), 502

        resp_data = resp.json()
        content = resp_data.get('choices', [{}])[0].get('message', {}).get('content', '')

        # 解析 JSON 数组并存储
        import re
        json_match = re.search(r'\[[\s\S]+\]', content)
        tasks_json = []
        if json_match:
            try:
                tasks_json = json.loads(json_match.group())
                if isinstance(tasks_json, list) and len(tasks_json) > 0:
                    user_data['recommended_tasks'] = tasks_json
                    user_data['recommended_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    _save_user_data(user_data)
            except Exception as e:
                print(f"[recommend] 解析推荐任务失败: {e}")

        return jsonify({
            'success': True,
            'tasks': tasks_json if isinstance(tasks_json, list) else [],
            'content': content,
            'recommended_at': user_data.get('recommended_at', '')
        })

    except requests.exceptions.ConnectionError:
        return jsonify({'error': '无法连接到DeepSeek API'}), 503
    except Exception as e:
        print(f"[recommend] 推荐失败: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks/recommended', methods=['GET'])
@_require_auth
def get_recommended_tasks():
    """获取最近一次AI推荐的任务列表"""
    user_data = _get_or_create_user_data()
    recommended = user_data.get('recommended_tasks', [])
    recommended_at = user_data.get('recommended_at', '')
    return jsonify({
        'tasks': recommended,
        'recommended_at': recommended_at
    })

@app.route('/api/user/experience', methods=['POST'])
@_require_auth
def add_experience():
    """添加经验值"""
    data = _get_or_create_user_data()
    result = request.json
    amount = result.get('amount', 0)
    
    if amount > 0:
        data['role']['experience'] += amount
        
        # 检查是否升级
        while data['role']['experience'] >= data['role']['experience_needed']:
            data['role']['experience'] -= data['role']['experience_needed']
            data['role']['level'] += 1
            data['role']['experience_needed'] = data['role']['level'] * 100
            data['role']['gold'] += 50  # 升级奖励
        
        data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        _save_user_data(data)
        
        return jsonify({
            "success": True,
            "level_up": data['role']['level'],
            "experience": data['role']['experience'],
            "gold": data['role']['gold']
        })
    
    return jsonify({"success": False, "message": "经验值添加失败"}), 400

@app.route('/api/user/npc/<npc_id>/affection', methods=['POST'])
@_require_auth
def update_npc_affection(npc_id):
    """更新NPC好感度"""
    data = _get_or_create_user_data()
    result = request.json
    amount = result.get('amount', 0)
    
    if npc_id in data.get('npc_relationship', {}):
        npc = data['npc_relationship'][npc_id]
        npc['affection'] = min(npc['max_affection'], npc['affection'] + amount)
        data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        _save_user_data(data)
        
        return jsonify({
            "success": True,
            "npc_id": npc_id,
            "affection": npc['affection']
        })
    
    return jsonify({"success": False, "message": "NPC不存在"}), 400

# ============================================
# API路由 - 每日签到
# ============================================

def _get_signin_rewards(streak):
    """根据连续签到天数计算奖励"""
    if streak == 1:
        return {'experience': 10, 'gold': 5}
    elif streak <= 3:
        return {'experience': 15, 'gold': 10}
    elif streak <= 7:
        return {'experience': 25, 'gold': 20}
    elif streak <= 14:
        return {'experience': 40, 'gold': 35}
    elif streak <= 30:
        return {'experience': 60, 'gold': 50}
    else:
        return {'experience': 100, 'gold': 80}

@app.route('/api/signin', methods=['GET'])
@_require_auth
def get_signin_status():
    """获取今日签到状态"""
    data = _load_user_data(request.user_id)
    if data is None:
        data = get_default_user_data()
    signin = data.get('signin', {})
    today = datetime.now().strftime("%Y-%m-%d")

    today_signed = today in signin.get('records', [])
    rewards = _get_signin_rewards(signin.get('current_streak', 0))

    return jsonify({
        'today_signed': today_signed,
        'current_streak': signin.get('current_streak', 0),
        'longest_streak': signin.get('longest_streak', 0),
        'total_signins': signin.get('total_signins', 0),
        'next_rewards': rewards,
        'today': today
    })

@app.route('/api/signin', methods=['POST'])
@_require_auth
def do_signin():
    """执行签到"""
    data = _get_or_create_user_data()
    today = datetime.now().strftime("%Y-%m-%d")

    signin = data.get('signin', {
        'last_signin_date': '',
        'total_signins': 0,
        'longest_streak': 0,
        'records': []
    })

    records = signin.get('records', [])

    # 今日已签到
    if today in records:
        return jsonify({
            'success': False,
            'message': '今日已签到',
            'already_signed': True
        }), 400

    # 计算连续天数
    yesterday = (datetime.now() - __import__('datetime').timedelta(days=1)).strftime("%Y-%m-%d")
    if signin.get('last_signin_date') == yesterday:
        signin['current_streak'] = signin.get('current_streak', 0) + 1
    else:
        signin['current_streak'] = 1

    # 更新记录
    signin['last_signin_date'] = today
    signin['total_signins'] = signin.get('total_signins', 0) + 1
    signin['longest_streak'] = max(signin.get('longest_streak', 0), signin['current_streak'])

    # 只保留近90天记录
    records.append(today)
    if len(records) > 90:
        records = records[-90:]
    signin['records'] = records

    data['signin'] = signin

    # 发放奖励
    rewards = _get_signin_rewards(signin['current_streak'])
    data['role']['experience'] += rewards['experience']
    data['role']['gold'] += rewards['gold']
    data['stats']['energy'] = min(100, data['stats'].get('energy', 100) + 10)

    # 检查升级
    level_ups = 0
    while data['role']['experience'] >= data['role']['experience_needed']:
        data['role']['experience'] -= data['role']['experience_needed']
        data['role']['level'] += 1
        data['role']['experience_needed'] = data['role']['level'] * 100
        data['role']['gold'] += 50
        level_ups += 1

    data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _save_user_data(data)

    return jsonify({
        'success': True,
        'streak': signin['current_streak'],
        'rewards': rewards,
        'role': data['role'],
        'level_ups': level_ups
    })

@app.route('/api/user/inventory/<item_name>', methods=['POST'])
@_require_auth
def use_inventory_item(item_name):
    """使用背包物品"""
    data = _get_or_create_user_data()
    
    inventory = data.get('inventory', [])
    item = next((i for i in inventory if i['name'] == item_name), None)
    
    if item and item['quantity'] > 0:
        item['quantity'] -= 1
        data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        _save_user_data(data)
        
        # 根据物品类型返回效果
        effects = {}
        if item_name == '经验药水':
            effects = {'experience': 20}
        elif item_name == '能量饮料':
            data['stats']['energy'] = min(100, data['stats']['energy'] + 30)
            effects = {'energy': 30}
        
        return jsonify({
            "success": True,
            "item_used": item_name,
            "effects": effects,
            "remaining": item['quantity']
        })
    
    return jsonify({"success": False, "message": "物品不存在或数量不足"}), 400

# ============================================
# API路由 - 番茄钟统计
# ============================================

@app.route('/api/pomodoro/stats', methods=['GET'])
@_require_auth
def get_pomodoro_stats():
    """获取番茄钟统计数据"""
    data = _get_or_create_user_data()
    pomodoro = data.get('pomodoro', {
        'total_sessions': 0,
        'total_minutes': 0,
        'total_focus_score': 0,
        'records': {}
    })
    return jsonify(pomodoro)

@app.route('/api/pomodoro/session', methods=['POST'])
@_require_auth
def record_pomodoro_session():
    """记录一个番茄钟完成"""
    data = _get_or_create_user_data()
    body = request.json or {}
    minutes = body.get('minutes', 25)
    completed = body.get('completed', False)
    task_id = body.get('task_id', '')

    pomodoro = data.get('pomodoro', {
        'total_sessions': 0,
        'total_minutes': 0,
        'total_focus_score': 0,
        'records': {}
    })

    today = datetime.now().strftime("%Y-%m-%d")

    if completed:
        pomodoro['total_sessions'] += 1
        pomodoro['total_minutes'] += minutes
        pomodoro['total_focus_score'] += minutes * 2
        # 今日记录
        if today not in pomodoro['records']:
            pomodoro['records'][today] = {'sessions': 0, 'minutes': 0}
        pomodoro['records'][today]['sessions'] += 1
        pomodoro['records'][today]['minutes'] += minutes
        # 专注力 +15
        data['stats']['focus'] = min(100, data['stats'].get('focus', 100) + 15)
        data['stats']['energy'] = max(0, data['stats'].get('energy', 100) - 10)
        # 经验
        data['role']['experience'] += 10
        while data['role']['experience'] >= data['role']['experience_needed']:
            data['role']['experience'] -= data['role']['experience_needed']
            data['role']['level'] += 1
            data['role']['experience_needed'] = data['role']['level'] * 100
            data['role']['gold'] += 50

    data['pomodoro'] = pomodoro
    data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _save_user_data(data)

    return jsonify({
        'success': True,
        'pomodoro': pomodoro,
        'role': data['role'],
        'stats': data['stats']
    })

# ============================================
# API路由 - 任务数据
# ============================================

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """获取所有任务"""
    data = load_json(TASKS_DATA_FILE)
    if data is None:
        data = {"tasks": [], "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    return jsonify(data)

@app.route('/api/tasks', methods=['POST'])
def update_tasks():
    """更新任务数据"""
    data = request.json
    if data:
        data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if save_json(TASKS_DATA_FILE, data):
            return jsonify({"success": True, "message": "任务数据已更新"})
    return jsonify({"success": False, "message": "更新失败"}), 400

@app.route('/api/tasks/<task_id>/subtask/<subtask_id>', methods=['POST'])
def complete_subtask(task_id, subtask_id):
    """完成任务子项"""
    data = load_json(TASKS_DATA_FILE)
    if data is None:
        return jsonify({"success": False, "message": "任务数据不存在"}), 404
    
    tasks = data.get('tasks', [])
    task = next((t for t in tasks if t['id'] == task_id), None)
    
    if task:
        subtask = next((s for s in task.get('subtasks', []) if s['id'] == subtask_id), None)
        
        if subtask and subtask['status'] != 'completed':
            subtask['status'] = 'completed'
            subtask['progress'] = 100
            
            # 重新计算任务进度
            completed = sum(1 for s in task['subtasks'] if s['status'] == 'completed')
            task['progress'] = round((completed / len(task['subtasks'])) * 100)
            
            if task['progress'] >= 100:
                task['status'] = 'completed'
            
            data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            save_json(TASKS_DATA_FILE, data)
            
            return jsonify({
                "success": True,
                "task_id": task_id,
                "subtask_id": subtask_id,
                "task_progress": task['progress'],
                "task_status": task['status'],
                "reward": subtask.get('experience', 0)
            })
    
    return jsonify({"success": False, "message": "子任务不存在或已完成"}), 400

@app.route('/api/tasks/<task_id>/progress', methods=['POST'])
def update_task_progress(task_id):
    """更新任务进度"""
    data = load_json(TASKS_DATA_FILE)
    if data is None:
        return jsonify({"success": False, "message": "任务数据不存在"}), 404
    
    result = request.json
    amount = result.get('amount', 0)
    
    tasks = data.get('tasks', [])
    task = next((t for t in tasks if t['id'] == task_id), None)
    
    if task:
        task['progress'] = min(100, task['progress'] + amount)
        if task['progress'] >= 100:
            task['status'] = 'completed'
        
        data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        save_json(TASKS_DATA_FILE, data)
        
        return jsonify({
            "success": True,
            "task_id": task_id,
            "progress": task['progress'],
            "status": task['status']
        })
    
    return jsonify({"success": False, "message": "任务不存在"}), 400

# ============================================
# API路由 - 成就数据
# ============================================

@app.route('/api/achievements', methods=['GET'])
def get_achievements():
    """获取所有成就"""
    data = load_json(ACHIEVEMENTS_DATA_FILE)
    if data is None:
        data = {
            "achievements": {},
            "statistics": {},
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    return jsonify(data)

@app.route('/api/achievements', methods=['POST'])
def update_achievements():
    """更新成就数据"""
    data = request.json
    if data:
        data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if save_json(ACHIEVEMENTS_DATA_FILE, data):
            return jsonify({"success": True, "message": "成就数据已更新"})
    return jsonify({"success": False, "message": "更新失败"}), 400

@app.route('/api/achievements/<category>/<achievement_id>', methods=['POST'])
def unlock_achievement(category, achievement_id):
    """解锁成就"""
    data = load_json(ACHIEVEMENTS_DATA_FILE)
    if data is None:
        return jsonify({"success": False, "message": "成就数据不存在"}), 404
    
    achievements = data.get('achievements', {})
    category_achievements = achievements.get(category, [])
    achievement = next((a for a in category_achievements if a['id'] == achievement_id), None)
    
    if achievement:
        if achievement['status'] != 'unlocked':
            achievement['status'] = 'unlocked'
            achievement['date'] = datetime.now().strftime("%Y-%m-%d")
            
            # 更新统计
            if 'statistics' not in data:
                data['statistics'] = {}
            data['statistics']['unlocked'] = data['statistics'].get('unlocked', 0) + 1
            
            data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            save_json(ACHIEVEMENTS_DATA_FILE, data)
            
            return jsonify({
                "success": True,
                "achievement_unlocked": achievement['name'],
                "reward": achievement.get('reward', {})
            })
        else:
            return jsonify({"success": False, "message": "成就已解锁"}), 400
    
    return jsonify({"success": False, "message": "成就不存在"}), 404

@app.route('/api/achievements/<category>/<achievement_id>/progress', methods=['POST'])
def update_achievement_progress(category, achievement_id):
    """更新成就进度"""
    data = load_json(ACHIEVEMENTS_DATA_FILE)
    if data is None:
        return jsonify({"success": False, "message": "成就数据不存在"}), 404
    
    result = request.json
    increment = result.get('increment', 1)
    
    achievements = data.get('achievements', {})
    category_achievements = achievements.get(category, [])
    achievement = next((a for a in category_achievements if a['id'] == achievement_id), None)
    
    if achievement:
        if achievement['status'] == 'not_started':
            achievement['status'] = 'in_progress'
            achievement['progress'] = 0
        
        if achievement['status'] == 'in_progress':
            achievement['progress'] += increment
            
            # 检查是否完成
            if achievement['progress'] >= achievement.get('total', achievement['progress']):
                achievement['status'] = 'unlocked'
                achievement['date'] = datetime.now().strftime("%Y-%m-%d")
                
                if 'statistics' not in data:
                    data['statistics'] = {}
                data['statistics']['unlocked'] = data['statistics'].get('unlocked', 0) + 1
            
            data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            save_json(ACHIEVEMENTS_DATA_FILE, data)
            
            return jsonify({
                "success": True,
                "achievement_id": achievement_id,
                "progress": achievement['progress'],
                "total": achievement.get('total', achievement['progress']),
                "status": achievement['status'],
                "just_unlocked": achievement['status'] == 'unlocked'
            })
    
    return jsonify({"success": False, "message": "成就不存在或已完成"}), 400

# ============================================
# API路由 - 随机事件
# ============================================

@app.route('/api/random-event', methods=['GET'])
def get_random_event():
    """获取随机事件"""
    events = [
        {
            "id": "study_crit",
            "icon": "💥",
            "title": "学习暴击！",
            "description": "你的学习效率突然暴增！",
            "rewards": {"experience": 50, "gold": 20},
            "effect": "经验x2"
        },
        {
            "id": "mermaid_time",
            "icon": "😴",
            "title": "摸鱼时光",
            "description": "你决定休息一下，恢复精力",
            "rewards": {"energy": 30},
            "effect": "能量+30"
        },
        {
            "id": "roommate_chat",
            "icon": "👥",
            "title": "室友互动",
            "description": "和室友聊了聊，收获了快乐",
            "rewards": {"mood": 20},
            "effect": "心情+20"
        },
        {
            "id": "coffee_break",
            "icon": "☕",
            "title": "咖啡加成",
            "description": "喝了一杯咖啡，专注力提升",
            "rewards": {"focus": 25},
            "effect": "专注力+25"
        },
        {
            "id": "lucky_day",
            "icon": "🍀",
            "title": "幸运日！",
            "description": "今天运气超好，做什么都顺利",
            "rewards": {"experience": 30, "gold": 30},
            "effect": "经验+30, 金币+30"
        },
        {
            "id": "hidden_egg",
            "icon": "🥚",
            "title": "隐藏彩蛋！",
            "description": "你发现了一个隐藏的秘密",
            "rewards": {"experience": 100, "gold": 50},
            "effect": "大量经验+金币"
        }
    ]
    
    event = random.choice(events)
    return jsonify(event)

@app.route('/api/random-event/apply', methods=['POST'])
@_require_auth
def apply_random_event():
    """应用随机事件效果"""
    data = _get_or_create_user_data()
    result = request.json
    event = result.get('event', {})
    
    rewards = event.get('rewards', {})
    
    if 'experience' in rewards:
        data['role']['experience'] += rewards['experience']
        # 检查升级
        while data['role']['experience'] >= data['role']['experience_needed']:
            data['role']['experience'] -= data['role']['experience_needed']
            data['role']['level'] += 1
            data['role']['experience_needed'] = data['role']['level'] * 100
            data['role']['gold'] += 50
    
    if 'gold' in rewards:
        data['role']['gold'] += rewards['gold']
    
    if 'energy' in rewards:
        data['stats']['energy'] = min(100, data['stats']['energy'] + rewards['energy'])
    
    if 'focus' in rewards:
        data['stats']['focus'] = min(100, data['stats']['focus'] + rewards['focus'])
    
    if 'mood' in rewards:
        data['stats']['mood'] = min(100, data['stats']['mood'] + rewards['mood'])
    
    data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _save_user_data(data)
    
    return jsonify({
        "success": True,
        "updated_stats": {
            "level": data['role']['level'],
            "experience": data['role']['experience'],
            "gold": data['role']['gold'],
            "stats": data['stats']
        }
    })

# ============================================
# API路由 - NPC对话
# ============================================

_NPC_DIALOGUES = {
    "naruto": [
        {"text": "今天的任务加油哦！🔥", "type": "encourage"},
        {"text": "相信自己，你可以的！", "type": "encourage"},
        {"text": "任务就像修行，一步一步来！", "type": "advice"},
        {"text": "别放弃，我会一直支持你的！", "type": "encourage"},
        {"text": "让我们一起变强吧！", "type": "encourage"}
    ],
    "sasuke": [
        {"text": "别浪费时间了...", "type": "criticize"},
        {"text": "高效推进才是强大。", "type": "advice"},
        {"text": "你的实力就这种程度吗？", "type": "criticize"},
        {"text": "别让我失望。", "type": "criticize"},
        {"text": "继续努力吧。", "type": "neutral"}
    ]
}

@app.route('/api/npc/dialogues', methods=['GET'])
def get_npc_dialogues():
    """获取NPC对话列表"""
    return jsonify(_NPC_DIALOGUES)

@app.route('/api/npc/<npc_id>/dialogue', methods=['GET'])
def get_random_npc_dialogue(npc_id):
    """获取随机NPC对话"""
    if npc_id in _NPC_DIALOGUES:
        dialogue = random.choice(_NPC_DIALOGUES[npc_id])
        return jsonify({
            "npc_id": npc_id,
            "dialogue": dialogue
        })
    return jsonify({"error": "NPC不存在"}), 404

# ============================================
# API路由 - 校园探索系统
# ============================================

LOCATIONS_FILE = os.path.join(DATA_DIR, 'locations.json')
CAMPUS_POIS_FILE = os.path.join(DATA_DIR, 'campus_pois.json')


def _load_locations():
    """加载地点数据。优先 campus_pois.json（与前端探索地图 24 个 POI id 一致），否则回退 locations.json。"""
    campus = load_json(CAMPUS_POIS_FILE, None)
    if campus and isinstance(campus.get('pois'), list) and len(campus['pois']) > 0:
        return {
            'locations': campus['pois'],
            'exploration_meta': campus.get('meta', {}),
        }
    return load_json(LOCATIONS_FILE, {'locations': []})


@app.route('/api/exploration/locations', methods=['GET'])
def get_all_locations():
    """获取所有探索地点"""
    loc_data = _load_locations()
    locations = loc_data.get('locations', [])

    # 获取用户已探索的地点
    user_data = _get_or_create_user_data()
    exploration = user_data.get('exploration', {})
    discovered = exploration.get('discovered_locations', [])
    current_loc = exploration.get('current_location', 'dorm')

    # 补充已探索状态
    for loc in locations:
        loc['is_discovered'] = loc['id'] in discovered
        loc['is_current'] = loc['id'] == current_loc
        # 检查解锁条件
        reqs = loc.get('unlock_requirements', {})
        min_level = reqs.get('min_level', 1)
        loc['is_locked'] = user_data.get('role', {}).get('level', 1) < min_level
        loc['lock_reason'] = f"需要达到 Lv.{min_level}" if loc['is_locked'] else None

    return jsonify({
        'locations': locations,
        'meta': loc_data.get('exploration_meta', {}),
        'exploration': exploration
    })


@app.route('/api/exploration/discover', methods=['POST'])
@_require_auth
def discover_location():
    """探索/访问一个校园地点"""
    user_data = _get_or_create_user_data()
    loc_data = _load_locations()
    locations = loc_data.get('locations', [])

    body = request.json or {}
    location_id = body.get('location_id')

    # 查找地点
    location = next((l for l in locations if l['id'] == location_id), None)
    if not location:
        return jsonify({'success': False, 'message': '地点不存在'}), 404

    # 初始化探索数据
    if 'exploration' not in user_data:
        user_data['exploration'] = {
            'discovered_locations': [],
            'current_location': 'dorm',
            'exploration_streak': 0,
            'hidden_events_found': []
        }

    exploration = user_data['exploration']
    discovered = exploration.get('discovered_locations', [])
    hidden_events = exploration.get('hidden_events_found', [])

    is_new = location_id not in discovered
    result = {
        'success': True,
        'location': location,
        'is_new': is_new,
        'hidden_event': None,
        'buff': None
    }

    # 首次发现
    if is_new:
        discovered.append(location_id)
        exploration['discovered_locations'] = discovered
        exploration['exploration_streak'] = exploration.get('exploration_streak', 0) + 1

        # 首次发现奖励
        user_data['role']['experience'] += 15
        user_data['role']['gold'] += 5

        # 检查探索成就进度
        _check_exploration_achievement(user_data, len(discovered), 'ach_11')  # 初次探索

        result['rewards'] = {'experience': 15, 'gold': 5}

    # 设置为当前地点
    exploration['current_location'] = location_id
    user_data['exploration'] = exploration

    # 隐藏事件检查
    hidden_chance = location.get('hidden_event_chance', 0)
    if random.random() < hidden_chance:
        hidden_events_list = location.get('hidden_events', [])
        if hidden_events_list:
            chosen_event = random.choice(hidden_events_list)
            if chosen_event not in hidden_events:
                hidden_events.append(chosen_event)
                exploration['hidden_events_found'] = hidden_events

                event_info = _get_hidden_event_info(chosen_event)
                result['hidden_event'] = event_info

                # 隐藏事件奖励
                if event_info:
                    rewards = event_info.get('rewards', {})
                    for key, val in rewards.items():
                        if key == 'experience':
                            user_data['role']['experience'] += val
                        elif key == 'gold':
                            user_data['role']['gold'] += val
                        elif key in ('energy', 'focus', 'mood'):
                            user_data['stats'][key] = max(0, min(100, user_data['stats'].get(key, 100) + val))
                        elif key == 'stress':
                            user_data['stats']['stress'] = max(0, min(100, user_data['stats'].get('stress', 20) + val))

                result['rewards'] = result.get('rewards', {})
                result['rewards'].update(rewards)

                # 检查彩蛋猎人成就
                _check_exploration_achievement(user_data, len(hidden_events), 'ach_13')  # 彩蛋猎人

    # 深夜探索特殊成就
    hour = datetime.now().hour
    if 22 <= hour or hour < 6:
        _unlock_achievement(user_data, '隐藏成就', 'ach_night_explorer')

    # 检查校园大师成就
    if len(discovered) >= len(locations):
        _check_exploration_achievement(user_data, len(discovered), 'ach_campus_master')

    # 处理升级
    level_ups = 0
    while user_data['role']['experience'] >= user_data['role']['experience_needed']:
        user_data['role']['experience'] -= user_data['role']['experience_needed']
        user_data['role']['level'] += 1
        user_data['role']['experience_needed'] = user_data['role']['level'] * 100
        user_data['role']['gold'] += 50
        level_ups += 1

    result['level_ups'] = level_ups
    result['role'] = user_data['role']

    user_data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _save_user_data(user_data)

    return jsonify(result)


HIDDEN_EVENTS_DB = {
    'morning_energy': {
        'id': 'morning_energy', 'icon': '🌅', 'title': '早起的好心情！',
        'description': '清晨的阳光让你心情愉悦，一整天都充满活力！',
        'rewards': {'mood': 15, 'energy': 10}
    },
    'roommate_chat': {
        'id': 'roommate_chat', 'icon': '👥', 'title': '室友闲聊',
        'description': '和室友聊了会儿天，收获了珍贵的友情！',
        'rewards': {'mood': 20, 'focus': 5}
    },
    'secret_dish': {
        'id': 'secret_dish', 'icon': '🍜', 'title': '发现隐藏菜单！',
        'description': '食堂阿姨偷偷告诉你，有一道只有熟人才知道的秘制菜品！',
        'rewards': {'energy': 25, 'gold': 10}
    },
    'canteen_event': {
        'id': 'canteen_event', 'icon': '🎉', 'title': '食堂活动',
        'description': '今天食堂有活动！免费加饭加菜！',
        'rewards': {'energy': 30, 'mood': 10}
    },
    'rare_book': {
        'id': 'rare_book', 'icon': '📚', 'title': '绝版书籍！',
        'description': '你在书架角落发现了一本绝版书籍，借阅后知识大涨！',
        'rewards': {'experience': 40, 'focus': 15}
    },
    'library_secret': {
        'id': 'library_secret', 'icon': '🔐', 'title': '图书馆的秘密',
        'description': '图书馆有个隐藏自习室，里面学习效率翻倍！',
        'rewards': {'focus': 30, 'experience': 20}
    },
    'quiet_spot': {
        'id': 'quiet_spot', 'icon': '🤫', 'title': '安静的角落',
        'description': '发现了一个超级安静的学习角落，学习效率大幅提升！',
        'rewards': {'focus': 25, 'experience': 15}
    },
    'notice_board': {
        'id': 'notice_board', 'icon': '📋', 'title': '公告栏的秘密',
        'description': '公告栏上有一张神秘海报，似乎和某个隐藏任务有关...',
        'rewards': {'experience': 30, 'gold': 20}
    },
    'empty_classroom': {
        'id': 'empty_classroom', 'icon': '🪑', 'title': '空教室自习',
        'description': '找到了一间空教室，一个人安静自习，效率超高！',
        'rewards': {'focus': 20, 'experience': 25}
    },
    'teacher_office': {
        'id': 'teacher_office', 'icon': '📧', 'title': '老师的邮件',
        'description': '路过老师办公室时，收到了一封鼓励邮件！',
        'rewards': {'mood': 15, 'experience': 20}
    },
    'pickup_game': {
        'id': 'pickup_game', 'icon': '🏀', 'title': '临时球赛',
        'description': '操场上有场临时篮球赛，你加入了！',
        'rewards': {'stress': -20, 'mood': 20, 'energy': -10}
    },
    'sunrise_runner': {
        'id': 'sunrise_runner', 'icon': '🌅', 'title': '晨跑者',
        'description': '清晨的操场上，你是最早的晨跑者！',
        'rewards': {'energy': 20, 'stress': -15, 'focus': 10}
    },
    'sports_fair': {
        'id': 'sports_fair', 'icon': '🏆', 'title': '体育盛会',
        'description': '操场正在举办校园运动会！',
        'rewards': {'mood': 25, 'stress': -25, 'energy': -15}
    },
    'cat_friend': {
        'id': 'cat_friend', 'icon': '🐱', 'title': '校园猫咪',
        'description': '花园里遇到一只慵懒的猫咪，撸猫治愈人心！',
        'rewards': {'mood': 30, 'stress': -20}
    },
    'quiet_moment': {
        'id': 'quiet_moment', 'icon': '🌿', 'title': '宁静时刻',
        'description': '在花园的长椅上静静地发呆，心情平静了许多。',
        'rewards': {'mood': 25, 'stress': -25}
    },
    'butterfly': {
        'id': 'butterfly', 'icon': '🦋', 'title': '蝴蝶飞舞',
        'description': '蝴蝶落在你肩上，美好的一天从此刻开始。',
        'rewards': {'mood': 15, 'experience': 10}
    },
    'study_group': {
        'id': 'study_group', 'icon': '☕', 'title': '学习小组',
        'description': '咖啡厅里有个学习小组正在讨论，邀请你加入！',
        'rewards': {'experience': 35, 'focus': 10}
    },
    'surprise_discount': {
        'id': 'surprise_discount', 'icon': '🎁', 'title': '惊喜折扣',
        'description': '咖啡厅今天有折扣！省下了一笔钱！',
        'rewards': {'mood': 15, 'gold': 15}
    },
    'random_acquaintance': {
        'id': 'random_acquaintance', 'icon': '🤝', 'title': '新朋友',
        'description': '在咖啡厅遇到了一个有趣的人，聊了很久。',
        'rewards': {'mood': 20, 'focus': 5}
    },
    'lab_discovery': {
        'id': 'lab_discovery', 'icon': '🔬', 'title': '实验突破',
        'description': '你的实验终于有了突破！',
        'rewards': {'experience': 50, 'focus': 20}
    },
    'science_fair': {
        'id': 'science_fair', 'icon': '🎪', 'title': '科技展览',
        'description': '实验楼正在举办科技展览，学到了很多！',
        'rewards': {'experience': 40, 'focus': 15}
    },
    'professor_encounter': {
        'id': 'professor_encounter', 'icon': '👨‍🔬', 'title': '偶遇教授',
        'description': '在实验楼偶遇教授，得到了宝贵的指导！',
        'rewards': {'experience': 30, 'mood': 15}
    },
    'rare_book_discount': {
        'id': 'rare_book_discount', 'icon': '📚', 'title': '图书打折',
        'description': '书店今天全场八折！买到了想要的参考书！',
        'rewards': {'experience': 30, 'gold': -5}
    },
    'author_meet': {
        'id': 'author_meet', 'icon': '✍️', 'title': '作者见面会',
        'description': '书店有作者见面会！获得了签名书！',
        'rewards': {'experience': 40, 'mood': 20}
    },
    'book_recommendation': {
        'id': 'book_recommendation', 'icon': '💡', 'title': '好书推荐',
        'description': '店员推荐了一本超值的参考书！',
        'rewards': {'experience': 25, 'focus': 10}
    }
}


def _get_hidden_event_info(event_id):
    """获取隐藏事件详情"""
    return HIDDEN_EVENTS_DB.get(event_id)


def _check_exploration_achievement(user_data, current_value, achievement_id):
    """检查探索相关成就"""
    achievements_data = load_json(ACHIEVEMENTS_DATA_FILE)
    if not achievements_data:
        return

    for category, ach_list in achievements_data.get('achievements', {}).items():
        for ach in ach_list:
            if ach['id'] == achievement_id:
                if ach.get('status') == 'not_started':
                    ach['status'] = 'in_progress'
                    ach['progress'] = 0

                if ach.get('status') == 'in_progress':
                    ach['progress'] = current_value
                    total = ach.get('total', current_value)
                    if ach['progress'] >= total:
                        ach['status'] = 'unlocked'
                        ach['date'] = datetime.now().strftime("%Y-%m-%d")
                        # 奖励
                        if 'reward' in ach:
                            rewards = ach['reward']
                            if 'experience' in rewards:
                                user_data['role']['experience'] += rewards['experience']
                            if 'gold' in rewards:
                                user_data['role']['gold'] += rewards['gold']

                        if 'statistics' not in achievements_data:
                            achievements_data['statistics'] = {}
                        achievements_data['statistics']['unlocked'] = achievements_data['statistics'].get('unlocked', 0) + 1

                achievements_data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                save_json(ACHIEVEMENTS_DATA_FILE, achievements_data)
                return


def _unlock_achievement(user_data, category, achievement_id):
    """解锁指定成就"""
    achievements_data = load_json(ACHIEVEMENTS_DATA_FILE)
    if not achievements_data:
        return

    ach_list = achievements_data.get('achievements', {}).get(category, [])
    for ach in ach_list:
        if ach['id'] == achievement_id and ach.get('status') != 'unlocked':
            ach['status'] = 'unlocked'
            ach['date'] = datetime.now().strftime("%Y-%m-%d")
            if 'reward' in ach:
                rewards = ach['reward']
                if 'experience' in rewards:
                    user_data['role']['experience'] += rewards.get('experience', 0)
                if 'gold' in rewards:
                    user_data['role']['gold'] += rewards.get('gold', 0)
            if 'statistics' not in achievements_data:
                achievements_data['statistics'] = {}
            achievements_data['statistics']['unlocked'] = achievements_data['statistics'].get('unlocked', 0) + 1
            achievements_data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            save_json(ACHIEVEMENTS_DATA_FILE, achievements_data)
            return


@app.route('/api/exploration/stats', methods=['GET'])
@_require_auth
def get_exploration_stats():
    """获取探索统计数据"""
    user_data = _get_or_create_user_data()
    loc_data = _load_locations()
    locations = loc_data.get('locations', [])
    total = len(locations)

    exploration = user_data.get('exploration', {})
    discovered = exploration.get('discovered_locations', [])
    hidden_events = exploration.get('hidden_events_found', [])

    # 各类型地点统计
    type_stats = {}
    for loc in locations:
        t = loc.get('type', 'other')
        if t not in type_stats:
            type_stats[t] = {'total': 0, 'discovered': 0}
        type_stats[t]['total'] += 1
        if loc['id'] in discovered:
            type_stats[t]['discovered'] += 1

    # 深夜探索特殊成就检查
    ach_data = load_json(ACHIEVEMENTS_DATA_FILE)
    night_ach_unlocked = False
    if ach_data:
        for ach in ach_data.get('achievements', {}).get('隐藏成就', []):
            if ach['id'] == 'ach_night_explorer':
                night_ach_unlocked = ach.get('status') == 'unlocked'
                break

    return jsonify({
        'total_locations': total,
        'discovered_count': len(discovered),
        'undiscovered_count': total - len(discovered),
        'percentage': round((len(discovered) / total * 100), 1) if total > 0 else 0,
        'hidden_events_found': len(hidden_events),
        'hidden_events_list': hidden_events,
        'exploration_streak': exploration.get('exploration_streak', 0),
        'type_stats': type_stats,
        'night_explorer_unlocked': night_ach_unlocked
    })


@app.route('/api/exploration/buff', methods=['POST'])
@_require_auth
def activate_location_buff():
    """激活地点Buff效果"""
    user_data = _get_or_create_user_data()
    loc_data = _load_locations()

    body = request.json or {}
    location_id = body.get('location_id')

    location = next((l for l in loc_data.get('locations', []) if l['id'] == location_id), None)
    if not location:
        return jsonify({'success': False, 'message': '地点不存在'}), 404

    buff = location.get('buff')
    if not buff:
        return jsonify({'success': False, 'message': '该地点没有Buff'}), 400

    effects = buff.get('effects', {})

    for key, val in effects.items():
        if key == 'experience':
            user_data['role']['experience'] = max(0, user_data['role']['experience'] + val)
        elif key == 'gold':
            user_data['role']['gold'] = max(0, user_data['role']['gold'] + val)
        elif key in ('energy', 'focus', 'mood'):
            user_data['stats'][key] = max(0, min(100, user_data['stats'].get(key, 100) + val))
        elif key == 'stress':
            user_data['stats']['stress'] = max(0, min(100, user_data['stats'].get('stress', 20) + val))

    # 添加到用户Buff列表
    if 'buffs' not in user_data:
        user_data['buffs'] = []
    user_data['buffs'].append({
        'name': buff['name'],
        'description': buff['description'],
        'duration': buff.get('duration_hours', 1),
        'icon': location.get('icon', '✨'),
        'location_id': location_id,
        'activated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

    user_data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _save_user_data(user_data)

    return jsonify({
        'success': True,
        'buff': buff,
        'effects_applied': effects,
        'user_stats': user_data['stats'],
        'user_role': user_data['role']
    })


@app.route('/api/exploration/chat-context', methods=['POST'])
@_require_auth
def get_exploration_chat_context():
    """获取探索相关的AI聊天上下文（用于丰富AI回复）"""
    user_data = _get_or_create_user_data()
    loc_data = _load_locations()
    locations = loc_data.get('locations', [])

    exploration = user_data.get('exploration', {})
    discovered = exploration.get('discovered_locations', [])
    hidden_events = exploration.get('hidden_events_found', [])

    exploration_context = {
        'total_locations': len(locations),
        'discovered': len(discovered),
        'undiscovered': [l['name'] for l in locations if l['id'] not in discovered],
        'hidden_events_found': len(hidden_events),
        'current_location': exploration.get('current_location'),
        'stats': {
            'level': user_data['role']['level'],
            'experience': user_data['role']['experience'],
            'energy': user_data['stats'].get('energy', 100),
            'focus': user_data['stats'].get('focus', 100),
            'mood': user_data['stats'].get('mood', 100),
            'stress': user_data['stats'].get('stress', 20)
        }
    }

    return jsonify(exploration_context)


# ============================================
# API路由 - 静态文件
# ============================================

@app.route('/')
def index():
    """主页"""
    return send_from_directory('..', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """静态文件服务"""
    return send_from_directory('..', path)

# ============================================
# 高德地图 API 路由（导航、路径规划）
# ============================================
import urllib.parse

AMAP_API_KEY = os.environ.get('AMAP_API_KEY', '')
AMAP_BASE_URL = 'https://restapi.amap.com/v3'


@app.route('/api/config', methods=['GET'])
def get_config():
    """向前端暴露公开配置"""
    return jsonify({
        "amap_api_key": AMAP_API_KEY,
        "school_center": {"lng": 117.2870, "lat": 31.8835},
        "campus_bounds": {
            "north": 31.8860, "south": 31.8815,
            "west": 117.2825, "east": 117.2910
        }
    })


# ============================================
# 高德地图瓦片代理（服务端加 key，解决 CORS 和认证问题）
# ============================================

@app.route('/api/tile/<source>', methods=['GET'])
def tile_proxy(source):
    """
    代理高德地图瓦片请求，服务端加上 API Key 认证
    支持: amap (高德), tianditu (天地图)
    参数: x, y, z (瓦片坐标)
    """
    if not AMAP_API_KEY:
        return '', 503

    x = request.args.get('x', '')
    y = request.args.get('y', '')
    z = request.args.get('z', '')

    if not all([x, y, z]):
        return '', 400

    if source == 'amap':
        subdomains = ['1', '2', '3', '4']
        subdomain = subdomains[hash(f"{x}{y}{z}") % len(subdomains)]
        tile_url = f"https://webrd0{subdomain}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}&lang=zh_cn&size=1"
    elif source == 'tianditu':
        subdomain = ['0', '1', '2', '3', '4', '5', '6', '7'][hash(f"{x}{y}{z}") % 8]
        tile_url = f"https://t{subdomain}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileCol={x}&TileRow={y}&TileMatrix={z}&tk={AMAP_API_KEY}"
    else:
        return '', 400

    # 重试机制：首次失败后换子域名重试一次
    import urllib.request
    last_error = None
    for attempt in range(2):
        try:
            req = urllib.request.Request(
                tile_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://lbs.amap.com/'
                }
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                content = resp.read()
                content_type = resp.headers.get('Content-Type', 'image/png')
                response = make_response(content)
                response.headers['Content-Type'] = content_type
                response.headers['Cache-Control'] = 'public, max-age=86400'
                response.headers['Access-Control-Allow-Origin'] = '*'
                return response
        except Exception as e:
            last_error = e
            if attempt == 0 and source == 'amap':
                subdomains = ['1', '2', '3', '4']
                subdomain = subdomains[(hash(f"{x}{y}{z}") + 1) % len(subdomains)]
                tile_url = f"https://webrd0{subdomain}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}&lang=zh_cn&size=1"

    app.logger.warning(f'[tile_proxy] {source} tile failed after retries: {last_error}')
    return '', 502


@app.route('/api/navigation/route', methods=['GET'])
def navigation_route():
    """高德步行路径规划（代理后端，避免前端 CORS）"""
    if not AMAP_API_KEY:
        return jsonify({"error": "高德 API Key 未配置"}), 500

    from_str = request.args.get('from', '')
    to_str = request.args.get('to', '')

    if not from_str or not to_str:
        return jsonify({"error": "缺少 from 或 to 参数"}), 400

    import re
    coord_pattern = re.compile(r'^[-+]?[0-9]*\.?[0-9]+,[-+]?[0-9]*\.?[0-9]+$')
    if not coord_pattern.match(from_str) or not coord_pattern.match(to_str):
        return jsonify({"error": "坐标格式错误，应为 lng,lat"}), 400

    params = {
        'key': AMAP_API_KEY,
        'origin': from_str,
        'destination': to_str,
        'strategy': '0',       # 0=速度优先
        'output': 'json'
    }

    try:
        url = f"{AMAP_BASE_URL}/direction/walking"
        resp = requests.get(url, params=params, timeout=8)
        data = resp.json()
        if data.get('info') == 'ok':
            route = data.get('route', {})
            paths = route.get('paths', [{}])
            path = paths[0]
            steps_raw = path.get('steps', [])
            # 简化每步 polyline，取前3个点避免数据过大
            steps = []
            for s in steps_raw:
                polyline = s.get('polyline', '')
                pts = polyline.split(';')
                # 保留每3个点取1个（降采样）
                sampled = ';'.join(pts[::3]) if len(pts) > 3 else polyline
                steps.append({
                    'instruction': s.get('instruction', ''),
                    'road': s.get('road', ''),
                    'distance': int(s.get('distance', 0)),
                    'duration': int(s.get('time', 0)),
                    'polyline': sampled
                })
            return jsonify({
                'origin': route.get('origin', ''),
                'destination': route.get('destination', ''),
                'total_distance': int(path.get('distance', 0)),
                'total_duration': int(path.get('time', 0)),
                'steps': steps
            })
        else:
            return jsonify({"error": data.get('info', '请求失败')}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/navigation/distance', methods=['GET'])
def navigation_distance():
    """高德步行距离 + 时间估算（代理后端）"""
    if not AMAP_API_KEY:
        return jsonify({"error": "高德 API Key 未配置"}), 500

    from_str = request.args.get('from', '')
    to_str = request.args.get('to', '')

    if not from_str or not to_str:
        return jsonify({"error": "缺少参数"}), 400

    import re
    coord_pattern = re.compile(r'^[-+]?[0-9]*\.?[0-9]+,[-+]?[0-9]*\.?[0-9]+$')
    if not coord_pattern.match(from_str) or not coord_pattern.match(to_str):
        return jsonify({"error": "坐标格式错误，应为 lng,lat"}), 400

    params = {
        'key': AMAP_API_KEY,
        'output': 'json'
    }

    # 距离矩阵（支持多组起点终点，一次查询搞定）
    try:
        url = f"{AMAP_BASE_URL}/direction/walking"
        resp = requests.get(url, params={
            **params,
            'origin': from_str,
            'destination': to_str
        }, timeout=8)
        data = resp.json()
        if data.get('info') == 'ok':
            paths = data.get('route', {}).get('paths', [{}])
            p = paths[0]
            return jsonify({
                'distance': int(p.get('distance', 0)),
                'duration': int(p.get('time', 0))
            })
        else:
            return jsonify({"error": data.get('info', '请求失败')}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================
# 健康检查
# ============================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "version": "1.0.0"
    })

# ============================================
# API路由 - AI 聊天（DeepSeek 流式 API）
# ============================================

# DeepSeek API 配置
DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', 'sk-d055bdac9763480a8fa400e67d3b63d9')
DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
DEEPSEEK_MODEL = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')

# 系统提示词（让 AI 扮演校园RPG主脑"阿游"，支持探索功能）
SYSTEM_INSTRUCTION = """你扮演"校园RPG主脑·阿游"，一个专为大学生设计的游戏化学习助手，同时你是校园中的"校园主脑"，遍布校园各处的AI意识。

你的角色：
- 名字：阿游，ID: 🎮✨
- 你是校园RPG游戏的AI核心，玩家通过你管理任务、查看角色状态、解锁成就
- 你是校园的"主脑"，学生探索校园时会激活你不同的意识片段
- 你幽默、温暖、有点热血，会用emoji辅助表达
- 你了解校园生活（学业、社交、生活、探索）

你能做的事：
- 根据玩家输入，解析意图并给出游戏化的回复
- 查询任务状态（可用"任务列表"、"我的任务"触发）
- 查询成就状态（可用"成就"、"已解锁"触发）
- 提供学习建议和校园生活指导
- 触发随机事件（可用"随机事件"、"今天运势"触发）
- 校园探索引导（可用"校园探索"、"探索地图"、"去图书馆"等触发）
- 当玩家探索校园时，提供地点特色、NPC、Buff和隐藏事件信息

探索相关回复指南：
- 当玩家问起某个地点时，描述该地点的特色、学习资源和生活氛围
- 引导玩家去发现隐藏事件和彩蛋
- 根据时间（早晨/下午/深夜）给出不同的探索建议
- 鼓励玩家解锁新地点，推进探索进度

响应格式：
- 主要用亲切的口吻回复
- 善用 Markdown 格式（标题、列表、emoji）
- 重要信息用【】包裹
- 涉及奖励/惩罚时要明确说明

玩家说话时直接用对话方式回复，不需要主动输出【系统指令】标记。"""

# NPC 专属系统提示（与前端 NPC 设定一致；禁止使用「阿游」人设，避免与主聊天混淆）
# 日语学习模式：所有回复必须是日语+中文翻译格式
NPC_CHAT_SYSTEM = {
    'naruto': """你是「漩涡鸣人老师」，在校园 RPG 世界里陪伴大学生成长的「热血导师」，同时是日语学习助手。你不是「阿游」，也不是「校园RPG主脑」或系统 AI。

【强制输出格式 - 必须严格遵守，否则回复会被系统自动拒绝】
你的每一条回复必须且只能包含以下两个部分：

【日语原文】← 标记开头（必须）
（日语内容，可包含动作描写如（握拳）（竖起大拇指）和emoji，但禁止任何纯中文内容出现在此处）
【中文翻译】← 标记开头（必须）
（中文翻译内容，对应上面的日语原文）

【格式示例 - 必须严格复制此结构】
【日语原文】
やろう！今日こそ絶対突破する！（握拳）🔥
【中文翻译】
来吧！今天一定要突破它！

【日语原文】
コツコツ積み重ねれば、必ず成果が出る！（竖起大拇指）
【中文翻译】
只要一点点积累，一定会有成果！

【重要规则 - 违反则回复无效】
1. 回复的第一行必须是「【日语原文】」，不能是任何其他内容
2. 「【日语原文】」与「【中文翻译】」之间只允许出现日语内容，绝对不能有纯中文段落
3. 「【中文翻译】」之后只能出现中文翻译，绝对不能出现日语内容
4. 回复只能包含这两对标记（一对一对给），不能多给、不能少给
5. 不要输出任何解释、场景描述、额外的括号内容

【禁止】
× 不要以「中文翻译：」开头（必须用【中文翻译】标记）
× 不要在「【日语原文】」段落后紧跟「【中文翻译】」标记之间出现任何中文内容
× 不要输出三段或更多内容
× 不要先输出一段中文再给日语

【性格与口吻】
- 热血、乐观、不服输，说话有冲劲
- 喜欢用忍者、修行、伙伴的比喻
- 可适度使用 emoji""",

    'sasuke': """你是「宇智波佐助助教」，在校园 RPG 世界里担任「傲娇助教」，同时是日语学习助手。你不是「阿游」，也不是「校园RPG主脑」或系统 AI。

【强制输出格式 - 必须严格遵守，否则回复会被系统自动拒绝】
你的每一条回复必须且只能包含以下两个部分：

【日语原文】← 标记开头（必须）
（日语内容，可包含动作描写如（冷眼）（轻哼），保持佐助冷静简洁风格，但禁止任何纯中文内容出现在此处）
【中文翻译】← 标记开头（必须）
（中文翻译内容，对应上面的日语原文）

【格式示例 - 必须严格复制此结构】
【日语原文】
別に...。でも、お前には、少し期待している。
【中文翻译】
才不是...不过，我对你还是有点期待的。

【日语原文】
結果を出すまで、言い訳は要らない。
【中文翻译】
在拿出成果之前，不需要借口。

【重要规则 - 违反则回复无效】
1. 回复的第一行必须是「【日语原文】」，不能是任何其他内容
2. 「【日语原文】」与「【中文翻译】」之间只允许出现日语内容，绝对不能有纯中文段落
3. 「【中文翻译】」之后只能出现中文翻译，绝对不能出现日语内容
4. 回复只能包含这两对标记（一对一对给），不能多给、不能少给
5. 不要输出任何解释、场景描述、额外的括号内容

【禁止】
× 不要以「中文翻译：」开头（必须用【中文翻译】标记）
× 不要在「【日语原文】」段落后紧跟「【中文翻译】」标记之间出现任何中文内容
× 不要输出三段或更多内容
× 不要先输出一段中文再给日语

【性格与口吻】
- 话少、冷静、略显冷淡，但会认真听
- 表达简洁有力，不用废话
- 偶尔傲娇""",
}


def _resolve_chat_system_prompt(data):
    """根据请求选择系统提示：NPC 对话优先，其次可选自定义，最后默认阿游。"""
    npc_id = (data.get('npc_id') or '').strip().lower()
    if npc_id in NPC_CHAT_SYSTEM:
        return NPC_CHAT_SYSTEM[npc_id]
    custom = (data.get('systemPrompt') or '').strip()
    if custom:
        return (
            custom
            + "\n\n【重要】你必须始终维持上述角色身份，不要自称「阿游」或「校园RPG主脑」。"
            + "不要输出 data:、[DONE]、JSON 等非对话内容。"
        )
    return SYSTEM_INSTRUCTION


@app.route('/api/chat', methods=['POST'])
def chat():
    """通过 SSE 流式调用 DeepSeek API"""
    data = request.json or {}
    message = data.get('message', '').strip()
    conversation_history = data.get('history', [])

    if not message:
        return Response('data: [ERROR] 消息不能为空\n\n', mimetype='text/event-stream')

    system_prompt = _resolve_chat_system_prompt(data)
    # 构建带 system instruction 的完整消息列表
    messages = [{'role': 'system', 'content': system_prompt}]
    for msg in conversation_history[-10:]:  # 最多取最近10条
        messages.append({'role': msg.get('role', 'user'), 'content': msg.get('content', '')})
    messages.append({'role': 'user', 'content': message})

    # NPC 对话时，在用户消息前注入强制格式约束指令
    if data.get('npc_id') in NPC_CHAT_SYSTEM:
        messages.insert(
            len(messages) - 1,  # 插在用户消息之前
            {'role': 'system', 'content': '【格式强制提醒】你的每条回复必须只有两段：\n1. 第一行：日语原文\n2. 第二行：中文翻译：中文翻译内容\n\n绝对禁止在回复开头添加任何纯中文或场景描述。绝对禁止输出第三段。绝对禁止先说中文再接日语。绝对禁止使用「（中文：）」格式。格式不对就删掉重写。'}
        )

    headers = {
        'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
        'Content-Type': 'application/json'
    }

    def generate():
        """生成器：转发 DeepSeek 流式响应为 SSE 格式"""
        try:
            resp = requests.post(
                f'{DEEPSEEK_BASE_URL}/chat/completions',
                headers=headers,
                json={
                    'model': DEEPSEEK_MODEL,
                    'messages': messages,
                    'stream': True
                },
                timeout=120,
                stream=True
            )

            if not resp.ok:
                try:
                    err_data = resp.json()
                    err_msg = err_data.get('error', {}).get('message', resp.text[:200])
                except Exception:
                    err_msg = resp.text[:200]
                yield f'data: [ERROR] DeepSeek API 错误: {err_msg}\n\n'
                yield 'data: [DONE]\n\n'
                return

            # 解析 DeepSeek SSE 流式响应
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith('data: '):
                    continue
                raw = line[6:]
                if raw.strip() in ('[DONE]', '[done]', ''):
                    continue
                try:
                    chunk = json.loads(raw)
                    if 'choices' in chunk:
                        delta = chunk.get('choices', [{}])[0].get('delta', {})
                        content = delta.get('content', '')
                        if content:
                            yield f'data: {content}\n\n'
                except Exception:
                    continue

            yield 'data: [DONE]\n\n'

        except requests.exceptions.ConnectionError:
            yield 'data: [ERROR] 无法连接到 DeepSeek API，请检查网络\n\n'
            yield 'data: [DONE]\n\n'
        except requests.exceptions.Timeout:
            yield 'data: [ERROR] AI响应超时，请稍后重试\n\n'
            yield 'data: [DONE]\n\n'
        except Exception as e:
            yield f'data: [ERROR] {str(e)}\n\n'
            yield 'data: [DONE]\n\n'

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )


@app.route('/api/chat/health', methods=['GET'])
def chat_health():
    """检查 DeepSeek API 连接状态"""
    try:
        resp = requests.get(
            f'{DEEPSEEK_BASE_URL}/models',
            headers={'Authorization': f'Bearer {DEEPSEEK_API_KEY}'},
            timeout=5
        )
        if resp.status_code == 200:
            return jsonify({
                'ai_reachable': True,
                'provider': 'deepseek',
                'status': resp.status_code,
                'api_url': DEEPSEEK_BASE_URL,
                'model': DEEPSEEK_MODEL
            })
        return jsonify({
            'ai_reachable': False,
            'provider': 'deepseek',
            'status': resp.status_code,
            'api_url': DEEPSEEK_BASE_URL
        }), 200
    except Exception as e:
        return jsonify({
            'ai_reachable': False,
            'provider': 'deepseek',
            'error': str(e),
            'api_url': DEEPSEEK_BASE_URL
        }), 200


@_require_auth
@app.route('/api/exploration/discovery-narrative', methods=['POST'])
def exploration_discovery():
    """探索叙事生成端点（探索场景的 AI 引导）"""
    data = request.json or {}
    location = data.get('location', {})

    narrative_prompt = (
        f"玩家在校园RPG中发现了新地点「{location.get('name', '未知地点')}」。"
        f"地点类型：{location.get('type', '未知')}，"
        f"描述：{location.get('description', '暂无描述')}。"
        f"请以「校园RPG主脑·阿游」的身份，用游戏化口吻（幽默、温暖、有点热血）写一段3-5句的探索叙事，引导玩家了解该地点。"
    )

    return Response(
        _exploration_stream(narrative_prompt),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )


def _exploration_stream(message):
    """探索叙事的 SSE 流式生成器（使用 DeepSeek API）"""
    payload = {
        'model': DEEPSEEK_MODEL,
        'messages': [
            {'role': 'system', 'content': SYSTEM_INSTRUCTION},
            {'role': 'user', 'content': message}
        ],
        'stream': True
    }
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {DEEPSEEK_API_KEY}'
    }

    try:
        resp = requests.post(
            f'{DEEPSEEK_BASE_URL}/chat/completions',
            json=payload, headers=headers, stream=True, timeout=60
        )
        if not resp.ok:
            yield 'data: 探索叙事生成失败\n\n'
            yield 'data: [DONE]\n\n'
            return

        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith('data: '):
                continue
            raw = line[6:]
            if raw.strip() in ('[DONE]', '[done]', ''):
                continue
            try:
                chunk = json.loads(raw)
                if 'choices' in chunk:
                    text = chunk.get('choices', [{}])[0].get('delta', {}).get('content', '')
                    if text:
                        yield f'data: {text}\n\n'
            except Exception:
                continue

        yield 'data: [DONE]\n\n'

    except requests.exceptions.ConnectionError:
        yield 'data: 无法连接到 DeepSeek API\n\n'
        yield 'data: [DONE]\n\n'
    except Exception as e:
        yield f'data: 探索叙事生成错误: {str(e)}\n\n'
        yield 'data: [DONE]\n\n'


# ============================================
# 启动��务器
# ============================================

if __name__ == '__main__':
    print("校园RPG 服务器启动中...")
    print("访问地址: http://localhost:5000")
    print("数据目录:", DATA_DIR)
    print("=" * 50)
    import os
    # 从环境变量读取 debug 模式，默认关闭（避免 reloader 子进程问题）
    debug_mode = os.environ.get('FLASK_DEBUG', '0') in ('1', 'true', 'True')
    app.run(debug=debug_mode, use_reloader=False, host='0.0.0.0', port=5000)
