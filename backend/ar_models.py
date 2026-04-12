"""
校园RPG - AR数据模型
定义AR相关的本地数据结构，补充server.py现有表结构
@version 1.0.0

设计说明：
- AR相关数据以JSON文件形式存储在 data/ 目录，不修改现有users.db
- 每个用户独立JSON文件，文件名包含user_id后缀以隔离数据
- 文件命名规范：
  ar_marker_states_<user_id>.json  - 标记解锁状态
  ar_achievements_<user_id>.json   - AR成就进度
  ar_behavior_log_<user_id>.json   - 行为日志
  ar_pending_tasks_<user_id>.json  - 待同步的离线任务
"""

# ============================================
# 数据模型结构定义
# ============================================

# AR标记状态（每用户独立文件）
ARMarkerState = {
    # markerId -> {
    #     "lastTriggerTime": float,  # Unix时间戳（秒）
    #     "triggerCount": int,       # 累计触发次数
    #     "unlocked": bool          # 是否已手动解锁
    # }
}

# AR成就进度（每用户独立文件）
ARAchievement = {
    # achievementId -> {
    #     "progress": int,   # 当前进度
    #     "unlocked": bool,  # 是否已解锁
    #     "unlockedAt": str  # 解锁时间 ISO格式
    # }
}

# AR行为日志（每用户独立文件）
ARBehaviorLog = [
    # {
    #     "timestamp": str,       # ISO格式时间
    #     "behavior_type": str,   # found|lost|triggered|reward_claimed|task_synced
    #     "marker_id": str,       # 关联标记ID
    #     "extra": dict           # 附加数据
    # }
]

# AR待同步离线任务（无网络时积压）
AROfflineTask = {
    # "pending": [
    #     {
    #         "task_type": "marker_unlock" | "achievement_update",
    #         "params": dict,
    #         "timestamp": str
    #     }
    # ]
}

# ============================================
# AR标记元数据（所有用户共享）
# ============================================
AR_MARKER_META = {
    'marker_001': {
        'name': '校徽标记',
        'description': '扫描校徽解锁校园主线剧情',
        'contentType': 'story',
        'cooldown': 3600,
        'reward': {'gold': 100, 'experience': 50, 'seed': 'common_knowledge'}
    },
    'marker_002': {
        'name': '教学楼标记',
        'description': '触发教授NPC对话与课程任务',
        'contentType': 'npc',
        'cooldown': 3600,
        'reward': {'experience': 30}
    },
    'marker_003': {
        'name': '图书馆标记',
        'description': '解锁知识矿洞副本与深度学习任务',
        'contentType': 'task',
        'cooldown': 3600,
        'reward': {'experience': 80, 'seed': 'rare_knowledge'}
    },
    'marker_004': {
        'name': '食堂标记',
        'description': '解锁干饭人buff与精力恢复道具',
        'contentType': 'buff',
        'cooldown': 1800,
        'reward': {'energy': 30, 'gold': 15}
    },
    'marker_005': {
        'name': '公告栏标记',
        'description': '解锁限时任务与隐藏彩蛋',
        'contentType': 'treasure',
        'cooldown': 7200,
        'reward': {'gold': 50, 'experience': 40}
    }
}

# ============================================
# AR成就定义
# ============================================
AR_ACHIEVEMENTS = {
    'ar_first': {
        'name': 'AR初体验',
        'description': '首次使用AR功能',
        'category': 'ar',
        'target': 1,
        'icon': '🔍'
    },
    'ar_explorer': {
        'name': 'AR探索家',
        'description': '使用AR探索5个校园标记',
        'category': 'ar',
        'target': 5,
        'icon': '🗺️'
    },
    'ar_master': {
        'name': 'AR大师',
        'description': '完成3个AR任务',
        'category': 'ar',
        'target': 3,
        'icon': '🏆'
    },
    'ar_collector': {
        'name': '知识点收藏家',
        'description': '收集10个知识结晶',
        'category': 'ar',
        'target': 10,
        'icon': '💎'
    }
}
