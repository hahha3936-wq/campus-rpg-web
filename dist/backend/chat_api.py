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

chat_bp = Blueprint('chat', __name__)

# ============================================
# 认证 & 工具函数（复制自 server.py，保持独立）
# ============================================
JWT_SECRET = os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026')
JWT_ALGORITHM = 'HS256'
DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
DEEPSEEK_BASE_URL = os.environ.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')


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
        import re
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
