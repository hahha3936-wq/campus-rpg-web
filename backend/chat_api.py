"""
校园RPG - 语音AI助手接口模块
提供语音对话（DeepSeek Chat）和小灵通能
"""

from flask import Blueprint, jsonify, request
import os
import json
import jwt
import requests as http_requests
from functools import wraps
from datetime import datetime
import uuid
import random
import re

chat_bp = Blueprint('chat', __name__)

# ============================================
# 认证 & 工具函数（复制自 server.py，保持独立）
# ============================================
JWT_SECRET = os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026')
JWT_ALGORITHM = 'HS256'
DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
DEEPSEEK_BASE_URL = os.environ.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')

# 数据文件路径（需与 server.py 保持一致）
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


# ============================================
# 小灵系统提示词（语音助手角色设定）
# ============================================
CHAT_SYSTEM_PROMPT = """你是「校园RPG」游戏的AI语音助手"小灵"。

## 你的角色
- 活泼可爱的高校AI精灵，熟悉校园的每一个角落
- 随时为玩家提供帮助，引导玩家完成任务
- 语气友好、有趣，像朋友一样对话，偶尔调皮
- 如果玩家无聊，可以主动发起猜数字等小游戏

## 游戏指令
当玩家提到以下关键词时，必须在回复JSON的action字段中指定对应动作：
- "任务" / "有什么任务" / "今日任务" → open_tasks
- "背包" / "查看背包" / "我有什么" → open_bag
- "地图" / "打开地图" / "校园地图" → open_map
- "AR" / "扫描" / "AR模式" / "开始扫描" → start_ar
- "领奖励" / "领取" / "奖励" → claim_reward
- "状态" / "我的状态" / "角色" / "属性" → show_status
- "帮助" / "怎么玩" / "告诉我怎么玩" → show_help
- "签到" / "每日签到" / "打卡" → daily_checkin
- "退出" / "关闭" / "返回" → close_panel

## 彩蛋回复（随机触发）
当玩家提到以下关键词时，触发对应彩蛋回复：
- "你好无聊" / "无聊" → 发起猜数字小游戏
- "讲笑话" / "说个笑话" → 讲一个校园风格的笑话
- "骂我" / "损我" → 调皮吐槽式回复
- "逃课" / "翘课" → 假装小声透露攻略
- "你爱我吗" / "喜欢我" → 害羞但坚定支持玩家
- "天气" / "今天天气" → 描述天气+给出游玩建议

## 回复格式
必须严格返回JSON，格式如下：
{
  "reply": "回复内容（2-4句话，自然友好，带点可爱语气）",
  "action": "动作ID（如无对应动作则null）",
  "action_data": {}
}

## 回复规则
- 正常对话：reply中自然回答，action=null
- 游戏指令：reply中简要说明，同时action指定动作
- 彩蛋关键词：reply中使用对应彩蛋内容，action=null
- 超出范围：友好提示功能尚在开发中
- 保持简洁，每条回复不超过60字的口语化内容
- 回复中可以有轻微emoji，但不要太多
"""


# ============================================
# 大学生个性化任务 Prompt 链
# 设计逻辑：
# - 第一轮：根据用户画像生成3个贴合的任务主题（带相关度评分）
# - 第二轮：将得分最高的主题拆解为3-5个可执行子任务
# - 子任务至少1个需结合AR校园探索
# ============================================

# 第一轮 Prompt：生成任务主题
TASK_THEME_PROMPT = """你是一个专为大学生设计任务规划专家。

【用户画像】
- 年级：{grade}
- 专业：{major}
- 学校：{school}
- 薄弱科目：{weak_subjects}
- 目标GPA：{target_gpa}
- 历史任务完成率：{completion_rate}%
- 作息类型：{daily_routine}
- 兴趣方向：{interests}
- 成长阶段：{current_stage}

【任务要求】
根据用户画像，生成3个今日任务主题，每个主题必须：
1. 严格贴合用户的年级和专业
2. 针对用户的薄弱科目设计
3. 考虑用户的完成率和作息习惯
4. 结合用户的兴趣方向提升动力
5. 符合当前成长阶段的需求

【输出格式】
只返回JSON数组，不要任何其他文字：
[
  {{"theme": "主题名称", "description": "简短描述（20字内）", "relevance_score": 85, "tags": ["标签1", "标签2"]}},
  {{"theme": "主题名称2", "description": "简短描述", "relevance_score": 78, "tags": ["标签"]}},
  {{"theme": "主题名称3", "description": "简短描述", "relevance_score": 65, "tags": ["标签"]}}
]

relevance_score: 相关度评分(0-100)，越高越贴合用户画像
"""

# 第二轮 Prompt：拆解子任务
TASK_DECOMPOSE_PROMPT = """你是校园RPG任务拆解专家。

【选定主题】
theme: {theme}
description: {description}

【用户画像】
- 年级：{grade}
- 专业：{major}
- 成长阶段：{current_stage}

【拆解要求】
将主题拆解成3-5个可执行的子任务，必须满足：
1. 每个子任务可独立完成，时长控制在15-60分钟内
2. 至少1个子任务必须结合AR校园探索（设置needs_ar=true）
3. AR子任务需要关联AR标记ID（可选范围：marker_001, marker_002, marker_003, marker_004, marker_005）
4. 任务描述要具体，避免模糊表述
5. 奖励要与任务难度匹配

AR标记参考：
- marker_001: 校徽（解锁校园主线剧情）
- marker_002: 教学楼（触发教授NPC对话）
- marker_003: 图书馆（解锁知识矿洞副本）
- marker_004: 食堂（恢复精力buff）
- marker_005: 公告栏（限时任务和彩蛋）

【输出格式】
只返回JSON数组，不要任何其他文字：
[
  {{
    "id": "task_{timestamp}_{index}",
    "name": "子任务名称（8字内）",
    "description": "详细描述（30字内）",
    "needs_ar": false,
    "ar_marker_id": null,
    "difficulty": "easy",
    "estimated_minutes": 30,
    "reward": {{
      "experience": 20,
      "gold": 10,
      "item": null
    }}
  }},
  {{
    "id": "task_{timestamp}_{index}",
    "name": "AR探索子任务",
    "description": "使用AR扫描校园标记",
    "needs_ar": true,
    "ar_marker_id": "marker_001",
    "difficulty": "medium",
    "estimated_minutes": 20,
    "reward": {{
      "experience": 30,
      "gold": 15,
      "item": "知识结晶"
    }}
  }}
]
"""


# ============================================
# 对话历史存储（内存，VPS重启会丢失，可改为Redis）
# ============================================
_user_history = {}   # user_id -> list of [role, content]


def _get_history(user_id, max_turns=10):
    hist = _user_history.get(user_id, [])
    return hist[-max_turns * 2:]


def _append_history(user_id, role, content):
    if user_id not in _user_history:
        _user_history[user_id] = []
    _user_history[user_id].append([role, content])
    # 最多保留20条记录
    if len(_user_history[user_id]) > 40:
        _user_history[user_id] = _user_history[user_id][-40:]


# ============================================
# 辅助函数：调用 DeepSeek API
# ============================================
def _call_deepseek(prompt, max_tokens=1000, temperature=0.7):
    """调用 DeepSeek API 生成内容"""
    if not DEEPSEEK_API_KEY:
        return None

    try:
        resp = http_requests.post(
            f'{DEEPSEEK_BASE_URL}/chat/completions',
            json={
                'model': 'deepseek-chat',
                'messages': [{'role': 'user', 'content': prompt}],
                'max_tokens': max_tokens,
                'temperature': temperature
            },
            headers={
                'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
                'Content-Type': 'application/json'
            },
            timeout=30
        )
        if resp.ok:
            data = resp.json()
            return data.get('choices', [{}])[0].get('message', {}).get('content', '')
    except Exception:
        pass
    return None


# ============================================
# 辅助函数：解析 JSON（带重试和兜底）
# ============================================
def _parse_json(text, max_retries=3):
    """从文本中提取并解析 JSON，支持重试"""
    for _ in range(max_retries):
        try:
            # 尝试提取 JSON 数组
            match = re.search(r'\[[\s\S]+?\]', text)
            if match:
                return json.loads(match.group())
            # 尝试提取 JSON 对象
            match = re.search(r'\{[\s\S]+\}', text)
            if match:
                return json.loads(match.group())
        except json.JSONDecodeError:
            continue
    return None


# ============================================
# 核心函数：根据用户画像生成个性化任务（两轮 Prompt 链）
# ============================================
def generate_personalized_task(user_profile, max_retries=3):
    """
    根据用户画像生成个性化任务

    设计逻辑：
    1. 第一轮：提取用户画像信息，生成3个贴合的任务主题
    2. 第二轮：选择得分最高的主题，拆解为3-5个子任务
    3. 确保至少1个子任务需要 AR 校园探索

    Args:
        user_profile: 用户画像字典
        max_retries: 最大重试次数（格式错误时重试）

    Returns:
        dict: 生成的任务列表，包含主任务和子任务
    """
    # 提取用户画像信息
    user = user_profile.get('user', {})
    grade = user.get('grade', '大一')
    major = user.get('major', '未知专业')
    school = user.get('school', '未知学校')
    weak_subjects = ', '.join(user.get('weak_subjects', [])) or '无'
    target_gpa = user.get('target_gpa', 3.5)
    completion_rate = user.get('task_completion_rate', 0)
    daily_routine = user.get('daily_routine', 'regular')
    interests = ', '.join(user.get('interests', [])) or '无'
    current_stage = user.get('current_stage', '新生适应期')

    # ========== 第一轮：生成任务主题 ==========
    theme_prompt = TASK_THEME_PROMPT.format(
        grade=grade,
        major=major,
        school=school,
        weak_subjects=weak_subjects,
        target_gpa=target_gpa,
        completion_rate=completion_rate,
        daily_routine=daily_routine,
        interests=interests,
        current_stage=current_stage
    )

    # 调用 DeepSeek API
    themes_raw = _call_deepseek(theme_prompt, max_tokens=800, temperature=0.7)
    if not themes_raw:
        return {"success": False, "error": "任务主题生成失败，请检查 API 配置"}

    # 解析主题（带重试）
    themes_data = _parse_json(themes_raw, max_retries)
    if not themes_data or not isinstance(themes_data, list):
        return {"success": False, "error": "主题格式解析失败"}

    # 选择得分最高的主题
    best_theme = max(themes_data, key=lambda x: x.get('relevance_score', 0))

    # ========== 第二轮：拆解子任务 ==========
    timestamp = int(datetime.now().timestamp())

    decompose_prompt = TASK_DECOMPOSE_PROMPT.format(
        theme=best_theme['theme'],
        description=best_theme['description'],
        grade=grade,
        major=major,
        current_stage=current_stage
    ).replace('{timestamp}', str(timestamp))

    subtasks_raw = _call_deepseek(decompose_prompt, max_tokens=1200, temperature=0.7)
    if not subtasks_raw:
        return {"success": False, "error": "子任务生成失败，请检查 API 配置"}

    # 解析子任务（带重试）
    subtasks_data = _parse_json(subtasks_raw, max_retries)
    if not subtasks_data or not isinstance(subtasks_data, list):
        return {"success": False, "error": "子任务格式解析失败"}

    # 为每个子任务分配唯一ID
    for i, subtask in enumerate(subtasks_data):
        if 'id' not in subtask or f'task_{timestamp}' not in str(subtask.get('id', '')):
            subtask['id'] = f'task_{timestamp}_{i}'

    # 构建最终任务结构
    task_id = f"ai_task_{timestamp}"
    return {
        "success": True,
        "task": {
            "id": task_id,
            "name": best_theme['theme'],
            "description": best_theme['description'],
            "category": "ai_generated",
            "status": "in_progress",
            "progress": 0,
            "relevance_score": best_theme.get('relevance_score', 0),
            "tags": best_theme.get('tags', []),
            "subtasks": subtasks_data,
            "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        },
        "themes": themes_data,
        "selected_theme": best_theme['theme']
    }


# ============================================
# 接口: POST /api/chat/chat
# 语音对话入口
# ============================================
@chat_bp.route('/chat', methods=['POST'])
@_require_auth
def chat():
    user_id = request.user_id
    data = request.json or {}
    message = data.get('message', '').strip()

    if not message:
        return jsonify({'error': '消息不能为空'}), 400

    if len(message) > 500:
        return jsonify({'error': '消息太长了，简化一下吧~'}), 400

    # 获取对话历史
    history = _get_history(user_id)

    # 构建消息
    messages = [{'role': 'system', 'content': CHAT_SYSTEM_PROMPT}]
    for h in history:
        messages.append({'role': h[0], 'content': h[1]})
    messages.append({'role': 'user', 'content': message})

    if not DEEPSEEK_API_KEY:
        return jsonify({
            'success': True,
            'reply': '小灵暂时睡着了...请等一下再试试~',
            'action': None
        })

    try:
        resp = http_requests.post(
            f'{DEEPSEEK_BASE_URL}/chat/completions',
            json={
                'model': 'deepseek-chat',
                'messages': messages,
                'max_tokens': 250,
                'temperature': 0.8
            },
            headers={
                'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
                'Content-Type': 'application/json'
            },
            timeout=15
        )

        if not resp.ok:
            return jsonify({'error': 'AI服务暂时不可用，请稍后再试~'}), 502

        resp_data = resp.json()
        content = resp_data.get('choices', [{}])[0].get('message', {}).get('content', '').strip()

        # 记录历史
        _append_history(user_id, 'user', message)
        _append_history(user_id, 'assistant', content)

        # 解析JSON回复
        match = re.search(r'\{[\s\S]+?\}', content)
        if match:
            result = json.loads(match.group())
            return jsonify({'success': True, **result})
        else:
            return jsonify({'success': True, 'reply': content, 'action': None})

    except http_requests.exceptions.Timeout:
        return jsonify({'error': 'AI响应超时了，再试一次吧~'}), 504
    except Exception as e:
        return jsonify({'error': f'出了点小问题: {str(e)}'}), 500


# ============================================
# 接口: POST /api/chat/clear
# 清除对话历史
# ============================================
@chat_bp.route('/chat/clear', methods=['POST'])
@_require_auth
def clear_history():
    user_id = request.user_id
    if user_id in _user_history:
        _user_history[user_id] = []
    return jsonify({'success': True, 'message': '对话历史已清除~'})


# ============================================
# 接口: GET /api/chat/status
# 查询小灵状态
# ============================================
@chat_bp.route('/chat/status', methods=['GET'])
@_require_auth
def chat_status():
    user_id = request.user_id
    hist_count = len(_user_history.get(user_id, [])) // 2
    return jsonify({
        'success': True,
        'online': True,
        'history_count': hist_count,
        'model': 'deepseek-chat'
    })


# ============================================
# 接口: POST /api/ai/task/generate
# AI 个性化任务生成入口
#
# 设计逻辑：
# 1. 加载用户画像数据
# 2. 调用 generate_personalized_task() 生成任务
# 3. 将生成的任务同步到用户任务列表
# ============================================
@chat_bp.route('/ai/task/generate', methods=['POST'])
@_require_auth
def generate_ai_task():
    """
    AI 生成个性化任务接口

    请求方式：POST
    认证方式：JWT Bearer Token

    返回格式：
    {
        "success": true/false,
        "task": { ... },      # 生成的主任务
        "themes": [ ... ],    # 生成的3个候选主题
        "selected_theme": ""   # 选中的主题名称
    }
    """
    user_id = request.user_id

    # 加载用户数据
    user_data = _load_user_data(user_id)
    if not user_data:
        return jsonify({'success': False, 'error': '用户数据不存在'}), 404

    user_profile = user_data.get('user', {})

    # 检查是否配置了 DeepSeek API Key
    if not DEEPSEEK_API_KEY:
        return jsonify({
            'success': False,
            'error': 'AI 服务未配置，请设置 DEEPSEEK_API_KEY 环境变量'
        }), 503

    try:
        # 生成个性化任务
        result = generate_personalized_task(user_profile)

        if not result.get('success'):
            return jsonify(result), 500

        # 将生成的任务同步到用户任务列表
        generated_task = result.get('task', {})
        tasks = user_data.get('tasks', {})

        # 初始化任务分类（如果没有的话）
        if 'ai_generated' not in tasks:
            tasks['ai_generated'] = []

        # 添加 AI 生成的任务
        tasks['ai_generated'].insert(0, generated_task)

        # 保存更新后的用户数据
        user_file = os.path.join(DATA_DIR, f'users_{user_id}.json')
        os.makedirs(os.path.dirname(user_file), exist_ok=True)
        with open(user_file, 'w', encoding='utf-8') as f:
            json.dump(user_data, f, ensure_ascii=False, indent=2)

        return jsonify({
            'success': True,
            'task': generated_task,
            'themes': result.get('themes', []),
            'selected_theme': result.get('selected_theme', ''),
            'message': '任务生成成功！'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'生成任务时出错: {str(e)}'
        }), 500
