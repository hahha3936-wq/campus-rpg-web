"""
校园RPG - NPC生态系统后端接口
提供NPC解锁、好友度、对话、任务相关接口
"""

from flask import Blueprint, jsonify, request
import os
import json
import jwt
from functools import wraps
from datetime import datetime
import random
import re

npc_bp = Blueprint('npc', __name__)

# ============================================
# 认证 & 工具函数（复制自server.py，保持独立）
# ============================================
JWT_SECRET = os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026')
JWT_ALGORITHM = 'HS256'

# 数据文件路径
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


def _load_user_data(user_id):
    """从 data/users_{user_id}.json 加载用户数据"""
    user_file = os.path.join(DATA_DIR, f'users_{user_id}.json')
    if os.path.exists(user_file):
        try:
            with open(user_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return None


def _save_user_data(user_id, data):
    """保存用户数据到 data/users_{user_id}.json"""
    user_file = os.path.join(DATA_DIR, f'users_{user_id}.json')
    os.makedirs(os.path.dirname(user_file), exist_ok=True)
    try:
        with open(user_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


# ============================================
# NPC数据定义（与前端保持一致）
# ============================================

# NPC解锁条件定义
NPC_UNLOCK_CONFIG = {
    # 导师型 - 初始解锁
    'mentor_wang': {'type': 'initial', 'story_sequence': 1},
    'mentor_li': {'type': 'initial', 'story_sequence': 2},
    'mentor_zhao': {'type': 'initial', 'story_sequence': 3},
    # 学长型 - 任务/AR解锁
    'senior_xiaoming': {'type': 'ar_scan', 'condition': 'AR扫描教学楼或图书馆标记', 'story_sequence': 1},
    'senior_contest': {'type': 'task_complete', 'threshold': 20, 'story_sequence': 2},
    'senior_upgrade': {'type': 'achievement', 'condition': 'ach_2', 'story_sequence': 3},
    # 校园生活型 - AR场景解锁
    'campus_librarian': {'type': 'ar_scan', 'condition': 'AR扫描图书馆标记', 'story_sequence': 1},
    'campus_canteen': {'type': 'ar_scan', 'condition': 'AR扫描食堂标记', 'story_sequence': 2},
    'campus_security': {'type': 'ar_scan', 'condition': 'AR扫描校门标记', 'story_sequence': 3},
    'campus_club': {'type': 'ar_scan', 'condition': 'AR扫描操场标记', 'story_sequence': 4},
    # 兴趣型 - 公会/成就解锁
    'club_tech': {'type': 'guild_join', 'condition': '加入公会', 'story_sequence': 1},
    'club_art': {'type': 'achievement', 'condition': 'ach_interest_1', 'story_sequence': 2},
    # 自定义型 - 稀有成就解锁
    'custom_pixel_hero': {'type': 'exploration_complete', 'threshold': 100, 'story_sequence': 1},
}

# NPC基础信息
NPC_INFO = {
    'mentor_wang': {
        'name': '王辅导员', 'title': '辅导员', 'avatar': '👨‍🏫', 'category': '导师型',
        'color': '#667eea', 'bio': '王辅导员是你大学生活的引路人。他熟悉学校的每一个角落，总是能在你需要帮助时给予最贴心的建议。',
        'personality': '温和严谨、循循善诱、亦师亦友',
        'expertise': ['学业规划', '心理辅导', '奖助学金', '就业指导'],
        'default_greeting': '欢迎来到大学！我是你的辅导员王老师，大学是一个新的起点，让我们一起规划你的成长之路吧！',
    },
    'mentor_li': {
        'name': '李高数老师', 'title': '高数教师', 'avatar': '📐', 'category': '导师型',
        'color': '#f59e0b', 'bio': '李老师是全校最受欢迎的高数老师，他的课堂从不枯燥。',
        'personality': '严谨博学、风趣幽默、耐心细致',
        'expertise': ['高等数学', '线性代数', '概率论', '竞赛数学'],
        'default_greeting': '数学是思维的体操，欢迎来到高数的世界！别担心，我会用最简单的方式带你走进数学的殿堂。',
    },
    'mentor_zhao': {
        'name': '赵英语老师', 'title': '英语教师', 'avatar': '🔤', 'category': '导师型',
        'color': '#3b82f6', 'bio': '赵老师发音地道，擅长激发学生对英语学习的兴趣。',
        'personality': '热情开朗、善于鼓励、国际化视野',
        'expertise': ['大学英语', '英语口语', '四级备考', '雅思托福'],
        'default_greeting': 'Welcome to the world of English! 英语不只是考试科目，更是通向世界的钥匙。',
    },
    'senior_xiaoming': {
        'name': '张考研学长', 'title': '上岸学长', 'avatar': '🎓', 'category': '学长型',
        'color': '#10b981', 'bio': '张学长去年成功考取了985高校的研究生，是学院里的风云人物。',
        'personality': '热心谦逊、经验丰富、善于倾听',
        'expertise': ['考研规划', '专业课复习', '心态调整', '面试技巧'],
        'default_greeting': '嘿！我是张考研学长，刚刚拿到985的录取通知书！考研这条路我走通了，想把经验分享给你。',
    },
    'senior_contest': {
        'name': '林竞赛学长', 'title': '竞赛达人', 'avatar': '🏆', 'category': '学长型',
        'color': '#f97316', 'bio': '林学长是各类学科竞赛的常胜将军，获得过国家级竞赛一等奖。',
        'personality': '自信干练、效率至上、倾囊相授',
        'expertise': ['竞赛规划', '项目经验', '团队协作', '成果展示'],
        'default_greeting': '你好！我是竞赛达人林学长。学科竞赛是大学里最快速提升自己的方式之一！',
    },
    'senior_upgrade': {
        'name': '陈升本学姐', 'title': '升本成功学姐', 'avatar': '📚', 'category': '学长型',
        'color': '#ec4899', 'bio': '陈学姐通过专升本考试，从专科成功升入本科，是学院里励志的代名词。',
        'personality': '坚韧励志、积极乐观、真诚温暖',
        'expertise': ['专升本', '自我驱动', '逆袭经验', '学习方法'],
        'default_greeting': '嗨！我是陈学姐，从专科一路走到本科，只要你想，你就可以！',
    },
    'campus_librarian': {
        'name': '图书馆刘阿姨', 'title': '图书馆管理员', 'avatar': '👩‍💼', 'category': '校园生活型',
        'color': '#8b5cf6', 'bio': '刘阿姨在图书馆工作已经十五年了，她对馆内每一本书的位置都了如指掌。',
        'personality': '和蔼可亲、博闻广识、善于发现',
        'expertise': ['图书推荐', '图书馆资源', '安静学习环境', '校园冷知识'],
        'default_greeting': '哟，来图书馆啦！这里可是学校里最安静、氛围最好的地方。',
    },
    'campus_canteen': {
        'name': '食堂王阿姨', 'title': '食堂工作人员', 'avatar': '🍳', 'category': '校园生活型',
        'color': '#f97316', 'bio': '王阿姨负责食堂的某个窗口，她打菜从不手抖，总是最照顾学生的。',
        'personality': '热情爽朗、关怀备至、美食达人',
        'expertise': ['食堂攻略', '校园美食', '营养搭配', '隐藏窗口'],
        'default_greeting': '孩子，来吃饭啦？今天有新品，我给你多打点！',
    },
    'campus_security': {
        'name': '保安李师傅', 'title': '校园保安', 'avatar': '🛡️', 'category': '校园生活型',
        'color': '#64748b', 'bio': '李师傅是校园的"守护神"，每天巡逻在校园的各个角落。',
        'personality': '沉稳可靠、见多识广、正义感强',
        'expertise': ['校园安全', '路况信息', '校园传说', '失物招领'],
        'default_greeting': '站住！...哦，是你啊！校园里注意安全，晚上别太晚回宿舍。',
    },
    'campus_club': {
        'name': '社团联合会长小林', 'title': '社团联会长', 'avatar': '🎭', 'category': '校园生活型',
        'color': '#06b6d4', 'bio': '小林是学校社团联合会的会长，组织过上百场校园活动。',
        'personality': '活泼热情、组织能力强、人脉广泛',
        'expertise': ['社团活动', '校园事件', '人脉资源', '活动策划'],
        'default_greeting': '嗨！我是社团联会长小林！校园里有超多精彩的社团活动，一起来玩吧！',
    },
    'club_tech': {
        'name': '技术社社长阿杰', 'title': '技术社社长', 'avatar': '💻', 'category': '兴趣型',
        'color': '#3b82f6', 'bio': '阿杰是学校技术社的创始人，精通编程、硬件和各类新技术。',
        'personality': '极客精神、乐于分享、追求卓越',
        'expertise': ['编程技术', '项目开发', '开源协作', '技术分享'],
        'default_greeting': 'Hey！我是技术社社长阿杰。代码改变世界，你想学编程吗？',
    },
    'club_art': {
        'name': '美术社社长小雅', 'title': '美术社社长', 'avatar': '🎨', 'category': '兴趣型',
        'color': '#ec4899', 'bio': '小雅是美术学院的学生，也是校园里最会画画的人。',
        'personality': '细腻敏感、审美出众、温柔鼓励',
        'expertise': ['绘画技巧', '色彩搭配', '设计思维', '艺术鉴赏'],
        'default_greeting': 'Hi~我是美术社的小雅！画画是一种表达自我的方式，不需要基础，只要你有热爱！',
    },
    'custom_pixel_hero': {
        'name': '像素冒险家', 'title': '神秘来客', 'avatar': '🧙', 'category': '自定义型',
        'color': '#fbbf24', 'bio': '来自像素世界的冒险家，穿越次元壁来到校园。',
        'personality': '神秘莫测、充满童趣、游戏化思维',
        'expertise': ['游戏化学习', '冒险故事', '次元穿越', '像素艺术'],
        'default_greeting': '旅人，你好！我是来自像素世界的冒险家，在这里你可以把学习变成一场冒险！',
    },
}

# 好感度配置（所有NPC共用此配置）
_NPC_AFFECTION_DEFAULT = {
    'initial': 30,  # 初始好感度
    'max': 500,     # 最大好感度
    'ranks': [
        {'level': 0, 'label': '陌生', 'threshold': 0},
        {'level': 1, 'label': '初识', 'threshold': 50},
        {'level': 2, 'label': '熟悉', 'threshold': 150},
        {'level': 3, 'label': '友好', 'threshold': 280},
        {'level': 4, 'label': '信赖', 'threshold': 400},
        {'level': 5, 'label': '挚友', 'threshold': 500},
    ],
    'gain_conditions': [
        {'action': 'complete_task', 'factor': 10, 'label': '完成任务'},
        {'action': 'daily_signin', 'factor': 3, 'label': '每日签到'},
        {'action': 'exam_pass', 'factor': 25, 'label': '考试通过'},
        {'action': 'npc_chat', 'factor': 1, 'label': '对话互动'},
        {'action': 'level_up', 'factor': 15, 'label': '等级提升'},
    ],
    'decay': {'enabled': True, 'days': 7, 'amount': -5},
}
NPC_AFFECTION_CONFIG = {
    npc_id: _NPC_AFFECTION_DEFAULT for npc_id in [
        'mentor_wang', 'mentor_li', 'mentor_zhao',
        'senior_xiaoming', 'senior_contest', 'senior_sports',
        'campus_librarian', 'campus_canteen', 'campus_security',
        'club_photography', 'club_reading', 'club_music',
        'custom_pixel',
    ]
}


# ============================================
# 对话历史存储（内存，VPS重启会丢失）
# ============================================
_user_npc_history = {}  # user_id -> { npc_id -> [{role, content}] }


def _get_npc_history(user_id, npc_id, max_turns=10):
    hist = _user_npc_history.get(user_id, {}).get(npc_id, [])
    return hist[-max_turns * 2:]


def _append_npc_history(user_id, npc_id, role, content):
    if user_id not in _user_npc_history:
        _user_npc_history[user_id] = {}
    if npc_id not in _user_npc_history[user_id]:
        _user_npc_history[user_id][npc_id] = []
    _user_npc_history[user_id][npc_id].append([role, content])
    if len(_user_npc_history[user_id][npc_id]) > 40:
        _user_npc_history[user_id][npc_id] = _user_npc_history[user_id][npc_id][-40:]


# ============================================
# NPC任务数据
# ============================================
NPC_TASKS = {
    'mentor_wang': [
        {'id': 'mentor_wang_task_1', 'icon': '📚', 'name': '制定学期学习计划', 'desc': '与王辅导员沟通，制定本学期的学习目标与计划', 'difficulty': 'easy', 'reward': {'exp': 30, 'gold': 15, 'affection': 10}},
        {'id': 'mentor_wang_task_2', 'icon': '🎯', 'name': '参加辅导员例会', 'desc': '参加每月的辅导员见面会，了解校园动态', 'difficulty': 'medium', 'reward': {'exp': 50, 'gold': 25, 'affection': 15}},
    ],
    'mentor_li': [
        {'id': 'mentor_li_task_1', 'icon': '📖', 'name': '完成高数第一章', 'desc': '预习并理解高数第一章的核心知识点', 'difficulty': 'medium', 'reward': {'exp': 40, 'gold': 20, 'affection': 12}},
    ],
    'mentor_zhao': [
        {'id': 'mentor_zhao_task_1', 'icon': '📝', 'name': '四级词汇冲刺', 'desc': '每天学习并复习20个四级核心词汇', 'difficulty': 'medium', 'reward': {'exp': 35, 'gold': 18, 'affection': 10}},
    ],
    'senior_xiaoming': [
        {'id': 'senior_xiaoming_task_1', 'icon': '📋', 'name': '了解考研基本信息', 'desc': '向张考研学长了解考研流程和复习规划', 'difficulty': 'easy', 'reward': {'exp': 25, 'gold': 12, 'affection': 8}},
        {'id': 'senior_xiaoming_task_2', 'icon': '📚', 'name': '制定考研复习计划', 'desc': '根据学长建议，制定个人考研复习时间表', 'difficulty': 'medium', 'reward': {'exp': 50, 'gold': 25, 'affection': 15}},
    ],
    'senior_contest': [
        {'id': 'senior_contest_task_1', 'icon': '💡', 'name': '寻找感兴趣的竞赛', 'desc': '了解各类竞赛信息，找到适合自己的参赛方向', 'difficulty': 'easy', 'reward': {'exp': 30, 'gold': 15, 'affection': 10}},
    ],
    'campus_librarian': [
        {'id': 'campus_librarian_task_1', 'icon': '📖', 'name': '借阅一本专业书籍', 'desc': '去图书馆借阅一本与专业相关的书籍', 'difficulty': 'easy', 'reward': {'exp': 20, 'gold': 10, 'affection': 8}},
    ],
    'campus_canteen': [
        {'id': 'campus_canteen_task_1', 'icon': '🍜', 'name': '探索食堂美食', 'desc': '去食堂探索不同的窗口，发现隐藏的美味', 'difficulty': 'easy', 'reward': {'exp': 15, 'gold': 8, 'affection': 5}},
    ],
}


# ============================================
# 接口: GET /api/npc/list
# 获取所有NPC列表（含解锁状态）
# ============================================
@npc_bp.route('/list', methods=['GET'])
@_require_auth
def get_npc_list():
    user_id = request.user_id
    user_data = _load_user_data(user_id)
    if not user_data:
        return jsonify({'success': False, 'error': '用户数据不存在'}), 404

    unlocked_npcs = user_data.get('npc_unlocked', [])
    npc_relations = user_data.get('npc_relationship', {})

    # 获取用户统计数据
    tasks = user_data.get('tasks', {})
    completed_count = sum(
        1 for task_list in tasks.values()
        if isinstance(task_list, list)
        for t in task_list
        if t.get('status') == 'completed' or t.get('progress', 0) >= 100
    )

    result = []
    for npc_id, info in NPC_INFO.items():
        is_unlocked = npc_id in unlocked_npcs or NPC_UNLOCK_CONFIG.get(npc_id, {}).get('type') == 'initial'

        # 检查解锁条件
        unlock_config = NPC_UNLOCK_CONFIG.get(npc_id, {})
        unlock_status = 'locked'
        if unlock_config.get('type') == 'initial':
            unlock_status = 'unlocked'
        elif npc_id in unlocked_npcs:
            unlock_status = 'unlocked'
        elif unlock_config.get('type') == 'task_complete':
            threshold = unlock_config.get('threshold', 0)
            unlock_status = 'locked'
            if completed_count >= threshold:
                unlock_status = 'can_unlock'
        elif unlock_config.get('type') == 'ar_scan':
            unlock_status = 'can_ar_unlock'

        relation = npc_relations.get(npc_id, {})
        affection = relation.get('affection', NPC_AFFECTION_CONFIG.get(npc_id, {}).get('initial', 20) if is_unlocked else 0)
        max_affection = relation.get('max_affection', 500)

        # 计算等级
        level = 0
        for rank in sorted(NPC_AFFECTION_CONFIG.get('mentor_wang', {}).get('ranks', []), key=lambda x: x['threshold']):
            if affection >= rank['threshold']:
                level = rank['level']

        result.append({
            'npc_id': npc_id,
            'name': info['name'],
            'title': info['title'],
            'avatar': info['avatar'],
            'category': info['category'],
            'color': info['color'],
            'bio': info['bio'],
            'is_unlocked': is_unlocked,
            'unlock_status': unlock_status,
            'unlock_hint': _get_unlock_hint(unlock_config),
            'affection': affection,
            'max_affection': max_affection,
            'affection_level': level,
            'last_active': relation.get('lastActive'),
        })

    return jsonify({
        'success': True,
        'npcs': result,
        'total': len(result),
        'unlocked_count': sum(1 for n in result if n['is_unlocked']),
    })


def _get_unlock_hint(config):
    if not config:
        return '未知解锁条件'
    t = config.get('type')
    if t == 'initial':
        return '初始解锁'
    elif t == 'task_complete':
        return f'完成{config.get("threshold", 0)}个任务'
    elif t == 'ar_scan':
        return config.get('condition', 'AR扫描解锁')
    elif t == 'achievement':
        return f'解锁成就：{config.get("condition")}'
    elif t == 'guild_join':
        return '加入公会'
    elif t == 'exploration_complete':
        return f'AR探索达到{config.get("threshold", 100)}%'
    return '未知条件'


# ============================================
# 接口: GET /api/npc/<npc_id>
# 获取单个NPC详情
# ============================================
@npc_bp.route('/<npc_id>', methods=['GET'])
@_require_auth
def get_npc_detail(npc_id):
    user_id = request.user_id

    if npc_id not in NPC_INFO:
        return jsonify({'success': False, 'error': 'NPC不存在'}), 404

    user_data = _load_user_data(user_id)
    if not user_data:
        return jsonify({'success': False, 'error': '用户数据不存在'}), 404

    unlocked_npcs = user_data.get('npc_unlocked', [])
    npc_relations = user_data.get('npc_relationship', {})

    is_unlocked = npc_id in unlocked_npcs or NPC_UNLOCK_CONFIG.get(npc_id, {}).get('type') == 'initial'
    if not is_unlocked:
        return jsonify({'success': False, 'error': 'NPC未解锁'}), 403

    info = NPC_INFO[npc_id]
    relation = npc_relations.get(npc_id, {})
    affection = relation.get('affection', 20)
    max_affection = relation.get('max_affection', 500)

    # 计算等级
    level = 0
    rank_label = '陌生'
    for rank in sorted(NPC_AFFECTION_CONFIG.get('mentor_wang', {}).get('ranks', []), key=lambda x: x['threshold']):
        if affection >= rank['threshold']:
            level = rank['level']
            rank_label = rank['label']

    # 获取任务
    tasks = NPC_TASKS.get(npc_id, [])

    # 获取对话历史
    history = _get_npc_history(user_id, npc_id)

    return jsonify({
        'success': True,
        'npc': {
            'npc_id': npc_id,
            'name': info['name'],
            'title': info['title'],
            'avatar': info['avatar'],
            'category': info['category'],
            'color': info['color'],
            'bio': info['bio'],
            'personality': info['personality'],
            'expertise': info['expertise'],
            'default_greeting': info['default_greeting'],
            'affection': affection,
            'max_affection': max_affection,
            'affection_level': level,
            'affection_rank': rank_label,
            'tasks': tasks,
            'history': [{'role': h[0], 'content': h[1]} for h in history],
        }
    })


# ============================================
# 接口: POST /api/npc/<npc_id>/unlock
# 解锁NPC（AR扫描触发）
# ============================================
@npc_bp.route('/<npc_id>/unlock', methods=['POST'])
@_require_auth
def unlock_npc(npc_id):
    user_id = request.user_id

    if npc_id not in NPC_INFO:
        return jsonify({'success': False, 'error': 'NPC不存在'}), 404

    user_data = _load_user_data(user_id)
    if not user_data:
        return jsonify({'success': False, 'error': '用户数据不存在'}), 404

    unlocked_npcs = set(user_data.get('npc_unlocked', []))
    unlock_config = NPC_UNLOCK_CONFIG.get(npc_id, {})

    # 检查前置条件
    if unlock_config.get('type') == 'initial':
        pass  # 初始解锁无需额外条件
    elif npc_id in unlocked_npcs:
        return jsonify({'success': False, 'error': 'NPC已经解锁'}), 400
    elif unlock_config.get('type') == 'ar_scan':
        # AR解锁需要传递marker_id验证
        data = request.json or {}
        marker_id = data.get('marker_id', '')
        if not _verify_ar_marker(npc_id, marker_id):
            return jsonify({'success': False, 'error': 'AR标记验证失败'}), 400
    else:
        return jsonify({'success': False, 'error': '该NPC不支持手动解锁'}), 400

    # 执行解锁
    unlocked_npcs.add(npc_id)
    user_data['npc_unlocked'] = list(unlocked_npcs)

    # 初始化好感度
    if 'npc_relationship' not in user_data:
        user_data['npc_relationship'] = {}
    user_data['npc_relationship'][npc_id] = {
        'affection': NPC_AFFECTION_CONFIG.get(npc_id, {}).get('initial', 20),
        'max_affection': 500,
        'title': NPC_INFO[npc_id]['title'],
        'lastActive': datetime.now().isoformat(),
        'unlockedAt': datetime.now().isoformat(),
    }

    if _save_user_data(user_id, user_data):
        return jsonify({
            'success': True,
            'message': f'成功解锁NPC：{NPC_INFO[npc_id]["name"]}',
            'npc': {
                'npc_id': npc_id,
                'name': NPC_INFO[npc_id]['name'],
                'avatar': NPC_INFO[npc_id]['avatar'],
                'category': NPC_INFO[npc_id]['category'],
                'initial_affection': user_data['npc_relationship'][npc_id]['affection'],
            }
        })
    else:
        return jsonify({'success': False, 'error': '保存失败'}), 500


def _verify_ar_marker(npc_id, marker_id):
    """验证AR标记是否匹配"""
    mapping = {
        'senior_xiaoming': ['marker_teaching_building', 'marker_library'],
        'campus_librarian': ['marker_library'],
        'campus_canteen': ['marker_canteen'],
        'campus_security': ['marker_gate'],
        'campus_club': ['marker_playground'],
        'senior_contest': ['marker_lab'],
    }
    return marker_id in mapping.get(npc_id, [])


# ============================================
# 接口: POST /api/npc/<npc_id>/affection
# 更新好感度
# ============================================
@npc_bp.route('/<npc_id>/affection', methods=['POST'])
@_require_auth
def update_affection(npc_id):
    user_id = request.user_id
    data = request.json or {}
    amount = data.get('amount', 0)

    if npc_id not in NPC_INFO:
        return jsonify({'success': False, 'error': 'NPC不存在'}), 404

    user_data = _load_user_data(user_id)
    if not user_data:
        return jsonify({'success': False, 'error': '用户数据不存在'}), 404

    unlocked_npcs = set(user_data.get('npc_unlocked', []))
    if npc_id not in unlocked_npcs and NPC_UNLOCK_CONFIG.get(npc_id, {}).get('type') != 'initial':
        return jsonify({'success': False, 'error': 'NPC未解锁'}), 400

    if 'npc_relationship' not in user_data:
        user_data['npc_relationship'] = {}

    rel = user_data['npc_relationship'].get(npc_id, {
        'affection': 20,
        'max_affection': 500,
        'title': NPC_INFO[npc_id]['title'],
    })

    old_affection = rel.get('affection', 20)
    max_affection = rel.get('max_affection', 500)
    new_affection = min(max_affection, max(0, old_affection + amount))
    rel['affection'] = new_affection
    rel['lastActive'] = datetime.now().isoformat()

    user_data['npc_relationship'][npc_id] = rel

    # 计算等级变化
    old_level = _calc_affection_level(old_affection)
    new_level = _calc_affection_level(new_affection)

    level_up = new_level > old_level

    if _save_user_data(user_id, user_data):
        return jsonify({
            'success': True,
            'affection': new_affection,
            'max_affection': max_affection,
            'level': new_level,
            'level_up': level_up,
            'rank_label': _get_rank_label(new_level),
            'message': f'好感度 {"+" if amount >= 0 else ""}{amount}，当前: {new_affection}/{max_affection}' + (' ★升级了！★' if level_up else ''),
        })
    else:
        return jsonify({'success': False, 'error': '保存失败'}), 500


def _calc_affection_level(affection):
    ranks = NPC_AFFECTION_CONFIG.get('mentor_wang', {}).get('ranks', [])
    level = 0
    for rank in ranks:
        if affection >= rank.get('threshold', 0):
            level = rank.get('level', 0)
    return level


def _get_rank_label(level):
    ranks = NPC_AFFECTION_CONFIG.get('mentor_wang', {}).get('ranks', [])
    for rank in ranks:
        if rank.get('level') == level:
            return rank.get('label', '')
    return '陌生'


# ============================================
# 接口: POST /api/npc/<npc_id>/chat
# NPC对话
# ============================================
@npc_bp.route('/<npc_id>/chat', methods=['POST'])
@_require_auth
def npc_chat(npc_id):
    user_id = request.user_id
    data = request.json or {}
    message = data.get('message', '').strip()

    if npc_id not in NPC_INFO:
        return jsonify({'error': 'NPC不存在'}), 404

    if not message:
        return jsonify({'error': '消息不能为空'}), 400

    user_data = _load_user_data(user_id)
    if not user_data:
        return jsonify({'error': '用户数据不存在'}), 404

    # 获取NPC信息
    info = NPC_INFO[npc_id]
    npc_relations = user_data.get('npc_relationship', {})
    relation = npc_relations.get(npc_id, {})
    affection = relation.get('affection', 20)
    level = _calc_affection_level(affection)

    # 记录对话历史
    _append_npc_history(user_id, npc_id, 'user', message)

    # 生成回复（简化版，实际应该调用AI）
    reply = _generate_npc_reply(npc_id, info, level, affection, message)

    # 记录AI回复
    _append_npc_history(user_id, npc_id, 'assistant', reply)

    # 增加好感度（对话互动）
    if 'npc_relationship' not in user_data:
        user_data['npc_relationship'] = {}
    rel = user_data['npc_relationship'].get(npc_id, {
        'affection': affection,
        'max_affection': 500,
    })
    current_affection = rel.get('affection', 20)
    rel['affection'] = min(rel.get('max_affection', 500), current_affection + 1)
    rel['lastActive'] = datetime.now().isoformat()
    user_data['npc_relationship'][npc_id] = rel
    _save_user_data(user_id, user_data)

    return jsonify({
        'success': True,
        'reply': reply,
        'affection': rel['affection'],
        'affection_level': level,
    })


def _generate_npc_reply(npc_id, info, level, affection, message):
    """生成NPC回复（简化模板版本）"""
    greetings = {
        'mentor_wang': ['学习要讲究方法，循序渐进才是正道。', '有什么学业上的困惑吗？尽管来问。', '大学四年很短，要珍惜每一天的学习时光。'],
        'mentor_li': ['数学是思维的体操，练得多了自然就通了。', '做题不在多，在于真正理解每一个知识点。', '高数其实很有趣，关键是用正确的方法去理解它。'],
        'mentor_zhao': ['英语学习最重要的是坚持，每天一点点，积少成多。', '多听多说，不要害怕犯错误，语言就是在错误中进步的。', '学习英语不只是为了考试，更是为了打开一扇窗。'],
        'senior_xiaoming': ['考研最重要的就是坚持，半途而废的人太多了。', '英语和数学要尽早开始复习，越早越好。', '专业课的复习要有针对性，多研究真题。'],
        'senior_contest': ['竞赛获奖不仅仅是荣誉，更是能力的证明。', '选择竞赛要结合自己的兴趣和优势。', '团队协作很重要，找到靠谱的队友就成功了一半。'],
        'senior_upgrade': ['专升本并不难，关键在于你有没有下定决心。', '学习方法比学习时间更重要，找到适合自己的节奏。', '相信自己，你能走到这里已经很棒了！'],
        'campus_librarian': ['图书馆是个好地方，要多来坐坐。', '这里有很多宝藏书籍，等着你去发现。', '安静的学习环境是最好的学习伴侣。'],
        'campus_canteen': ['吃饱了才有力气学习，别委屈自己的胃。', '食堂的糖醋排骨今天特别新鲜，要尝尝吗？', '营养均衡很重要，别光吃快餐。'],
        'campus_security': ['校园里晚上注意安全。', '有什么紧急情况随时来找我。', '深夜探险要注意保暖。'],
        'campus_club': ['社团活动是大学生活的重要组成部分！', '参加社团可以认识很多志同道合的朋友。', '下周的社团活动很有趣，要不要来看看？'],
        'club_tech': ['编程是一门技能，多动手写代码比只看教程有效得多。', 'GitHub是个好地方，要学会利用开源资源。', '技术社群是学习新技术最好的环境。'],
        'club_art': ['画画不需要天赋，只需要热爱和练习。', '艺术来源于生活，多观察周围的美。', '每个人都是艺术家，只是需要被发现。'],
        'custom_pixel_hero': ['学习就像一场冒险，每个任务都是一次成长！', '在这场校园冒险中，你是最耀眼的主角！', '勇敢地挑战自己，你会发现自己的无限可能！'],
    }

    replies = greetings.get(npc_id, ['你好！有什么我可以帮助的吗？'])

    # 根据好感度选择回复风格
    if level >= 4:
        # 高好感度：更热情、分享更多信息
        warm_replies = {
            'mentor_wang': ['你已经是我的得意门生了！来，跟你说说我的珍藏学习心得。', '有什么特别想了解的吗？我这儿有很多独家资源。'],
            'mentor_li': ['你的数学思维已经很棒了！来，给你出道有意思的题。'],
            'senior_xiaoming': ['你考研的决心我看在眼里，这个内部资料给你。'],
        }
        replies = warm_replies.get(npc_id, replies) + replies

    # 根据消息内容匹配回复
    msg_lower = message.lower()
    if any(k in msg_lower for k in ['你好', 'hi', 'hello', '嗨', '哈喽']):
        return info.get('default_greeting', '你好！')
    if any(k in msg_lower for k in ['谢谢', '感谢', '谢']):
        return '不客气！能帮到你我也很高兴~'
    if any(k in msg_lower for k in ['任务', '作业', '学习']):
        task_replies = ['学习任务要分清主次，先把重要的完成。', '制定计划是第一步，更重要的是执行。']
        return random.choice(task_replies + replies)
    if any(k in msg_lower for k in ['考试', '四级', '考研', '竞赛']):
        return random.choice(replies)

    return random.choice(replies)


# ============================================
# 接口: GET /api/npc/<npc_id>/tasks
# 获取NPC任务列表
# ============================================
@npc_bp.route('/<npc_id>/tasks', methods=['GET'])
@_require_auth
def get_npc_tasks(npc_id):
    if npc_id not in NPC_INFO:
        return jsonify({'success': False, 'error': 'NPC不存在'}), 404

    tasks = NPC_TASKS.get(npc_id, [])
    return jsonify({
        'success': True,
        'npc_id': npc_id,
        'tasks': tasks,
    })


# ============================================
# 接口: POST /api/npc/<npc_id>/task/<task_id>/accept
# 接受NPC任务
# ============================================
@npc_bp.route('/<npc_id>/task/<task_id>/accept', methods=['POST'])
@_require_auth
def accept_npc_task(npc_id, task_id):
    user_id = request.user_id
    user_data = _load_user_data(user_id)
    if not user_data:
        return jsonify({'success': False, 'error': '用户数据不存在'}), 404

    tasks = NPC_TASKS.get(npc_id, [])
    task = next((t for t in tasks if t['id'] == task_id), None)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404

    # 将任务添加到用户任务列表
    if 'tasks' not in user_data:
        user_data['tasks'] = {}
    if 'npc_tasks' not in user_data['tasks']:
        user_data['tasks']['npc_tasks'] = []

    # 检查是否已接受
    existing = next((t for t in user_data['tasks']['npc_tasks'] if t.get('id') == task_id), None)
    if existing:
        return jsonify({'success': False, 'error': '任务已接受'}), 400

    import time
    new_task = {
        **task,
        'status': 'in_progress',
        'source_npc': npc_id,
        'created_at': datetime.now().isoformat(),
        'progress': 0,
    }
    user_data['tasks']['npc_tasks'].append(new_task)

    if _save_user_data(user_id, user_data):
        return jsonify({
            'success': True,
            'message': f'成功接受任务：{task["name"]}',
            'task': new_task,
        })
    else:
        return jsonify({'success': False, 'error': '保存失败'}), 500


# ============================================
# 接口: GET /api/npc/progress
# 获取NPC解锁进度
# ============================================
@npc_bp.route('/progress', methods=['GET'])
@_require_auth
def get_npc_progress():
    user_id = request.user_id
    user_data = _load_user_data(user_id)

    unlocked = set(user_data.get('npc_unlocked', []))
    initial_npcs = [nid for nid, cfg in NPC_UNLOCK_CONFIG.items() if cfg.get('type') == 'initial']

    total = len(NPC_INFO)
    unlocked_count = len(unlocked) + len(initial_npcs)
    # 去重
    actual_unlocked = len(set(list(unlocked) + initial_npcs))

    by_category = {}
    for npc_id, info in NPC_INFO.items():
        cat = info['category']
        if cat not in by_category:
            by_category[cat] = {'total': 0, 'unlocked': 0}
        by_category[cat]['total'] += 1
        if npc_id in unlocked or NPC_UNLOCK_CONFIG.get(npc_id, {}).get('type') == 'initial':
            by_category[cat]['unlocked'] += 1

    return jsonify({
        'success': True,
        'progress': {
            'total': total,
            'unlocked': actual_unlocked,
            'percentage': round(actual_unlocked / total * 100) if total > 0 else 0,
            'by_category': by_category,
        }
    })
