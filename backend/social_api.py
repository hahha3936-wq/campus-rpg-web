"""
校园RPG - 轻社交与排行榜 API 模块
实现好友系统、排行榜、公会功能

功能模块：
  1. 好友系统（friendships.json）
  2. 排行榜系统（实时计算 + 缓存）
  3. 公会系统（guilds.json）
"""

from flask import Blueprint, jsonify, request
import os
import json
import jwt
import uuid
import glob
from functools import wraps
from datetime import datetime, timedelta
import hashlib

social_bp = Blueprint('social', __name__)

# ============================================
# 认证 & 文件路径配置（复制自 server.py）
# ============================================
JWT_SECRET = os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026')
JWT_ALGORITHM = 'HS256'
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')


def _verify_token(token):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get('user_id')
    except Exception:
        return None


def _require_auth(f):
    @wraps(f)
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


def _load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return None


def _save_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _get_user_name(user_id):
    """从用户数据文件获取用户昵称"""
    path = os.path.join(DATA_DIR, f'user_data_{user_id}.json')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('user', {}).get('name', '冒险者')
        except Exception:
            pass
    return '冒险者'


def _get_user_public_info(user_id):
    """获取用户公开信息（昵称、等级、头像占位）"""
    path = os.path.join(DATA_DIR, f'user_data_{user_id}.json')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                role = data.get('role', {})
                return {
                    'user_id': user_id,
                    'name': data.get('user', {}).get('name', '冒险者'),
                    'level': role.get('level', 1),
                    'experience': role.get('experience', 0),
                    'avatar_seed': user_id[:8]
                }
        except Exception:
            pass
    return {
        'user_id': user_id,
        'name': '冒险者',
        'level': 1,
        'experience': 0,
        'avatar_seed': user_id[:8]
    }


def _count_ar_unlocks(user_id):
    """统计用户AR解锁标记数量（去重）"""
    path = os.path.join(DATA_DIR, f'ar_behavior_log_{user_id}.json')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                records = data.get('records', [])
                unique_markers = set(r.get('marker_id') for r in records if r.get('marker_id'))
                return len(unique_markers)
        except Exception:
            pass
    return 0


# ============================================
# 内部工具函数
# ============================================

def _load_friendships():
    return _load_json('friendships.json') or {}


def _save_friendships(data):
    _save_json('friendships.json', data)


def _load_guilds():
    return _load_json('guilds.json') or {}


def _save_guilds(data):
    _save_json('guilds.json', data)


def _ensure_user_friendship_entry(user_id):
    """确保用户的好友数据条目存在"""
    fs = _load_friendships()
    if user_id not in fs:
        fs[user_id] = {'friends': [], 'incoming_requests': [], 'outgoing_requests': []}
    return fs


# ============================================
# 排行榜计算引擎
# ============================================

def _scan_all_user_ids():
    """扫描 data/ 目录下所有用户ID"""
    pattern = os.path.join(DATA_DIR, 'user_data_*.json')
    user_files = glob.glob(pattern)
    ids = []
    for f in user_files:
        basename = os.path.basename(f)
        uid = basename.replace('user_data_', '').replace('.json', '')
        ids.append(uid)
    return ids


def _compute_leaderboard(type_, period='week'):
    """
    计算排行榜
    type_: campus_level | class_tasks | ar_explore
    period: day | week | month
    """
    # 检查缓存是否有效（30分钟内有效）
    cache = _load_json('leaderboard_cache.json') or {}
    cache_key = f'{type_}_{period}'
    cached = cache.get(cache_key)
    if cached:
        cached_time = cached.get('cached_at', '')
        try:
            cached_dt = datetime.fromisoformat(cached_time)
            if (datetime.now() - cached_dt).total_seconds() < 1800:
                return cached
        except Exception:
            pass

    user_ids = _scan_all_user_ids()
    rankings = []

    for uid in user_ids:
        path = os.path.join(DATA_DIR, f'user_data_{uid}.json')
        if not os.path.exists(path):
            continue
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue

        role = data.get('role', {})
        stats = data.get('stats', {})
        name = data.get('user', {}).get('name', '冒险者')

        if type_ == 'campus_level':
            value = role.get('level', 1) * 1000 + role.get('experience', 0)
        elif type_ == 'class_tasks':
            value = stats.get('total_tasks_completed', 0)
        elif type_ == 'ar_explore':
            value = _count_ar_unlocks(uid)
        else:
            value = 0

        rankings.append({
            'user_id': uid,
            'name': name,
            'level': role.get('level', 1),
            'value': value
        })

    # 降序排列
    rankings.sort(key=lambda x: x['value'], reverse=True)

    # 取前50名
    result = []
    for i, r in enumerate(rankings[:50]):
        result.append({
            'rank': i + 1,
            'user_id': r['user_id'],
            'name': r['name'],
            'level': r['level'],
            'value': r['value']
        })

    output = {
        'type': type_,
        'period': period,
        'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'cached_at': datetime.now().isoformat(),
        'rankings': result
    }

    # 更新缓存
    cache[cache_key] = output
    _save_json('leaderboard_cache.json', cache)

    return output


# ============================================
# 公会任务定义
# ============================================

GUILD_TASKS = {
    'daily_checkin': {
        'id': 'daily_checkin',
        'name': '每日打卡',
        'description': '每天在校园内签到一次',
        'score': 10,
        'period': 'daily'
    },
    'ar_explore': {
        'id': 'ar_explore',
        'name': 'AR探索',
        'description': '每周解锁3个新的AR标记',
        'score': 20,
        'period': 'weekly'
    },
    'task_complete': {
        'id': 'task_complete',
        'name': '任务达人',
        'description': '每周完成5个任务',
        'score': 15,
        'period': 'weekly'
    },
    'friend_interact': {
        'id': 'friend_interact',
        'name': '好友互动',
        'description': '每周与好友互动1次',
        'score': 5,
        'period': 'weekly'
    },
    'exam_prep': {
        'id': 'exam_prep',
        'name': '备考冲刺',
        'description': '连续3天完成学习任务',
        'score': 30,
        'period': 'weekly'
    }
}


# ============================================
# API 路由：好友系统
# ============================================

@social_bp.route('/friends', methods=['GET'])
@_require_auth
def get_friends():
    """获取好友列表"""
    user_id = request.user_id
    fs = _load_friendships()
    entry = fs.get(user_id, {})
    friend_ids = entry.get('friends', [])

    friends = []
    for fid in friend_ids:
        info = _get_user_public_info(fid)
        friends.append(info)

    return jsonify({'success': True, 'friends': friends, 'count': len(friends)})


@social_bp.route('/requests', methods=['GET'])
@_require_auth
def get_friend_requests():
    """获取收到的好友申请列表"""
    user_id = request.user_id
    fs = _load_friendships()
    entry = fs.get(user_id, {})
    incoming = entry.get('incoming_requests', [])

    requests_list = []
    for fid in incoming:
        info = _get_user_public_info(fid)
        requests_list.append(info)

    outgoing = entry.get('outgoing_requests', [])
    outgoing_info = [_get_user_public_info(f) for f in outgoing]

    return jsonify({
        'success': True,
        'incoming': requests_list,
        'outgoing': outgoing_info,
        'incoming_count': len(incoming)
    })


@social_bp.route('/request', methods=['POST'])
@_require_auth
def send_friend_request():
    """发送好友申请"""
    user_id = request.user_id
    body = request.json or {}
    target_id = body.get('user_id', '').strip()

    if not target_id:
        return jsonify({'error': '缺少目标用户ID'}), 400
    if target_id == user_id:
        return jsonify({'error': '不能添加自己为好友'}), 400

    # 目标用户数据是否存在
    target_path = os.path.join(DATA_DIR, f'user_data_{target_id}.json')
    if not os.path.exists(target_path):
        return jsonify({'error': '目标用户不存在'}), 404

    fs = _ensure_user_friendship_entry(user_id)
    fs2 = _ensure_user_friendship_entry(target_id)

    # 不能重复申请
    if target_id in fs['outgoing_requests']:
        return jsonify({'error': '已发送过申请，请等待对方确认'}), 409

    # 已是好友
    if target_id in fs['friends']:
        return jsonify({'error': '你们已经是好友了'}), 409

    # 目标已将我拉黑（可选：预留机制）

    fs['outgoing_requests'].append(target_id)
    fs2['incoming_requests'].append(user_id)
    _save_friendships(fs)

    return jsonify({
        'success': True,
        'message': f'已向「{_get_user_name(target_id)}」发送好友申请'
    })


@social_bp.route('/respond', methods=['POST'])
@_require_auth
def respond_friend_request():
    """同意/拒绝好友申请"""
    user_id = request.user_id
    body = request.json or {}
    from_id = body.get('user_id', '').strip()
    action = body.get('action', '')  # accept | reject

    if not from_id:
        return jsonify({'error': '缺少申请人ID'}), 400
    if action not in ('accept', 'reject'):
        return jsonify({'error': 'action 必须是 accept 或 reject'}), 400

    fs = _load_friendships()
    user_entry = fs.get(user_id, {'friends': [], 'incoming_requests': [], 'outgoing_requests': []})
    from_entry = fs.get(from_id, {'friends': [], 'incoming_requests': [], 'outgoing_requests': []})

    if from_id not in user_entry['incoming_requests']:
        return jsonify({'error': '该申请不存在或已处理'}), 404

    # 从申请列表移除
    user_entry['incoming_requests'] = [x for x in user_entry['incoming_requests'] if x != from_id]
    from_entry['outgoing_requests'] = [x for x in from_entry['outgoing_requests'] if x != user_id]

    if action == 'accept':
        user_entry['friends'].append(from_id)
        from_entry['friends'].append(user_id)

        # 双方各获得社交奖励（仅首次）
        _award_social_reward(user_id, 'friend_added')
        _award_social_reward(from_id, 'friend_added')

    _save_friendships(fs)

    if action == 'accept':
        return jsonify({
            'success': True,
            'message': f'已与「{_get_user_name(from_id)}」成为好友！',
            'friend': _get_user_public_info(from_id)
        })
    else:
        return jsonify({
            'success': True,
            'message': '已拒绝申请'
        })


@social_bp.route('/friend/<target_id>', methods=['DELETE'])
@_require_auth
def remove_friend(target_id):
    """删除好友"""
    user_id = request.user_id

    fs = _load_friendships()
    user_entry = fs.get(user_id, {'friends': [], 'incoming_requests': [], 'outgoing_requests': []})
    target_entry = fs.get(target_id, {'friends': [], 'incoming_requests': [], 'outgoing_requests': []})

    if target_id not in user_entry['friends']:
        return jsonify({'error': '该用户不是你的好友'}), 404

    user_entry['friends'] = [x for x in user_entry['friends'] if x != target_id]
    target_entry['friends'] = [x for x in target_entry['friends'] if x != user_id]
    _save_friendships(fs)

    return jsonify({'success': True, 'message': '已删除好友'})


@social_bp.route('/search', methods=['GET'])
@_require_auth
def search_users():
    """搜索用户（按昵称模糊匹配）"""
    user_id = request.user_id
    query = request.args.get('q', '').strip()

    if len(query) < 1:
        return jsonify({'error': '搜索关键词至少1个字符'}), 400
    if len(query) > 20:
        return jsonify({'error': '搜索关键词过长'}), 400

    user_ids = _scan_all_user_ids()
    results = []

    for uid in user_ids:
        if uid == user_id:
            continue
        info = _get_user_public_info(uid)
        if query.lower() in info['name'].lower():
            fs = _load_friendships()
            user_entry = fs.get(user_id, {'friends': [], 'outgoing_requests': []})
            relationship = 'none'
            if uid in user_entry.get('friends', []):
                relationship = 'friend'
            elif uid in user_entry.get('outgoing_requests', []):
                relationship = 'request_sent'
            results.append({**info, 'relationship': relationship})
            if len(results) >= 10:
                break

    return jsonify({'success': True, 'results': results, 'query': query})


# ============================================
# API 路由：排行榜系统
# ============================================

@social_bp.route('/leaderboard/<lb_type>', methods=['GET'])
@_require_auth
def get_leaderboard(lb_type):
    """获取指定榜单"""
    user_id = request.user_id
    period = request.args.get('period', 'week')

    if lb_type not in ('campus_level', 'class_tasks', 'ar_explore'):
        return jsonify({'error': '无效的榜单类型'}), 400
    if period not in ('day', 'week', 'month'):
        period = 'week'

    result = _compute_leaderboard(lb_type, period)

    # 标记当前用户排名
    for r in result['rankings']:
        r['is_self'] = (r['user_id'] == user_id)

    # 找到当前用户排名（即使不在前50）
    user_in_list = next((r for r in result['rankings'] if r['user_id'] == user_id), None)
    if not user_in_list:
        user_rank = _find_user_rank(lb_type, user_id)
        if user_rank:
            result['rankings'].append({**user_rank, 'rank': user_rank.get('rank', '50+'), 'is_self': True})

    return jsonify({'success': True, **result})


@social_bp.route('/leaderboard/all', methods=['GET'])
@_require_auth
def get_all_leaderboards():
    """一次性获取全部3个榜单"""
    user_id = request.user_id
    period = request.args.get('period', 'week')

    if period not in ('day', 'week', 'month'):
        period = 'week'

    types = ['campus_level', 'class_tasks', 'ar_explore']
    labels = {
        'campus_level': '本校等级榜',
        'class_tasks': '任务完成榜',
        'ar_explore': 'AR探索榜'
    }

    result = {}
    for t in types:
        lb = _compute_leaderboard(t, period)
        for r in lb['rankings']:
            r['is_self'] = (r['user_id'] == user_id)
        result[t] = {
            'label': labels[t],
            'updated_at': lb['updated_at'],
            'rankings': lb['rankings'][:20]
        }

    return jsonify({'success': True, 'period': period, 'leaderboards': result})


def _find_user_rank(lb_type, user_id):
    """查找用户排名（用于不在前50的情况）"""
    user_ids = _scan_all_user_ids()
    entries = []
    for uid in user_ids:
        if uid == user_id:
            path = os.path.join(DATA_DIR, f'user_data_{uid}.json')
            if not os.path.exists(path):
                continue
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                role = data.get('role', {})
                stats = data.get('stats', {})
                name = data.get('user', {}).get('name', '冒险者')
                if lb_type == 'campus_level':
                    value = role.get('level', 1) * 1000 + role.get('experience', 0)
                elif lb_type == 'class_tasks':
                    value = stats.get('total_tasks_completed', 0)
                elif lb_type == 'ar_explore':
                    value = _count_ar_unlocks(uid)
                else:
                    value = 0
                return {
                    'user_id': uid,
                    'name': name,
                    'level': role.get('level', 1),
                    'value': value,
                    'rank': '50+'
                }
            except Exception:
                pass
    return None


# ============================================
# API 路由：公会系统
# ============================================

@social_bp.route('/guilds', methods=['GET'])
@_require_auth
def list_guilds():
    """获取公会列表"""
    guilds = _load_guilds()
    page = request.args.get('page', 1, type=int)
    per_page = 10

    guild_list = []
    for gid, gdata in guilds.items():
        guild_list.append({
            'guild_id': gid,
            'name': gdata.get('name', ''),
            'tag': gdata.get('tag', ''),
            'member_count': len(gdata.get('members', [])),
            'max_members': 20,
            'leader_name': _get_user_name(gdata.get('leader_id', '')),
            'total_score': gdata.get('total_score', 0),
            'created_at': gdata.get('created_at', '')
        })

    guild_list.sort(key=lambda x: x['total_score'], reverse=True)
    start = (page - 1) * per_page
    paginated = guild_list[start:start + per_page]

    return jsonify({
        'success': True,
        'guilds': paginated,
        'total': len(guild_list),
        'page': page
    })


@social_bp.route('/guild/me', methods=['GET'])
@_require_auth
def get_my_guild():
    """获取我的公会信息"""
    user_id = request.user_id

    guilds = _load_guilds()
    for gid, gdata in guilds.items():
        members = gdata.get('members', [])
        pending = gdata.get('pending_members', [])
        if user_id in members:
            return jsonify({
                'success': True,
                'guild': _build_guild_detail(gid, gdata, user_id)
            })
        if user_id in pending:
            return jsonify({
                'success': True,
                'guild': None,
                'pending': True,
                'guild_id': gid,
                'guild_name': gdata.get('name', '')
            })

    return jsonify({'success': True, 'guild': None, 'pending': False})


@social_bp.route('/guild/create', methods=['POST'])
@_require_auth
def create_guild():
    """创建公会"""
    user_id = request.user_id
    body = request.json or {}
    name = (body.get('name') or '').strip()
    tag = (body.get('tag') or '').strip().upper()

    if not name or len(name) < 2:
        return jsonify({'error': '公会名称至少2个字符'}), 400
    if len(name) > 12:
        return jsonify({'error': '公会名称最多12个字符'}), 400
    if not tag or len(tag) < 2 or len(tag) > 6:
        return jsonify({'error': '公会标签需要2-6个字符'}), 400

    # 检查是否已在公会
    my_guild = _get_user_guild_id(user_id)
    if my_guild:
        return jsonify({'error': '你已经在公会中'}), 409

    guilds = _load_guilds()
    # 检查同名公会
    for gdata in guilds.values():
        if gdata.get('name') == name:
            return jsonify({'error': '公会名称已存在'}), 409

    guild_id = hashlib.md5(f'{name}_{user_id}_{datetime.now().isoformat()}'.encode()).hexdigest()[:12]

    guilds[guild_id] = {
        'name': name,
        'tag': tag,
        'leader_id': user_id,
        'members': [user_id],
        'pending_members': [],
        'created_at': datetime.now().strftime('%Y-%m-%d'),
        'total_score': 0,
        'tasks': {},
        'description': body.get('description', '')
    }
    _save_guilds(guilds)

    return jsonify({
        'success': True,
        'message': f'公会「{name}」创建成功！',
        'guild': _build_guild_detail(guild_id, guilds[guild_id], user_id)
    })


@social_bp.route('/guild/join/<guild_id>', methods=['POST'])
@_require_auth
def join_guild(guild_id):
    """申请加入公会"""
    user_id = request.user_id

    my_guild = _get_user_guild_id(user_id)
    if my_guild:
        return jsonify({'error': '你已经在公会中'}), 409

    guilds = _load_guilds()
    guild = guilds.get(guild_id)
    if not guild:
        return jsonify({'error': '公会不存在'}), 404

    pending = guild.get('pending_members', [])
    if user_id in pending:
        return jsonify({'error': '你已经在申请中'}), 409

    pending.append(user_id)
    guilds[guild_id]['pending_members'] = pending
    _save_guilds(guilds)

    return jsonify({
        'success': True,
        'message': f'已申请加入「{guild["name"]}」，等待会长审批'
    })


@social_bp.route('/guild/respond_join', methods=['POST'])
@_require_auth
def respond_join_guild():
    """会长审批加入申请"""
    user_id = request.user_id
    body = request.json or {}
    target_id = body.get('user_id', '').strip()
    guild_id = body.get('guild_id', '').strip()
    action = body.get('action', '')  # accept | reject

    if not target_id or not guild_id:
        return jsonify({'error': '缺少必要参数'}), 400
    if action not in ('accept', 'reject'):
        return jsonify({'error': 'action 必须是 accept 或 reject'}), 400

    guilds = _load_guilds()
    guild = guilds.get(guild_id)
    if not guild:
        return jsonify({'error': '公会不存在'}), 404

    if guild.get('leader_id') != user_id:
        return jsonify({'error': '只有会长可以审批'}), 403

    pending = guild.get('pending_members', [])
    if target_id not in pending:
        return jsonify({'error': '该申请不存在'}), 404

    pending = [x for x in pending if x != target_id]
    guilds[guild_id]['pending_members'] = pending

    if action == 'accept':
        members = guild.get('members', [])
        if len(members) >= 20:
            return jsonify({'error': '公会已满员'}), 409
        members.append(target_id)
        guilds[guild_id]['members'] = members
        _award_social_reward(target_id, 'guild_joined')

    _save_guilds(guilds)

    return jsonify({
        'success': True,
        'message': '已处理申请' if action == 'reject' else f'已批准「{_get_user_name(target_id)}」加入公会'
    })


@social_bp.route('/guild/leave', methods=['POST'])
@_require_auth
def leave_guild():
    """退出公会"""
    user_id = request.user_id

    guild_id = _get_user_guild_id(user_id)
    if not guild_id:
        return jsonify({'error': '你未加入任何公会'}), 400

    guilds = _load_guilds()
    guild = guilds.get(guild_id)
    if not guild:
        return jsonify({'error': '公会不存在'}), 404

    if guild.get('leader_id') == user_id and len(guild.get('members', [])) > 1:
        return jsonify({'error': '会长需先转让会长权限或解散公会才能退出'}), 403

    members = [x for x in guild.get('members', []) if x != user_id]
    guilds[guild_id]['members'] = members

    if not members:
        del guilds[guild_id]
    _save_guilds(guilds)

    return jsonify({'success': True, 'message': '已退出公会'})


@social_bp.route('/guild/<guild_id>', methods=['GET'])
@_require_auth
def get_guild_detail(guild_id):
    """获取公会详情"""
    user_id = request.user_id
    guilds = _load_guilds()
    guild = guilds.get(guild_id)
    if not guild:
        return jsonify({'error': '公会不存在'}), 404

    return jsonify({
        'success': True,
        'guild': _build_guild_detail(guild_id, guild, user_id)
    })


@social_bp.route('/guild/task/complete', methods=['POST'])
@_require_auth
def complete_guild_task():
    """完成公会任务，为公会贡献分数"""
    user_id = request.user_id
    body = request.json or {}
    task_id = body.get('task_id', '')

    guild_id = _get_user_guild_id(user_id)
    if not guild_id:
        return jsonify({'error': '你未加入任何公会'}), 400

    task_meta = GUILD_TASKS.get(task_id)
    if not task_meta:
        return jsonify({'error': '无效的公会任务'}), 404

    guilds = _load_guilds()
    guild = guilds.get(guild_id)
    if not guild:
        return jsonify({'error': '公会不存在'}), 404

    # 检查任务是否已完成（防止重复提交）
    user_tasks = guild.get('tasks', {}).get(user_id, {})
    task_key = f'{task_meta["period"]}_{task_id}'
    last_done = user_tasks.get(task_key, '')

    today = datetime.now().strftime('%Y-%m-%d')
    week_start = (datetime.now() - timedelta(days=datetime.now().weekday())).strftime('%Y-%m-%d')

    if task_meta['period'] == 'daily' and last_done == today:
        return jsonify({'error': '该任务今日已完成'}), 409
    if task_meta['period'] == 'weekly' and last_done == week_start:
        return jsonify({'error': '该任务本周已完成'}), 409

    # 写入完成记录
    if 'tasks' not in guild:
        guild['tasks'] = {}
    if user_id not in guild['tasks']:
        guild['tasks'][user_id] = {}

    if task_meta['period'] == 'daily':
        guild['tasks'][user_id][task_key] = today
    else:
        guild['tasks'][user_id][task_key] = week_start

    # 累加公会总分
    guild['total_score'] = guild.get('total_score', 0) + task_meta['score']
    _save_guilds(guilds)

    return jsonify({
        'success': True,
        'message': f'公会任务「{task_meta["name"]}」完成！+{task_meta["score"]}分',
        'score_added': task_meta['score'],
        'total_score': guild['total_score']
    })


@social_bp.route('/guild/kick/<target_id>', methods=['DELETE'])
@_require_auth
def kick_guild_member(target_id):
    """会长踢出成员"""
    user_id = request.user_id

    guild_id = _get_user_guild_id(user_id)
    if not guild_id:
        return jsonify({'error': '你未加入任何公会'}), 400

    if target_id == user_id:
        return jsonify({'error': '不能踢出自己'}), 400

    guilds = _load_guilds()
    guild = guilds.get(guild_id)
    if not guild:
        return jsonify({'error': '公会不存在'}), 404

    if guild.get('leader_id') != user_id:
        return jsonify({'error': '只有会长可以踢人'}), 403

    members = [x for x in guild.get('members', []) if x != target_id]
    guilds[guild_id]['members'] = members
    _save_guilds(guilds)

    return jsonify({
        'success': True,
        'message': f'已将「{_get_user_name(target_id)}」移出公会'
    })


@social_bp.route('/guild/transfer_leader', methods=['POST'])
@_require_auth
def transfer_leader():
    """转让会长权限"""
    user_id = request.user_id
    body = request.json or {}
    new_leader_id = body.get('user_id', '').strip()

    guild_id = _get_user_guild_id(user_id)
    if not guild_id:
        return jsonify({'error': '你未加入任何公会'}), 400

    guilds = _load_guilds()
    guild = guilds.get(guild_id)
    if not guild:
        return jsonify({'error': '公会不存在'}), 404

    if guild.get('leader_id') != user_id:
        return jsonify({'error': '只有会长可以转让权限'}), 403

    if new_leader_id not in guild.get('members', []):
        return jsonify({'error': '目标成员不在公会中'}), 404

    guilds[guild_id]['leader_id'] = new_leader_id
    _save_guilds(guilds)

    return jsonify({
        'success': True,
        'message': f'会长权限已转让给「{_get_user_name(new_leader_id)}」'
    })


# ============================================
# 内部辅助函数
# ============================================

def _get_user_guild_id(user_id):
    """获取用户所在公会的ID，不在则返回None"""
    guilds = _load_guilds()
    for gid, gdata in guilds.items():
        if user_id in gdata.get('members', []):
            return gid
    return None


def _build_guild_detail(guild_id, gdata, current_user_id):
    """构建公会详情响应"""
    members = gdata.get('members', [])
    pending = gdata.get('pending_members', [])
    leader_id = gdata.get('leader_id', '')

    member_list = []
    for mid in members:
        info = _get_user_public_info(mid)
        member_list.append({
            **info,
            'is_leader': mid == leader_id,
            'joined_at': gdata.get('created_at', '')
        })

    pending_list = [_get_user_public_info(pid) for pid in pending]

    # 计算公会任务完成情况（当前用户）
    user_tasks = gdata.get('tasks', {}).get(current_user_id, {})
    task_status = {}
    for task_id, meta in GUILD_TASKS.items():
        period_key = f'{meta["period"]}_{task_id}'
        last_done = user_tasks.get(period_key, '')
        today = datetime.now().strftime('%Y-%m-%d')
        week_start = (datetime.now() - timedelta(days=datetime.now().weekday())).strftime('%Y-%m-%d')
        if meta['period'] == 'daily':
            completed = last_done == today
        else:
            completed = last_done == week_start
        task_status[task_id] = {
            'completed': completed,
            'score': meta['score'],
            'name': meta['name'],
            'description': meta['description']
        }

    return {
        'guild_id': guild_id,
        'name': gdata.get('name', ''),
        'tag': gdata.get('tag', ''),
        'description': gdata.get('description', ''),
        'leader_id': leader_id,
        'leader_name': _get_user_name(leader_id),
        'members': member_list,
        'member_count': len(members),
        'max_members': 20,
        'pending_count': len(pending),
        'pending_list': pending_list,
        'total_score': gdata.get('total_score', 0),
        'created_at': gdata.get('created_at', ''),
        'tasks': list(GUILD_TASKS.values()),
        'task_status': task_status,
        'is_leader': leader_id == current_user_id
    }


def _award_social_reward(user_id, reward_type):
    """发放社交相关奖励"""
    rewards = {
        'friend_added': {'experience': 30, 'gold': 20},
        'guild_joined': {'experience': 50, 'gold': 30}
    }
    reward = rewards.get(reward_type)
    if not reward:
        return

    path = os.path.join(DATA_DIR, f'user_data_{user_id}.json')
    if not os.path.exists(path):
        return
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return

    role = data.get('role', {})
    role['gold'] = role.get('gold', 0) + reward.get('gold', 0)
    role['experience'] = role.get('experience', 0) + reward.get('experience', 0)
    data['role'] = role
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
