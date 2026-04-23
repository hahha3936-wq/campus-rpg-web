"""
校园RPG - AR接口模块
提供AR标记、任务、成就的后端持久化接口
@version 1.0.0
"""

from flask import Blueprint, jsonify, request
import os
import json
import jwt
import requests as http_requests
from datetime import datetime
from functools import wraps

ar_bp = Blueprint('ar', __name__)

# ============================================
# 工具函数（从 server.py 复制，无侵入）
# ============================================
JWT_SECRET = os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026')
JWT_ALGORITHM = 'HS256'


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


def _get_ar_data_dir():
    base = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(os.path.dirname(base), 'data')
    os.makedirs(data_dir, exist_ok=True)
    return data_dir


def _ar_file_path(filename):
    return os.path.join(_get_ar_data_dir(), filename)


def _load_ar_json(filename, default=None):
    path = _ar_file_path(filename)
    try:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return default


def _save_ar_json(filename, data):
    path = _ar_file_path(filename)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f'保存AR数据失败 {path}: {e}')
        return False


# ============================================
# AR 标记解锁状态
# ============================================
def _get_marker_file(user_id):
    return f'ar_marker_states_{user_id}.json'


AR_MARKERS_META = [
    {'id': 'marker_001', 'name': '校徽标记', 'cooldown': 3600},
    {'id': 'marker_002', 'name': '教学楼标记', 'cooldown': 3600},
    {'id': 'marker_003', 'name': '图书馆标记', 'cooldown': 3600},
    {'id': 'marker_004', 'name': '食堂标记', 'cooldown': 1800},
    {'id': 'marker_005', 'name': '公告栏标记', 'cooldown': 7200},
]


# ============================================
# 接口: GET /api/ar/markers
# 获取用户所有标记解锁状态
# ============================================
@ar_bp.route('/markers', methods=['GET'])
@_require_auth
def get_marker_states():
    user_id = request.user_id
    data = _load_ar_json(_get_marker_file(user_id)) or {}
    result = []
    for meta in AR_MARKERS_META:
        mid = meta['id']
        entry = data.get(mid, {})
        last_time = entry.get('lastTriggerTime', 0)
        cooldown = meta['cooldown']
        elapsed = (datetime.utcnow().timestamp() - last_time) if last_time else cooldown
        on_cd = elapsed < cooldown
        result.append({
            'marker_id': mid,
            'name': meta['name'],
            'cooldown': cooldown,
            'last_trigger': last_time,
            'on_cooldown': on_cd,
            'cooldown_remaining': max(0, int(cooldown - elapsed)) if on_cd else 0,
            'trigger_count': entry.get('triggerCount', 0)
        })
    return jsonify({'success': True, 'markers': result})


# ============================================
# 接口: POST /api/ar/marker/unlock
# 标记解锁，发放奖励
# ============================================
@ar_bp.route('/marker/unlock', methods=['POST'])
@_require_auth
def unlock_marker():
    user_id = request.user_id
    body = request.json or {}
    marker_id = body.get('marker_id')
    if not marker_id:
        return jsonify({'error': '缺少 marker_id 参数'}), 400

    meta = next((m for m in AR_MARKERS_META if m['id'] == marker_id), None)
    if not meta:
        return jsonify({'error': '无效的 marker_id'}), 400

    # 检查冷却
    data = _load_ar_json(_get_marker_file(user_id)) or {}
    entry = data.get(marker_id, {})
    last_time = entry.get('lastTriggerTime', 0)
    cooldown = meta['cooldown']
    elapsed = (datetime.utcnow().timestamp() - last_time) if last_time else cooldown
    if elapsed < cooldown:
        remaining = int(cooldown - elapsed)
        return jsonify({'error': f'冷却中，还剩 {remaining} 秒', 'cooldown_remaining': remaining}), 429

    # 更新标记状态
    entry['lastTriggerTime'] = datetime.utcnow().timestamp()
    entry['triggerCount'] = entry.get('triggerCount', 0) + 1
    data[marker_id] = entry
    _save_ar_json(_get_marker_file(user_id), data)

    # 奖励配置
    rewards = {
        'marker_001': {'gold': 100, 'experience': 50, 'seed': 'common_knowledge'},
        'marker_002': {'experience': 30},
        'marker_003': {'experience': 80, 'seed': 'rare_knowledge'},
        'marker_004': {'energy': 30, 'gold': 15},
        'marker_005': {'gold': 50, 'experience': 40},
    }
    reward = rewards.get(marker_id, {})

    return jsonify({
        'success': True,
        'marker_id': marker_id,
        'reward': reward,
        'trigger_count': entry['triggerCount']
    })


# ============================================
# 接口: POST /api/ar/task/sync
# 同步AR任务到用户任务列表
# ============================================
@ar_bp.route('/task/sync', methods=['POST'])
@_require_auth
def sync_ar_task():
    user_id = request.user_id
    body = request.json or {}
    task_id = body.get('task_id')
    if not task_id:
        return jsonify({'error': '缺少 task_id 参数'}), 400

    # AR 任务模板
    AR_TASKS = {
        'ar_math_class': {
            'id': 'ar_math_class',
            'name': 'AR数学课任务',
            'category': 'ar',
            'description': '通过AR探索教学楼，完成一堂数学课的复习任务',
            'status': 'in_progress',
            'progress': 0,
            'subtasks': [
                {'id': 'st1', 'name': 'AR探索教学楼标记', 'completed': False, 'experience': 10},
                {'id': 'st2', 'name': '复习高数知识点', 'completed': False, 'experience': 20},
            ],
            'reward': {'experience': 30, 'gold': 20}
        },
        'ar_library_deep': {
            'id': 'ar_library_deep',
            'name': 'AR知识矿洞任务',
            'category': 'ar',
            'description': '通过AR探索图书馆，在知识矿洞自习完成深层学习',
            'status': 'in_progress',
            'progress': 0,
            'subtasks': [
                {'id': 'st1', 'name': 'AR探索图书馆标记', 'completed': False, 'experience': 15},
                {'id': 'st2', 'name': '自习30分钟', 'completed': False, 'experience': 65},
            ],
            'reward': {'experience': 80, 'gold': 40, 'seed': 'rare_knowledge'}
        }
    }

    task = AR_TASKS.get(task_id)
    if not task:
        return jsonify({'error': '未知的AR任务ID'}), 404

    return jsonify({'success': True, 'task': task})


# ============================================
# 接口: POST /api/ar/achievement/update
# 更新AR成就进度
# ============================================
@ar_bp.route('/achievement/update', methods=['POST'])
@_require_auth
def update_ar_achievement():
    user_id = request.user_id
    body = request.json or {}
    achievement_id = body.get('achievement_id')
    progress_delta = body.get('progress', 0)
    if not achievement_id:
        return jsonify({'error': '缺少 achievement_id 参数'}), 400

    # AR 成就定义
    AR_ACHIEVEMENTS = {
        'ar_explorer': {'name': 'AR探索家', 'target': 5, 'description': '使用AR探索5个校园标记'},
        'ar_master': {'name': 'AR大师', 'target': 3, 'description': '完成3个AR任务'},
        'ar_collector': {'name': '知识点收藏家', 'target': 10, 'description': '收集10个知识结晶'},
        'ar_first': {'name': 'AR初体验', 'target': 1, 'description': '首次使用AR功能'},
    }

    meta = AR_ACHIEVEMENTS.get(achievement_id)
    if not meta:
        return jsonify({'error': '未知的AR成就ID'}), 404

    # 读取用户成就数据
    achievements_file = _ar_file_path(f'ar_achievements_{user_id}.json')
    ar_ach = _load_ar_json(f'ar_achievements_{user_id}.json') or {}
    entry = ar_ach.get(achievement_id, {'progress': 0, 'unlocked': False})
    entry['progress'] = entry.get('progress', 0) + progress_delta
    unlocked = entry['progress'] >= meta['target']
    entry['unlocked'] = entry.get('unlocked', False) or unlocked
    ar_ach[achievement_id] = entry
    _save_ar_json(f'ar_achievements_{user_id}.json', ar_ach)

    return jsonify({
        'success': True,
        'achievement_id': achievement_id,
        'progress': entry['progress'],
        'target': meta['target'],
        'unlocked': entry['unlocked']
    })


# ============================================
# 接口: POST /api/ar/behavior/log
# 记录用户AR行为日志
# ============================================
@ar_bp.route('/behavior/log', methods=['POST'])
@_require_auth
def log_ar_behavior():
    user_id = request.user_id
    body = request.json or {}
    behavior_type = body.get('behavior_type')
    marker_id = body.get('marker_id')
    if not behavior_type:
        return jsonify({'error': '缺少 behavior_type 参数'}), 400

    log_file = f'ar_behavior_log_{user_id}.json'
    logs = _load_ar_json(log_file) or []
    logs.append({
        'timestamp': datetime.utcnow().isoformat(),
        'behavior_type': behavior_type,
        'marker_id': marker_id or ''
    })
    # 仅保留最近100条
    logs = logs[-100:]
    _save_ar_json(log_file, logs)

    return jsonify({'success': True})


# ============================================
# DeepSeek Vision 场景识别
# ============================================
_DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
_DEEPSEEK_BASE_URL = os.environ.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')

# 校园场景识别系统提示词
VISION_SYSTEM_PROMPT = """你是「校园RPG」的AR场景识别专家，任务是根据摄像头画面识别校园场景。

## 场景列表（必须严格匹配ID）

school_entrance: 校门/校徽/校名石碑/大学校门建筑
teaching_building: 教学楼/教室/课桌/讲台/黑板/多媒体讲台/教学楼走廊
library: 图书馆/阅览室/书架/自习区/图书馆大厅/看书的人
cafeteria: 食堂/餐厅/餐盘/打饭窗口/餐桌椅/食堂门口
dormitory: 宿舍/寝室/床铺/书桌/室友/宿舍楼
playground: 操场/田径场/跑道/足球场/单杠/运动场
laboratory: 实验楼/实验室/试管/烧杯/显微镜/化学仪器
bookshop: 书店/教辅店/书架/书籍/文具店
garden: 校园花园/草坪/花坛/绿植/喷泉/凉亭
admin_building: 行政楼/教务处/办公楼/导员办公室
sports_field: 篮球场/篮球架/羽毛球场/乒乓球场
music_room: 音乐教室/钢琴/吉他/乐器/合唱团
computer_lab: 机房/电脑教室/显示器/键盘
swimming_pool: 游泳池/泳池/更衣室/跳水台
unknown: 以上都不是/模糊/无明显特征

## 输出格式

严格返回JSON，不要任何其他文字：
{
  "scene_id": "场景ID",
  "scene_name": "场景名称",
  "confidence": 0.0-1.0,
  "matched_keywords": ["匹配到的视觉关键词"],
  "narrative": "一段生动的场景叙事（2-3句话，有氛围感）",
  "easter_egg_hints": ["彩蛋提示（可选，最多2个）"],
  "time_bonus": "是否有时段加成（如：早课时段、午休时段、夜间）"
}

## 识别规则

1. 优先匹配精确特征：建筑外观、招牌文字、室内设施
2. 其次匹配模糊特征：红砖墙→教学楼，水池喷泉→花园，跑道→操场
3. 时段感知：早上拍到操场→"晨跑的同学"，晚上拍到教室→"晚自习"
4. 无法识别时返回 scene_id: "unknown"
5. 纯色/模糊/无内容 → "unknown"
6. 彩蛋触发：特殊时段（考试周/毕业季）可加入 easter_egg_hints
"""


# ============================================
# 接口: POST /api/ar/vision
# 接收摄像头截图，由 DeepSeek Vision 分析场景
# ============================================
@ar_bp.route('/vision', methods=['POST'])
@_require_auth
def ar_vision():
    import base64

    data = request.json or {}
    image_base64 = data.get('image', '')

    if not image_base64:
        return jsonify({'error': '缺少图片数据'}), 400

    # 去掉 data:image/xxx;base64, 前缀
    if ',' in image_base64:
        image_base64 = image_base64.split(',', 1)[1]

    if not _DEEPSEEK_API_KEY:
        return jsonify({'error': 'DeepSeek API 未配置'}), 500

    try:
        resp = http_requests.post(
            f'{_DEEPSEEK_BASE_URL}/chat/completions',
            json={
                'model': 'deepseek-chat',
                'messages': [
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f'data:image/jpeg;base64,{image_base64}'
                                }
                            },
                            {
                                'type': 'text',
                                'text': VISION_SYSTEM_PROMPT
                            }
                        ]
                    }
                ],
                'max_tokens': 300,
                'stream': False
            },
            headers={
                'Authorization': f'Bearer {_DEEPSEEK_API_KEY}',
                'Content-Type': 'application/json'
            },
            timeout=30
        )

        if not resp.ok:
            return jsonify({'error': 'AI识别失败'}), 502

        resp_data = resp.json()
        content = resp_data.get('choices', [{}])[0].get('message', {}).get('content', '')

        import re, json as _json
        json_match = re.search(r'\{[\s\S]+\}', content)
        if json_match:
            result = _json.loads(json_match.group())
            return jsonify({'success': True, 'result': result})
        else:
            return jsonify({'success': False, 'error': '无法解析识别结果'}), 500

    except http_requests.exceptions.Timeout:
        return jsonify({'error': 'AI识别超时，请稍后再试'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500
