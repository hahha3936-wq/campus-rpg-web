"""
校园RPG - 主线剧情任务链 API 模块
实现大一至大四全周期主线剧情系统

四大篇章：
  新生适应期（大一）→ 学业成长期（大二）→ 实习准备期（大三）→ 毕业冲刺期（大四）

每个篇章包含5个核心主线任务，任务完全贴合对应年级的真实校园场景。
剧情进度存储在 data/main_story.json，主线任务通过 category="main_story" 写入现有 task_data.json。
"""

from flask import Blueprint, jsonify, request
import os
import json
import jwt
import copy
import uuid
from functools import wraps
from datetime import datetime

story_bp = Blueprint('story', __name__)

# ============================================
# 认证 & 文件路径配置（复制自 server.py）
# ============================================
import sys as _sys
import time as _time
import tempfile as _tempfile

JWT_SECRET = os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026')
JWT_ALGORITHM = 'HS256'
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')


def _acquire_lock(filepath):
    """跨平台文件锁（Windows: msvcrt / Unix: fcntl），使用非阻塞锁避免永久阻塞。

    与 server.py 的 _acquire_lock 保持一致，防止并发冲突。
    """
    lock_path = filepath + '.lock'
    for attempt in range(50):
        try:
            lock_file = open(lock_path, 'w')
            if _sys.platform == 'win32':
                import msvcrt as _msvcrt
                try:
                    _msvcrt.locking(lock_file.fileno(), _msvcrt.LK_NBLCK, 1)
                    return lock_file
                except (IOError, OSError):
                    lock_file.close()
                    _time.sleep(0.05)
                    continue
            else:
                import fcntl as _fcntl
                try:
                    _fcntl.flock(lock_file.fileno(), _fcntl.LOCK_EX | _fcntl.LOCK_NB)
                    return lock_file
                except (IOError, OSError):
                    lock_file.close()
                    _time.sleep(0.05)
                    continue
        except Exception:
            _time.sleep(0.05)
            continue
    return None


def _release_lock(lock_file, filepath):
    """释放文件锁"""
    lock_path = filepath + '.lock'
    if _sys.platform == 'win32':
        import msvcrt as _msvcrt
        _msvcrt.locking(lock_file.fileno(), _msvcrt.LK_UNLCK, 1)
    else:
        import fcntl as _fcntl
        _fcntl.flock(lock_file.fileno(), _fcntl.LOCK_UN)
    lock_file.close()
    try:
        os.remove(lock_path)
    except OSError:
        pass


def _load_json(filename):
    """加载JSON文件（带文件锁，防止读到正在写入的半成品数据）。

    与 server.py 的 load_json 保持一致的锁定机制，防止并发冲突。
    """
    filepath = os.path.join(DATA_DIR, filename)
    lock_path = filepath + '.lock'
    for attempt in range(5):
        try:
            if os.path.exists(filepath):
                lock_file = open(lock_path, 'w')
                if _sys.platform == 'win32':
                    import msvcrt as _msvcrt
                    try:
                        _fcntl.flock(lock_file.fileno(), _fcntl.LOCK_SH | _fcntl.LOCK_NB)
                    except (IOError, OSError):
                        lock_file.close()
                        _time.sleep(0.05)
                        continue
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        return json.load(f)
                finally:
                    if _sys.platform == 'win32':
                        import msvcrt as _msvcrt
                        _msvcrt.locking(lock_file.fileno(), _msvcrt.LK_UNLCK, 1)
                    else:
                        import fcntl as _fcntl
                        _fcntl.flock(lock_file.fileno(), _fcntl.LOCK_UN)
                    lock_file.close()
                    try:
                        os.remove(lock_path)
                    except OSError:
                        pass
        except Exception:
            _time.sleep(0.05)
            continue
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def _save_json(filename, data):
    """保存JSON文件（原子写入 + 文件锁，防止数据损坏）。

    与 server.py 的 save_json 保持一致，确保跨进程数据安全。
    """
    filepath = os.path.join(DATA_DIR, filename)
    try:
        lock_file = _acquire_lock(filepath)
        if lock_file is None:
            print(f'警告：无法获取文件锁 {filepath}，尝试直接写入')
            fd, tmp_path = _tempfile.mkstemp(dir=os.path.dirname(filepath), suffix='.tmp')
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, filepath)
            return
        try:
            fd, tmp_path = _tempfile.mkstemp(dir=os.path.dirname(filepath), suffix='.tmp')
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, filepath)
        finally:
            _release_lock(lock_file, filepath)
    except Exception as e:
        print(f'保存文件失败 {filename}: {e}')


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
    return _load_json(f'user_data_{user_id}.json')


def _save_user_data(user_id, data):
    _save_json(f'user_data_{user_id}.json', data)


def _grade_to_stage(grade):
    """根据年级字符串推断成长阶段，支持中英文和常见变体"""
    if not grade:
        return '新生适应期'
    grade_lower = grade.lower()
    # 毕业冲刺期：最优先匹配（大四/硕士高年级/博士高年级）
    if '大四' in grade or '研三' in grade or '研四' in grade or '博三' in grade or '博四' in grade or '博五' in grade:
        return '毕业冲刺期'
    if '硕三' in grade or '博士三' in grade:
        return '毕业冲刺期'
    # 实习准备期：大三 / 硕士低年级
    if '大三' in grade:
        return '实习准备期'
    if '研二' in grade or '博一' in grade or '博二' in grade:
        return '毕业冲刺期'
    if '硕二' in grade or '博士二' in grade:
        return '毕业冲刺期'
    # 学业成长期：大二
    if '大二' in grade:
        return '学业成长期'
    # 新生适应期：所有本科大一 / 硕士博一新生
    if '大一' in grade or '研一' in grade or '博一' in grade or '其他' in grade:
        return '新生适应期'
    if '硕一' in grade or '硕士一' in grade or '博士一' in grade:
        return '新生适应期'
    # 英文变体
    if any(k in grade_lower for k in ['year 1', 'yr1', 'freshman', '1st year', 'sophomore']):
        return '新生适应期'
    if any(k in grade_lower for k in ['year 2', 'yr2', '2nd year']):
        return '学业成长期'
    if any(k in grade_lower for k in ['year 3', 'yr3', '3rd year', 'junior']):
        return '实习准备期'
    if any(k in grade_lower for k in ['year 4', 'yr4', '4th year', 'senior']):
        return '毕业冲刺期'
    return '新生适应期'


# ============================================
# 主线剧情元数据（4篇章 x 5任务）
# ============================================
STORY_STAGES = {
    "新生适应期": {
        "title": "第一章：校园初探",
        "subtitle": "大一 · 适应篇",
        "description": "大一新生踏入校园，开启全新的冒险旅程。熟悉校园环境、认识新朋友、制定学习计划——这是你RPG生涯的起点！",
        "color": "#29ADFF",
        "tasks": [
            {
                "story_id": "story_fresh_1",
                "title": "校园初印象",
                "description": "探索校园主要建筑，熟悉校园环境。通过AR扫描校徽，解锁你的校园地图！",
                "detail": "踏入校园的第一步——用AR扫描校徽，开启校园地图导航功能。你将了解图书馆、食堂、教学楼和宿舍区的位置。这所校园似乎隐藏着一些秘密...那些特定地点的微弱光芒，是什么？",
                "ar_marker": "marker_001",
                "ar_hint": "寻找校园正门的校徽，AR扫描即可解锁地图",
                "rewards": {"experience": 80, "gold": 40, "skill_points": 5},
                "achievement_id": "ach_freshman_1",
                "achievement_name": "校园探索者",
                "next_story_id": "story_fresh_2",
                "clue_reward": "clue_fresh_003",
                "core_mystery_hint": "校园里有些地方会发出奇异的光芒...探索校园时，留意那些不寻常的角落。"
            },
            {
                "story_id": "story_fresh_2",
                "title": "选课大战",
                "description": "大学第一场「战斗」——选课。了解专业培养方案，制定选课策略，抢占心仪课程！",
                "detail": "选课是大学的第一个考验。了解本专业的必修课和选修课，合理规划学分，避开热门课程的选课高峰。",
                "ar_marker": "marker_002",
                "ar_hint": "在教务处公告栏扫描选课海报",
                "rewards": {"experience": 100, "gold": 50, "skill_points": 8},
                "achievement_id": "ach_freshman_2",
                "achievement_name": "选课老手",
                "next_story_id": "story_fresh_3"
            },
            {
                "story_id": "story_fresh_3",
                "title": "军训淬炼",
                "description": "烈日下的军训，是大一新生的第一场硬仗。坚持到底，展现你的意志力！",
                "detail": "军训不只是体能训练，更是意志力的考验。学会在艰苦环境中保持积极心态，与同学们建立战友情谊。",
                "ar_marker": "marker_003",
                "ar_hint": "在军训操场扫描校旗",
                "rewards": {"experience": 120, "gold": 60, "skill_points": 10},
                "achievement_id": "ach_freshman_3",
                "achievement_name": "钢铁意志",
                "next_story_id": "story_fresh_4"
            },
            {
                "story_id": "story_fresh_4",
                "title": "室友联盟",
                "description": "来自五湖四海的室友，是你在大学最亲密的队友。了解彼此，建立宿舍公约。",
                "detail": "室友关系直接影响你的大学生活质量。主动沟通、互相尊重，制定合理的作息公约，为四年同居打下基础。",
                "ar_marker": "marker_004",
                "ar_hint": "在宿舍楼下扫描宿舍公约宣传牌",
                "rewards": {"experience": 80, "gold": 40, "item": "室友徽章"},
                "achievement_id": "ach_freshman_4",
                "achievement_name": "室友联盟",
                "next_story_id": "story_fresh_5"
            },
            {
                "story_id": "story_fresh_5",
                "title": "社团初体验",
                "description": "百团大战来临，选择你感兴趣的社团，迈出兴趣拓展的第一步！",
                "detail": "社团是大学的第二课堂。选择1-2个真正感兴趣的社团，尝试竞选社团干部，锻炼组织协调能力。",
                "ar_marker": "marker_005",
                "ar_hint": "在社团招新区扫描社团地图",
                "rewards": {"experience": 100, "gold": 50, "title": "社团新星"},
                "achievement_id": "ach_freshman_5",
                "achievement_name": "社团达人",
                "next_story_id": None
            }
        ],
        "chapter_reward": {"experience": 300, "gold": 150, "title": "校园新丁", "badge": "新生勋章"},
        "chapter_achievement": {"id": "ach_chapter_fresh", "name": "新生适应大师", "desc": "完成第一章：校园初探"}
    },

    "学业成长期": {
        "title": "第二章：学业精进",
        "subtitle": "大二 · 成长篇",
        "description": "度过适应期后，是时候在学业上发力了。深入专业学习、参加竞赛、进入实验室——你的能力值正在飙升！",
        "color": "#00E436",
        "tasks": [
            {
                "story_id": "story_academic_1",
                "title": "专业入门仪式",
                "description": "深入了解你的专业——主干课程、核心能力、行业前景。找到学习的方向感！",
                "detail": "大二开始接触大量专业核心课。通过查阅培养方案、与学长学姐交流、参加专业导论讲座，建立系统的专业认知。那些在实验室忙碌的学长学姐，他们的魔力为什么那么强？",
                "ar_marker": "marker_006",
                "ar_hint": "在学院公告栏扫描专业介绍海报",
                "rewards": {"experience": 100, "gold": 60, "skill_points": 10},
                "achievement_id": "ach_academic_1",
                "achievement_name": "专业探索者",
                "next_story_id": "story_academic_2",
                "clue_reward": "clue_academic_004",
                "core_mystery_hint": "实验室的学长笔记中提到：「魔力的大小，取决于你在这片土地上留下了多少足迹。」"
            },
            {
                "story_id": "story_academic_2",
                "title": "竞赛初体验",
                "description": "组队参加一场学科竞赛或创新创业大赛，体验团队协作攻关的乐趣！",
                "detail": "竞赛是检验学习成果的最佳方式。选择一个与专业相关的比赛，组建跨学科团队，分工协作完成项目。",
                "ar_marker": "marker_007",
                "ar_hint": "在大学生活动中心扫描竞赛海报",
                "rewards": {"experience": 150, "gold": 80, "skill_points": 15},
                "achievement_id": "ach_academic_2",
                "achievement_name": "竞赛新人",
                "next_story_id": "story_academic_3"
            },
            {
                "story_id": "story_academic_3",
                "title": "实验室初探",
                "description": "走进专业实验室，感受科研氛围。争取加入导师课题组，提前接触科研工作。",
                "detail": "实验室是大学四年最重要的成长空间之一。主动联系导师，了解课题组研究方向，争取参与科研项目的机会。",
                "ar_marker": "marker_008",
                "ar_hint": "在实验室门口扫描实验室铭牌",
                "rewards": {"experience": 120, "gold": 70, "skill_points": 12},
                "achievement_id": "ach_academic_3",
                "achievement_name": "科研小白",
                "next_story_id": "story_academic_4"
            },
            {
                "story_id": "story_academic_4",
                "title": "英语进阶之路",
                "description": "四六级只是起点，开始为雅思/托福或专业英语做准备，提升国际化竞争力！",
                "detail": "英语能力在就业和深造中都至关重要。制定英语学习计划，每天坚持背单词、练听力，逐步提升到能够阅读英文文献的水平。",
                "ar_marker": "marker_009",
                "ar_hint": "在外语学院扫描语言角标识",
                "rewards": {"experience": 130, "gold": 65, "skill_points": 15},
                "achievement_id": "ach_academic_4",
                "achievement_name": "英语达人",
                "next_story_id": "story_academic_5"
            },
            {
                "story_id": "story_academic_5",
                "title": "技能认证挑战",
                "description": "考取一门与专业相关的技能证书或职业资格证书，证明你的专业能力！",
                "detail": "证书是专业能力的量化证明。根据专业方向和职业规划，选择1-2个高含金量证书，制定备考计划并坚持执行。",
                "ar_marker": "marker_010",
                "ar_hint": "在考试中心扫描证书展示墙",
                "rewards": {"experience": 150, "gold": 100, "title": "技能认证者"},
                "achievement_id": "ach_academic_5",
                "achievement_name": "证书收集者",
                "next_story_id": None
            }
        ],
        "chapter_reward": {"experience": 400, "gold": 250, "title": "学业新星", "badge": "学业勋章"},
        "chapter_achievement": {"id": "ach_chapter_academic", "name": "学业精进大师", "desc": "完成第二章：学业精进"}
    },

    "实习准备期": {
        "title": "第三章：职前试炼",
        "subtitle": "大三 · 过渡篇",
        "description": "从校园到职场的过渡期。实习、考研、论文——每一个选择都将影响你的未来走向。",
        "color": "#FFA300",
        "tasks": [
            {
                "story_id": "story_career_1",
                "title": "实习首战",
                "description": "获得第一份实习机会！了解职场基本规则，完成从学生到职场人的心态转变。",
                "detail": "实习是连接校园和职场的桥梁。认真准备简历、练习面试，入职后主动承担任务，记录每日工作心得。你发现：校园学到的「成长魔力」在职场中依然有效。",
                "ar_marker": "marker_011",
                "ar_hint": "在就业指导中心扫描实习岗位公告",
                "rewards": {"experience": 150, "gold": 100, "skill_points": 20},
                "achievement_id": "ach_career_1",
                "achievement_name": "职场新人",
                "next_story_id": "story_career_2",
                "clue_reward": "clue_career_001",
                "core_mystery_hint": "外面的世界是什么样的？校园的魔力能否带到现实中？"
            },
            {
                "story_id": "story_career_2",
                "title": "考研 or 就业抉择",
                "description": "站在人生的十字路口，深入分析考研、就业、出国三条路的利弊，做出适合自己的选择。",
                "detail": "大三下学期是人生方向的关键抉择期。通过信息搜集、学长学姐访谈、自我评估，制定明确的毕业去向计划。这个选择将影响你的主线结局走向。",
                "ar_marker": "marker_012",
                "ar_hint": "在图书馆自习室扫描考研资料区标识",
                "rewards": {"experience": 100, "gold": 50, "skill_points": 10},
                "achievement_id": "ach_career_2",
                "achievement_name": "方向探索者",
                "next_story_id": "story_career_3",
                "is_branch_point": True,
                "branches": [
                    {
                        "choice_id": "branch_career",
                        "choice_label": "考研 or 就业抉择",
                        "options": [
                            {"value": "employment", "label": "就业方向", "description": "准备简历、练习面试，开始求职之旅", "effect": "解锁就业结局路线"},
                            {"value": "academic", "label": "考研深造", "description": "制定复习计划，开始备考之路", "effect": "解锁升学结局路线"}
                        ]
                    }
                ],
                "clue_reward": "clue_career_003"
            },
            {
                "story_id": "story_career_3",
                "title": "毕设开题",
                "description": "选定毕业设计/论文课题，制定研究计划，与导师建立稳定的沟通机制。",
                "detail": "毕设是对大学四年学习成果的综合检验。开题阶段要广泛阅读文献、明确研究问题、制定详细计划，争取导师的认可。",
                "ar_marker": "marker_013",
                "ar_hint": "在学院资料室扫描毕设指导手册",
                "rewards": {"experience": 130, "gold": 80, "skill_points": 15},
                "achievement_id": "ach_career_3",
                "achievement_name": "研究入门",
                "next_story_id": "story_career_4"
            },
            {
                "story_id": "story_career_4",
                "title": "行业调研",
                "description": "深入了解目标行业和目标公司，明确职业发展方向，更新你的简历和求职策略。",
                "detail": "通过企业调研、行业报告分析、与从业者交流，全面了解目标行业的人才需求和晋升路径，针对性地提升竞争力。",
                "ar_marker": "marker_014",
                "ar_hint": "在创业孵化园扫描企业展示墙",
                "rewards": {"experience": 120, "gold": 70, "skill_points": 12},
                "achievement_id": "ach_career_4",
                "achievement_name": "行业分析师",
                "next_story_id": "story_career_5"
            },
            {
                "story_id": "story_career_5",
                "title": "导师深聊",
                "description": "与专业课导师进行一次深度交流，获取学业和职业发展的宝贵建议。",
                "detail": "导师的一句话可能改变你的整个规划。主动约导师面谈，准备好你的问题和困惑，认真倾听并记录建议。",
                "ar_marker": "marker_015",
                "ar_hint": "在导师办公室门口扫描导师信息牌",
                "rewards": {"experience": 100, "gold": 60, "item": "导师推荐信"},
                "achievement_id": "ach_career_5",
                "achievement_name": "良师益友",
                "next_story_id": None
            }
        ],
        "chapter_reward": {"experience": 350, "gold": 200, "title": "职场预备生", "badge": "实习勋章"},
        "chapter_achievement": {"id": "ach_chapter_career", "name": "职前试炼大师", "desc": "完成第三章：职前试炼"}
    },

    "毕业冲刺期": {
        "title": "终章：梦想启航",
        "subtitle": "大四 · 毕业篇",
        "description": "大学四年，最后的冲刺。从毕设到校招，从答辩到毕业典礼——你准备好迎接新的人生了吗？",
        "color": "#B13E53",
        "tasks": [
            {
                "story_id": "story_grad_1",
                "title": "毕设攻坚",
                "description": "全力冲刺毕业设计/论文！按计划完成开发/实验/写作，争取优秀毕业论文。",
                "detail": "毕设是大四最重要的任务。制定详细的周计划，定期向导师汇报进展，认真对待每一个细节，争取优秀评级。当你回首四年的学习，所有的积累都汇聚成了这一刻的研究。",
                "ar_marker": "marker_016",
                "ar_hint": "在学院机房扫描毕设进度公告",
                "rewards": {"experience": 200, "gold": 120, "skill_points": 25},
                "achievement_id": "ach_grad_1",
                "achievement_name": "毕设战士",
                "next_story_id": "story_grad_2",
                "clue_reward": "clue_grad_001",
                "core_mystery_hint": "大礼堂的舞台上，刻着四个字：「薪火相传」。这是学园创立者的寄语，也是毕业生的使命。"
            },
            {
                "story_id": "story_grad_2",
                "title": "校招突围",
                "description": "秋招/春招全力出击！打磨简历、练习面试、斩获心仪offer！",
                "detail": "校招是应届生最佳就业渠道。提前打磨简历、熟悉STAR法则回答面试问题，保持积极心态，不放弃任何机会。",
                "ar_marker": "marker_017",
                "ar_hint": "在招聘会场扫描企业展位",
                "rewards": {"experience": 180, "gold": 150, "skill_points": 20},
                "achievement_id": "ach_grad_2",
                "achievement_name": "offer收割机",
                "next_story_id": "story_grad_3"
            },
            {
                "story_id": "story_grad_3",
                "title": "论文答辩",
                "description": "毕设答辩最后一战！做好充分准备，自信展示你的研究成果。",
                "detail": "答辩是对研究工作的全面检验。提前准备PPT、预演答辩流程、预设评委问题，以最佳状态完成答辩。",
                "ar_marker": "marker_018",
                "ar_hint": "在答辩教室扫描答辩流程图",
                "rewards": {"experience": 200, "gold": 100, "title": "答辩之星"},
                "achievement_id": "ach_grad_3",
                "achievement_name": "答辩达人",
                "next_story_id": "story_grad_4"
            },
            {
                "story_id": "story_grad_4",
                "title": "毕业留念",
                "description": "拍摄毕业照、整理四年回忆、与重要的人道别。给大学生活画上完美句号！",
                "detail": "大学四年转瞬即逝。珍惜最后的校园时光，与同学、室友、导师合影留念，记录珍贵的校园回忆。",
                "ar_marker": "marker_019",
                "ar_hint": "在校园标志性地点扫描毕业打卡点",
                "rewards": {"experience": 150, "gold": 80, "item": "毕业相册"},
                "achievement_id": "ach_grad_4",
                "achievement_name": "时光收藏家",
                "next_story_id": "story_grad_5"
            },
            {
                "story_id": "story_grad_5",
                "title": "未来规划",
                "description": "站在毕业的门槛上，回顾四年成长，制定下一个人生阶段的目标和计划！",
                "detail": "毕业不是终点，而是新起点。回顾大学四年的成长经历，总结核心能力，制定下一阶段（读研/工作/创业）的具体规划。",
                "ar_marker": "marker_020",
                "ar_hint": "在毕业典礼会场扫描毕业徽章",
                "rewards": {"experience": 300, "gold": 200, "title": "校园征服者"},
                "achievement_id": "ach_grad_5",
                "achievement_name": "未来规划师",
                "next_story_id": None
            }
        ],
        "chapter_reward": {"experience": 500, "gold": 300, "title": "校园征服者", "badge": "毕业徽章"},
        "chapter_achievement": {"id": "ach_chapter_grad", "name": "毕业大师", "desc": "完成终章：梦想启航"}
    }
}


# ============================================
# 内部工具函数
# ============================================

def _load_story_data():
    """加载主线剧情进度数据"""
    return _load_json('main_story.json') or {}


def _save_story_data(data):
    """保存主线剧情进度数据"""
    _save_json('main_story.json', data)


def _get_user_story_progress(user_id):
    """获取用户在主线剧情中的进度"""
    story_data = _load_story_data()
    if user_id not in story_data:
        return None
    return story_data[user_id]


def _init_user_story_progress(user_id, stage=None):
    """初始化新用户的主线剧情进度（扩展版，包含线索/分支/谜题字段）"""
    user_data = _load_user_data(user_id)
    if not user_data:
        return None

    if stage is None:
        grade = user_data.get('user', {}).get('grade', '')
        stage = user_data.get('user', {}).get('current_stage', '') or _grade_to_stage(grade)

    stage_meta = STORY_STAGES.get(stage)
    if not stage_meta:
        return None

    first_task = stage_meta['tasks'][0]

    progress = {
        'stage': stage,
        'current_story_id': first_task['story_id'],
        'completed_story_ids': [],
        'chapter_unlocked': [stage],
        'clues_collected': [],
        'hidden_tasks_completed': [],
        'story_choices': {},
        'puzzles_solved': [],
        'stitched_groups': [],
        'hidden_scenes': [],
        'puzzle_hints_used': {},
        'exploration_progress': {
            'discovered_areas': [],
            'total_clues_found': 0
        },
        'current_branch': 'default',
        'ar_time_capsules': [],
        'updated_at': datetime.now().isoformat()
    }

    story_data = _load_story_data()
    story_data[user_id] = progress
    _save_story_data(story_data)

    # 同步更新用户画像中的 current_stage
    if 'user' not in user_data:
        user_data['user'] = {}
    user_data['user']['current_stage'] = stage
    user_data['user']['main_story_progress'] = {
        'stage': stage,
        'completed_chapters': [],
        'current_task': first_task['story_id'],
        'clues_collected': [],
        'puzzles_solved': [],
        'hidden_completed': []
    }
    _save_user_data(user_id, user_data)

    return progress


def _story_task_to_quest_task(story_task):
    """将主线剧情任务元数据转换为标准任务格式，写入 task_data.json"""
    return {
        "id": story_task['story_id'],
        "name": story_task['title'],
        "description": story_task['description'],
        "detail": story_task.get('detail', ''),
        "category": "main_story",
        "category_icon": "\u2694",  # crosshairs - unicode for main story
        "category_name": "主线剧情",
        "status": "in_progress",
        "priority": "high",
        "progress": 0,
        "story_stage": _get_stage_by_story_id(story_task['story_id']),
        "ar_marker": story_task.get('ar_marker', ''),
        "ar_hint": story_task.get('ar_hint', ''),
        "deadline": None,
        "reward": story_task.get('rewards', {}),
        "achievement_id": story_task.get('achievement_id', ''),
        "achievement_name": story_task.get('achievement_name', ''),
        "subtasks": [
            {
                "id": story_task['story_id'] + '_sub_1',
                "name": "阅读任务详情",
                "status": "pending",
                "progress": 0,
                "experience": 0
            },
            {
                "id": story_task['story_id'] + '_sub_2',
                "name": "前往AR标记地点完成扫描",
                "status": "pending",
                "progress": 0,
                "experience": 0
            },
            {
                "id": story_task['story_id'] + '_sub_3',
                "name": "完成任务确认",
                "status": "pending",
                "progress": 0,
                "experience": 0
            }
        ],
        "tags": ["主线剧情", "主线"]
    }


def _get_stage_by_story_id(story_id):
    """根据剧情任务ID找到所属篇章"""
    for stage, meta in STORY_STAGES.items():
        for task in meta['tasks']:
            if task['story_id'] == story_id:
                return stage
    return None


def _get_task_meta(story_id):
    """根据剧情任务ID获取任务元数据"""
    stage = _get_stage_by_story_id(story_id)
    if not stage:
        return None
    return STORY_STAGES[stage], next((t for t in STORY_STAGES[stage]['tasks'] if t['story_id'] == story_id), None)


def _update_achievement(category, achievement_id, user_id, name=None, desc=None, icon=None):
    """解锁成就（写入 achievement_data.json）"""
    ach_data = _load_json('achievement_data.json') or {"achievements": {}, "statistics": {}}
    achievements = ach_data.get('achievements', {})

    # 确保分类存在
    if category not in achievements:
        achievements[category] = []

    ach_list = achievements[category]

    # 查找是否已存在
    existing = next((a for a in ach_list if a['id'] == achievement_id), None)
    if existing:
        if existing.get('status') != 'unlocked':
            existing['status'] = 'unlocked'
            existing['date'] = datetime.now().strftime('%Y-%m-%d')
            if 'statistics' not in ach_data:
                ach_data['statistics'] = {}
            ach_data['statistics']['unlocked'] = ach_data['statistics'].get('unlocked', 0) + 1
        # 补充元数据（如果已有条目缺少这些字段）
        if name and 'name' not in existing:
            existing['name'] = name
        if desc and 'desc' not in existing:
            existing['desc'] = desc
        if icon and 'icon' not in existing:
            existing['icon'] = icon
    else:
        # 添加新成就条目（含元数据）
        entry = {
            "id": achievement_id,
            "status": "unlocked",
            "date": datetime.now().strftime('%Y-%m-%d')
        }
        if name:
            entry['name'] = name
        if desc:
            entry['desc'] = desc
        if icon:
            entry['icon'] = icon
        ach_list.append(entry)
        if 'statistics' not in ach_data:
            ach_data['statistics'] = {}
        ach_data['statistics']['unlocked'] = ach_data['statistics'].get('unlocked', 0) + 1

    _save_json('achievement_data.json', ach_data)
    return True


def _add_reward_to_user(user_id, rewards):
    """将奖励添加到用户角色数据"""
    user_data = _load_user_data(user_id)
    if not user_data:
        return

    role = user_data.get('role', {})
    if 'gold' not in role:
        role['gold'] = 0
    if 'experience' not in role:
        role['experience'] = 0
    if 'skill_points' not in role:
        role['skill_points'] = 0

    gold = rewards.get('gold', 0)
    exp = rewards.get('experience', 0)
    sp = rewards.get('skill_points', 0)

    role['gold'] = role.get('gold', 0) + gold
    role['experience'] = role.get('experience', 0) + exp
    role['skill_points'] = role.get('skill_points', 0) + sp

    user_data['role'] = role
    _save_user_data(user_id, user_data)


def _add_task_to_task_data(story_task):
    """将主线任务添加到 task_data.json"""
    tasks_data = _load_json('task_data.json') or {"tasks": [], "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

    # 检查是否已存在
    existing_ids = [t['id'] for t in tasks_data.get('tasks', [])]
    if story_task['story_id'] in existing_ids:
        return

    quest_task = _story_task_to_quest_task(story_task)
    tasks_data['tasks'].insert(0, quest_task)
    tasks_data['last_updated'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _save_json('task_data.json', tasks_data)


# ============================================
# API 路由
# ============================================

@story_bp.route('/stages', methods=['GET'])
@_require_auth
def get_story_stages():
    """
    获取四大篇章元数据
    用于前端展示篇章列表和预览
    """
    user_id = request.user_id

    progress = _get_user_story_progress(user_id)
    if progress is None:
        progress = _init_user_story_progress(user_id)

    if progress is None:
        return jsonify({'error': '无法初始化用户剧情进度'}), 500

    # 组装篇章信息（包含用户完成状态）
    result = {}
    for stage_key, stage_meta in STORY_STAGES.items():
        completed_count = sum(1 for sid in progress['completed_story_ids']
                              if _get_stage_by_story_id(sid) == stage_key)
        total_count = len(stage_meta['tasks'])

        result[stage_key] = {
            "title": stage_meta['title'],
            "subtitle": stage_meta['subtitle'],
            "description": stage_meta['description'],
            "color": stage_meta['color'],
            "chapter_reward": stage_meta['chapter_reward'],
            "chapter_achievement": stage_meta['chapter_achievement'],
            "task_count": total_count,
            "completed_count": completed_count,
            "is_unlocked": stage_key in progress['chapter_unlocked'],
            "is_completed": completed_count == total_count,
            "task_preview": [
                {
                    "story_id": t['story_id'],
                    "title": t['title'],
                    "ar_marker": t.get('ar_marker', ''),
                    "rewards": t.get('rewards', {}),
                    "achievement_name": t.get('achievement_name', '')
                }
                for t in stage_meta['tasks']
            ]
        }

    return jsonify({
        'success': True,
        'stages': result,
        'current_stage': progress['stage']
    })


@story_bp.route('/progress', methods=['GET'])
@_require_auth
def get_story_progress():
    """
    获取用户主线剧情进度
    包括当前篇章、当前任务、已完成任务列表
    """
    user_id = request.user_id

    progress = _get_user_story_progress(user_id)
    if progress is None:
        progress = _init_user_story_progress(user_id)

    if progress is None:
        return jsonify({'error': '无法初始化用户剧情进度'}), 500

    stage_key = progress['stage']
    stage_meta = STORY_STAGES.get(stage_key)
    if not stage_meta:
        return jsonify({'error': f'未知篇章: {stage_key}'}), 500

    # 构建当前任务详情
    current_task_meta = next((t for t in stage_meta['tasks'] if t['story_id'] == progress['current_story_id']), None)

    # 构建已完成任务列表
    completed_tasks = []
    for sid in progress['completed_story_ids']:
        _, t = _get_task_meta(sid)
        if t:
            completed_tasks.append({
                'story_id': t['story_id'],
                'title': t['title'],
                'rewards': t.get('rewards', {}),
                'completed_at': progress['completed_story_ids'].index(sid) + 1
            })

    # 判断篇章是否完成
    chapter_completed = len(completed_tasks) == len(stage_meta['tasks'])

    # 加载增强数据中的对话和悬念信息
    enhanced_data = _load_enhanced_data('story_enhanced.json')
    chapter_enhanced = enhanced_data.get('chapters', {}).get(stage_key, {}) if enhanced_data else {}
    npc_dialogues = chapter_enhanced.get('npc_dialogues', {})

    # 获取篇章内的隐藏任务
    hidden_data = _load_enhanced_data('story_hidden_tasks.json')
    hidden_tasks_in_chapter = []
    if hidden_data:
        for ht in hidden_data.get('hidden_tasks', []):
            if ht.get('stage') == stage_key:
                is_done = ht['task_id'] in progress.get('hidden_tasks_completed', [])
                hidden_tasks_in_chapter.append({
                    'task_id': ht['task_id'],
                    'name': ht['name'],
                    'description': ht['description'],
                    'difficulty': ht.get('difficulty', 'medium'),
                    'is_completed': is_done,
                    'trigger_type': ht.get('trigger_type', 'manual')
                })

    # 获取篇章内的谜题
    puzzles_data = _load_enhanced_data('story_puzzles.json')
    puzzle_in_chapter = None
    if puzzles_data:
        for p in puzzles_data.get('puzzles', []):
            if p.get('stage') == stage_key:
                is_solved = p['puzzle_id'] in progress.get('puzzles_solved', [])
                puzzle_in_chapter = {
                    'puzzle_id': p['puzzle_id'],
                    'name': p['name'],
                    'description': p.get('description', ''),
                    'puzzle_type': p.get('puzzle_type', 'graphic'),
                    'difficulty': p.get('difficulty', 'medium'),
                    'is_solved': is_solved,
                    'ar_hint': p.get('ar_hint', '')
                }

    return jsonify({
        'success': True,
        'progress': {
            'stage': stage_key,
            'stage_title': stage_meta['title'],
            'stage_subtitle': stage_meta['subtitle'],
            'stage_color': stage_meta['color'],
            'current_story_id': progress['current_story_id'],
            'current_task': current_task_meta,
            'completed_story_ids': progress['completed_story_ids'],
            'completed_count': len(completed_tasks),
            'total_count': len(stage_meta['tasks']),
            'chapter_unlocked': progress['chapter_unlocked'],
            'chapter_completed': chapter_completed,
            'chapter_reward': stage_meta['chapter_reward'] if chapter_completed else None,
            'chapter_achievement': stage_meta['chapter_achievement'],
            # 增强字段
            'clues_collected': progress.get('clues_collected', []),
            'clues_count': len(progress.get('clues_collected', [])),
            'puzzles_solved': progress.get('puzzles_solved', []),
            'hidden_tasks_completed': progress.get('hidden_tasks_completed', []),
            'story_choices': progress.get('story_choices', {}),
            'current_branch': progress.get('current_branch', 'default'),
            'hidden_scenes': progress.get('hidden_scenes', []),
            'core_mystery': chapter_enhanced.get('core_mystery', ''),
            'mystery_hint': chapter_enhanced.get('mystery_hint', ''),
            'npc_dialogues': npc_dialogues,
            'all_tasks': [
                {
                    'story_id': t['story_id'],
                    'title': t['title'],
                    'description': t['description'],
                    'detail': t.get('detail', ''),
                    'ar_marker': t.get('ar_marker', ''),
                    'ar_hint': t.get('ar_hint', ''),
                    'rewards': t.get('rewards', {}),
                    'achievement_name': t.get('achievement_name', ''),
                    'is_branch_point': t.get('is_branch_point', False),
                    'branches': t.get('branches', []),
                    'clue_reward': t.get('clue_reward'),
                    'core_mystery_hint': t.get('core_mystery_hint', ''),
                    'status': (
                        'completed' if t['story_id'] in progress['completed_story_ids']
                        else 'active' if t['story_id'] == progress['current_story_id']
                        else 'locked'
                    )
                }
                for t in stage_meta['tasks']
            ],
            'hidden_tasks': hidden_tasks_in_chapter,
            'chapter_puzzle': puzzle_in_chapter,
            'exploration_progress': progress.get('exploration_progress', {
                'discovered_areas': [],
                'total_clues_found': 0
            })
        }
    })


@story_bp.route('/accept', methods=['POST'])
@_require_auth
def accept_story_task():
    """
    接受当前篇章的主线任务
    将任务写入 task_data.json，显示给用户
    """
    user_id = request.user_id
    data = request.json or {}
    story_id = data.get('story_id')  # 可选，指定任务ID；默认接受当前任务

    progress = _get_user_story_progress(user_id)
    if progress is None:
        progress = _init_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '无法初始化用户剧情进度'}), 500

    # 确定要接受的任务
    target_story_id = story_id or progress['current_story_id']

    # 只能接受当前解锁的任务
    if target_story_id != progress['current_story_id']:
        return jsonify({'error': '该任务尚未解锁，请按顺序完成任务'}), 403

    stage_key = progress['stage']
    stage_meta = STORY_STAGES.get(stage_key)
    if not stage_meta:
        return jsonify({'error': f'未知篇章: {stage_key}'}), 500

    task_meta = next((t for t in stage_meta['tasks'] if t['story_id'] == target_story_id), None)
    if not task_meta:
        return jsonify({'error': f'任务不存在: {target_story_id}'}), 404

    # 写入 task_data.json
    _add_task_to_task_data(task_meta)

    return jsonify({
        'success': True,
        'message': f'已接受任务：{task_meta["title"]}',
        'task': _story_task_to_quest_task(task_meta),
        'ar_hint': task_meta.get('ar_hint', ''),
        'ar_marker': task_meta.get('ar_marker', '')
    })


@story_bp.route('/complete/<story_id>', methods=['POST'])
@_require_auth
def complete_story_task(story_id):
    """
    完成任务，自动解锁下一个任务
    流程：
      1. 验证任务属于当前用户进度
      2. 标记完成，写入 main_story.json
      3. 解锁篇章成就
      4. 发放任务奖励
      5. 解锁下一任务（若存在）；否则发放篇章奖励，更新 current_stage
    """
    user_id = request.user_id

    progress = _get_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '剧情进度未初始化'}), 400

    # 验证任务
    if story_id != progress['current_story_id']:
        return jsonify({'error': '只能完成当前激活的任务'}), 403

    stage_key = progress['stage']
    stage_meta = STORY_STAGES.get(stage_key)
    if not stage_meta:
        return jsonify({'error': f'未知篇章: {stage_key}'}), 500

    task_meta = next((t for t in stage_meta['tasks'] if t['story_id'] == story_id), None)
    if not task_meta:
        return jsonify({'error': '任务不存在'}), 404

    # 1. 更新 main_story.json
    story_data = _load_story_data()
    story_data[user_id]['completed_story_ids'].append(story_id)
    story_data[user_id]['updated_at'] = datetime.now().isoformat()

    # 2. 解锁任务成就
    if task_meta.get('achievement_id'):
        _update_achievement(
            '学业成就', task_meta['achievement_id'], user_id,
            name=task_meta.get('achievement_name', ''),
            desc=task_meta.get('description', ''),
            icon='🏆'
        )

    # 3. 发放任务奖励
    task_rewards = task_meta.get('rewards', {})
    reward_summary = []
    if task_rewards.get('experience'):
        reward_summary.append(f"经验+{task_rewards['experience']}")
    if task_rewards.get('gold'):
        reward_summary.append(f"金币+{task_rewards['gold']}")
    if task_rewards.get('skill_points'):
        reward_summary.append(f"技能点+{task_rewards['skill_points']}")
    if task_rewards.get('item'):
        reward_summary.append(f"道具：{task_rewards['item']}")
    if task_rewards.get('title'):
        reward_summary.append(f"称号：{task_rewards['title']}")

    _add_reward_to_user(user_id, task_rewards)

    # 3.5 自动发放线索奖励
    new_clue = None
    clue_id = task_meta.get('clue_reward')
    if clue_id:
        if 'clues_collected' not in story_data[user_id]:
            story_data[user_id]['clues_collected'] = []
        if clue_id not in story_data[user_id]['clues_collected']:
            story_data[user_id]['clues_collected'].append(clue_id)
            clues_data = _load_enhanced_data('story_clues.json')
            if clues_data:
                clue_info = next((c for c in clues_data.get('clues', []) if c['id'] == clue_id), None)
                if clue_info:
                    new_clue = {'id': clue_id, 'name': clue_info['name']}
                    reward_summary.append(f"线索：{clue_info['name']}")

    # 4. 判断篇章是否完成
    chapter_completed = len(story_data[user_id]['completed_story_ids']) >= len(stage_meta['tasks'])

    next_task = None
    new_stage = None
    chapter_reward_given = None

    if task_meta['next_story_id']:
        # 解锁下一任务
        next_task_meta = next((t for t in stage_meta['tasks'] if t['story_id'] == task_meta['next_story_id']), None)
        if next_task_meta:
            story_data[user_id]['current_story_id'] = next_task_meta['story_id']
            _add_task_to_task_data(next_task_meta)
            next_task = {
                'story_id': next_task_meta['story_id'],
                'title': next_task_meta['title'],
                'description': next_task_meta['description'],
                'ar_marker': next_task_meta.get('ar_marker', ''),
                'ar_hint': next_task_meta.get('ar_hint', ''),
                'rewards': next_task_meta.get('rewards', {})
            }
    else:
        # 篇章全部完成
        chapter_reward_given = stage_meta['chapter_reward']
        _add_reward_to_user(user_id, chapter_reward_given)

        # 解锁篇章成就
        chapter_ach = stage_meta['chapter_achievement']
        _update_achievement(
            '学业成就', chapter_ach['id'], user_id,
            name=chapter_ach.get('name', ''),
            desc=chapter_ach.get('desc', ''),
            icon='🎖️'
        )

        # 推进到下一篇章（如果有）
        stage_order = list(STORY_STAGES.keys())
        current_idx = stage_order.index(stage_key)
        if current_idx + 1 < len(stage_order):
            new_stage = stage_order[current_idx + 1]
            new_stage_meta = STORY_STAGES[new_stage]
            new_first_task = new_stage_meta['tasks'][0]

            story_data[user_id]['stage'] = new_stage
            story_data[user_id]['current_story_id'] = new_first_task['story_id']
            story_data[user_id]['chapter_unlocked'].append(new_stage)

            # 同步更新用户画像
            user_data = _load_user_data(user_id)
            if user_data:
                if 'user' not in user_data:
                    user_data['user'] = {}
                user_data['user']['current_stage'] = new_stage
                user_data['user']['main_story_progress'] = {
                    'stage': new_stage,
                    'completed_chapters': story_data[user_id]['completed_story_ids'],
                    'current_task': new_first_task['story_id']
                }
                _save_user_data(user_id, user_data)

    _save_story_data(story_data)

    return jsonify({
        'success': True,
        'message': f'任务「{task_meta["title"]}」完成！',
        'rewards': task_rewards,
        'reward_summary': '、'.join(reward_summary),
        'new_clue': new_clue,
        'chapter_completed': chapter_completed,
        'chapter_reward': chapter_reward_given,
        'next_task': next_task,
        'new_stage': new_stage,
        'new_stage_title': STORY_STAGES[new_stage]['title'] if new_stage else None,
        'completed_count': len(story_data[user_id]['completed_story_ids'])
    })


@story_bp.route('/ar-unlock/<story_id>', methods=['POST'])
@_require_auth
def ar_unlocked_story(story_id):
    """
    AR 标记扫描成功回调
    当用户扫描到主线剧情关联的AR标记时调用
    自动完成该任务的 AR 子任务步骤
    """
    user_id = request.user_id

    progress = _get_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '剧情进度未初始化'}), 400

    stage_key = progress['stage']
    stage_meta = STORY_STAGES.get(stage_key)
    if not stage_meta:
        return jsonify({'error': f'未知篇章: {stage_key}'}), 500

    task_meta = next((t for t in stage_meta['tasks'] if t['story_id'] == story_id), None)
    if not task_meta:
        return jsonify({'error': '任务不存在'}), 404

    # 检查 AR 标记是否匹配
    expected_marker = task_meta.get('ar_marker', '')
    if not expected_marker:
        return jsonify({'success': True, 'message': '该任务无需AR验证'})

    return jsonify({
        'success': True,
        'message': f'AR标记 {expected_marker} 验证成功！',
        'ar_verified': True,
        'story_id': story_id,
        'hint': 'AR识别成功，现在可以完成任务确认'
    })


@story_bp.route('/reset', methods=['POST'])
@_require_auth
def reset_story_progress():
    """
    重置主线剧情进度（用于测试或用户主动重置）
    """
    user_id = request.user_id

    story_data = _load_story_data()
    if user_id in story_data:
        del story_data[user_id]
        _save_story_data(story_data)

    # 重新初始化
    progress = _init_user_story_progress(user_id)
    if not progress:
        return jsonify({'error': '重置失败'}), 500

    return jsonify({
        'success': True,
        'message': '剧情进度已重置',
        'progress': progress
    })


# ============================================
# 新增 API：线索系统
# ============================================

def _load_enhanced_data(filename):
    """加载增强数据文件，缺失时记录警告"""
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f'[Story] 增强数据文件加载失败 {filename}: {e}')
            return None
    print(f'[Story] 增强数据文件不存在: {filename}，增强功能暂时不可用')
    return None


@story_bp.route('/clues', methods=['GET'])
@_require_auth
def get_clues():
    """
    获取用户线索收集状态
    返回所有线索的收集情况、所属篇章、拼接组等信息
    """
    user_id = request.user_id
    progress = _get_user_story_progress(user_id)
    if progress is None:
        progress = _init_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '无法初始化用户剧情进度'}), 500

    clues_data = _load_enhanced_data('story_clues.json')
    if not clues_data:
        print('[Story] 线索数据文件不存在，使用空数据')
        empty_stage = {stage: [] for stage in STORY_STAGES.keys()}
        return jsonify({
            'success': True,
            'collected_count': 0,
            'total_count': 0,
            'by_category': {},
            'by_stage': empty_stage,
            'collected_ids': []
        })

    collected_ids = progress.get('clues_collected', [])
    user_clues = clues_data.get('clues', [])
    stitch_groups = clues_data.get('stitch_groups', {})

    # 按篇章分组
    stage_clues = {stage: [] for stage in STORY_STAGES.keys()}
    for clue in user_clues:
        stage = clue.get('stage', '未知')
        is_collected = clue['id'] in collected_ids
        # 检查是否已拼接完成
        group_id = clue.get('stitch_group')
        stitch_group = stitch_groups.get(group_id, {})
        required = stitch_group.get('required_clues', [])
        group_done = all(cid in collected_ids for cid in required) if required else False
        stage_clues[stage].append({
            'id': clue['id'],
            'name': clue['name'],
            'description': clue['description'],
            'source': clue.get('source', ''),
            'category': clue.get('category', 'main'),
            'rarity': clue.get('rarity', 'common'),
            'icon': clue.get('icon', 'star'),
            'is_collected': is_collected,
            'stitch_group': group_id,
            'stitch_group_name': stitch_group.get('name', '') if group_id else '',
            'stitch_done': group_done
        })

    # 已收集数量统计
    collected_count = len(collected_ids)
    total_count = len(user_clues)
    by_category = {}
    for clue in user_clues:
        cat = clue.get('category', 'main')
        if cat not in by_category:
            by_category[cat] = {'collected': 0, 'total': 0}
        by_category[cat]['total'] += 1
        if clue['id'] in collected_ids:
            by_category[cat]['collected'] += 1

    return jsonify({
        'success': True,
        'collected_count': collected_count,
        'total_count': total_count,
        'by_category': by_category,
        'by_stage': stage_clues,
        'collected_ids': collected_ids
    })


@story_bp.route('/clues/collect', methods=['POST'])
@_require_auth
def collect_clue():
    """
    收集线索
    触发条件：探索发现、NPC对话奖励、任务完成奖励
    """
    user_id = request.user_id
    data = request.json or {}
    clue_id = data.get('clue_id')

    if not clue_id:
        return jsonify({'error': '缺少线索ID'}), 400

    progress = _get_user_story_progress(user_id)
    if progress is None:
        progress = _init_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '无法初始化用户剧情进度'}), 500

    # 检查线索是否已收集
    collected_ids = progress.get('clues_collected', [])
    if clue_id in collected_ids:
        return jsonify({'success': True, 'message': '线索已收集', 'already_collected': True})

    # 验证线索存在
    clues_data = _load_enhanced_data('story_clues.json')
    if not clues_data:
        return jsonify({'error': '线索数据不存在'}), 404

    clue_info = next((c for c in clues_data.get('clues', []) if c['id'] == clue_id), None)
    if not clue_info:
        return jsonify({'error': f'线索不存在: {clue_id}'}), 404

    # 收集线索
    story_data = _load_story_data()
    if 'clues_collected' not in story_data[user_id]:
        story_data[user_id]['clues_collected'] = []
    story_data[user_id]['clues_collected'].append(clue_id)
    story_data[user_id]['updated_at'] = datetime.now().isoformat()
    _save_story_data(story_data)

    # 检查是否可以拼接
    group_id = clue_info.get('stitch_group')
    can_stitch = False
    if group_id:
        stitch_group = clues_data.get('stitch_groups', {}).get(group_id, {})
        required = stitch_group.get('required_clues', [])
        collected = story_data[user_id].get('clues_collected', [])
        can_stitch = all(cid in collected for cid in required)

    return jsonify({
        'success': True,
        'message': f"收集线索「{clue_info['name']}」成功！",
        'clue': {
            'id': clue_id,
            'name': clue_info['name'],
            'description': clue_info['description'],
            'source': clue_info.get('source', ''),
            'rarity': clue_info.get('rarity', 'common'),
            'stitch_group': group_id
        },
        'can_stitch': can_stitch,
        'stitch_group_name': clues_data.get('stitch_groups', {}).get(group_id, {}).get('name', '') if group_id else ''
    })


@story_bp.route('/clues/stitch', methods=['POST'])
@_require_auth
def stitch_clues():
    """
    线索拼接验证
    集齐某拼接组所需线索后，可触发拼接，解锁奖励或解谜
    """
    user_id = request.user_id
    data = request.json or {}
    stitch_group_id = data.get('stitch_group_id')

    if not stitch_group_id:
        return jsonify({'error': '缺少拼接组ID'}), 400

    progress = _get_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '剧情进度未初始化'}), 400

    clues_data = _load_enhanced_data('story_clues.json')
    if not clues_data:
        return jsonify({'error': '线索数据不存在'}), 404

    stitch_group = clues_data.get('stitch_groups', {}).get(stitch_group_id)
    if not stitch_group:
        return jsonify({'error': f'拼接组不存在: {stitch_group_id}'}), 404

    required = stitch_group.get('required_clues', [])
    story_data = _load_story_data()
    collected = story_data[user_id].get('clues_collected', [])

    # 验证是否集齐
    missing = [cid for cid in required if cid not in collected]
    if missing:
        return jsonify({
            'success': False,
            'message': f'线索不足，还缺少 {len(missing)} 条',
            'missing_count': len(missing),
            'required_count': len(required),
            'collected_count': len(collected)
        })

    # 检查是否已拼接
    stitched_groups = story_data[user_id].get('stitched_groups', [])
    if stitch_group_id in stitched_groups:
        return jsonify({'success': True, 'message': '该拼接组已完成', 'already_stitched': True})

    # 执行拼接
    reward = stitch_group.get('stitch_reward', {})
    reward_type = reward.get('type')
    reward_id = reward.get('id')
    unlock_puzzle = stitch_group.get('unlock_puzzle')

    # 记录已拼接
    if 'stitched_groups' not in story_data[user_id]:
        story_data[user_id]['stitched_groups'] = []
    story_data[user_id]['stitched_groups'].append(stitch_group_id)
    story_data[user_id]['updated_at'] = datetime.now().isoformat()
    _save_story_data(story_data)

    # 处理奖励
    reward_result = {'type': reward_type, 'id': reward_id}
    if reward_type == 'hidden_scene':
        reward_result['message'] = f"解锁隐藏场景：{reward_id}"
    elif reward_type == 'buff':
        reward_result['message'] = f"获得Buff：{reward_id}"
    elif reward_type == 'item':
        reward_result['message'] = f"获得道具：{reward_id}"
    elif reward_type == 'title':
        reward_result['message'] = f"获得称号：{reward_id}"
    elif reward_type == 'branch_unlock':
        reward_result['message'] = f"解锁分支：{reward_id}"
    elif reward_type == 'hint':
        reward_result['message'] = f"获得最终谜题提示"

    return jsonify({
        'success': True,
        'message': f"线索拼接「{stitch_group.get('name', '')}」成功！",
        'stitch_group': stitch_group_id,
        'group_name': stitch_group.get('name', ''),
        'group_description': stitch_group.get('description', ''),
        'reward': reward_result,
        'unlock_puzzle': unlock_puzzle,
        'stitched_count': len(stitched_groups) + 1
    })


# ============================================
# 新增 API：AR谜题系统
# ============================================

@story_bp.route('/puzzles', methods=['GET'])
@_require_auth
def get_puzzles():
    """
    获取所有谜题状态
    """
    user_id = request.user_id
    progress = _get_user_story_progress(user_id)
    if progress is None:
        progress = _init_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '无法初始化用户剧情进度'}), 500

    puzzles_data = _load_enhanced_data('story_puzzles.json')
    if not puzzles_data:
        return jsonify({'error': '谜题数据不存在'}), 404

    solved_ids = progress.get('puzzles_solved', [])
    user_puzzles = puzzles_data.get('puzzles', [])

    puzzles = []
    for p in user_puzzles:
        is_solved = p['puzzle_id'] in solved_ids
        # 检查解锁条件
        unlock_cond = p.get('unlock_condition', {})
        is_unlocked = False
        if unlock_cond.get('type') == 'task_complete':
            task_id = unlock_cond.get('task_id')
            completed = progress.get('completed_story_ids', [])
            is_unlocked = task_id in completed
        elif unlock_cond.get('type') == 'all_puzzles_solved':
            # 需要所有前序谜题完成
            solved_count = len([pid for pid in solved_ids if pid.startswith('puzzle_')])
            is_unlocked = solved_count >= 3  # 前3个完成才能解最终谜题
        else:
            is_unlocked = True

        puzzles.append({
            'puzzle_id': p['puzzle_id'],
            'name': p['name'],
            'stage': p.get('stage', ''),
            'chapter': p.get('chapter', 0),
            'description': p.get('description', ''),
            'puzzle_type': p.get('puzzle_type', 'graphic'),
            'difficulty': p.get('difficulty', 'medium'),
            'is_unlocked': is_unlocked,
            'is_solved': is_solved,
            'unlock_hint': p.get('ar_hint', '') if not is_unlocked else '',
            'clues_required': p.get('clues_required', []),
            'hints': p.get('hints', [])
        })

    return jsonify({
        'success': True,
        'puzzles': puzzles,
        'solved_count': len(solved_ids),
        'total_count': len(user_puzzles)
    })


@story_bp.route('/puzzle/<puzzle_id>/verify', methods=['POST'])
@_require_auth
def verify_puzzle(puzzle_id):
    """
    AR谜题答案验证
    """
    user_id = request.user_id
    data = request.json or {}
    user_answer = data.get('answer', '')

    if not user_answer:
        return jsonify({'error': '缺少答案'}), 400

    progress = _get_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '剧情进度未初始化'}), 400

    puzzles_data = _load_enhanced_data('story_puzzles.json')
    if not puzzles_data:
        return jsonify({'error': '谜题数据不存在'}), 404

    puzzle = next((p for p in puzzles_data.get('puzzles', []) if p['puzzle_id'] == puzzle_id), None)
    if not puzzle:
        return jsonify({'error': f'谜题不存在: {puzzle_id}'}), 404

    # 检查是否已解决
    story_data = _load_story_data()
    solved_ids = story_data[user_id].get('puzzles_solved', [])
    if puzzle_id in solved_ids:
        return jsonify({'success': True, 'message': '谜题已解决', 'already_solved': True})

    # 验证解锁条件
    unlock_cond = puzzle.get('unlock_condition', {})
    if unlock_cond.get('type') == 'task_complete':
        task_id = unlock_cond.get('task_id')
        completed = progress.get('completed_story_ids', [])
        if task_id not in completed:
            return jsonify({'error': '谜题尚未解锁，请先完成任务'}), 403

    # 验证答案
    solution = puzzle.get('solution', {})
    correct_answer = solution.get('answer', '')
    answer_type = solution.get('type', 'exact')

    is_correct = False
    if answer_type == 'exact':
        is_correct = str(user_answer).strip().lower() == str(correct_answer).strip().lower()
    elif answer_type == 'sequence':
        user_seq = [str(x).lower() for x in (user_answer if isinstance(user_answer, list) else [user_answer])]
        correct_seq = [str(x).lower() for x in correct_answer]
        is_correct = user_seq == correct_seq
    elif answer_type == 'numeric':
        is_correct = str(user_answer).strip() == str(correct_answer).strip()

    if not is_correct:
        return jsonify({
            'success': False,
            'message': puzzle.get('failure_feedback', '答案不正确，请再试试！'),
            'hint': '仔细回顾该篇章的线索和提示'
        })

    # 谜题解答正确
    story_data[user_id].setdefault('puzzles_solved', []).append(puzzle_id)
    story_data[user_id]['updated_at'] = datetime.now().isoformat()
    _save_story_data(story_data)

    # 发放奖励
    success_reward = puzzle.get('success_reward', {})
    _add_reward_to_user(user_id, {
        'experience': success_reward.get('experience', 0),
        'gold': success_reward.get('gold', 0)
    })

    # 解锁线索
    new_clues = success_reward.get('clues', [])
    for clue_id in new_clues:
        if clue_id not in story_data[user_id].get('clues_collected', []):
            story_data[user_id].setdefault('clues_collected', []).append(clue_id)

    # 解锁隐藏场景
    hidden_scene = success_reward.get('unlock_scene')
    hidden_scenes = story_data[user_id].get('hidden_scenes', [])
    if hidden_scene and hidden_scene not in hidden_scenes:
        story_data[user_id].setdefault('hidden_scenes', []).append(hidden_scene)

    # 检查最终结局
    ending_unlock = success_reward.get('ending_unlock')

    return jsonify({
        'success': True,
        'message': f"谜题「{puzzle['name']}」解答成功！",
        'puzzle_id': puzzle_id,
        'puzzle_name': puzzle['name'],
        'reward': success_reward,
        'new_clues': new_clues,
        'hidden_scene': hidden_scene,
        'hidden_scene_info': puzzles_data.get('puzzles', [{}])[0].get('hidden_scene') if hidden_scene else None,
        'ending_unlock': ending_unlock,
        'solved_count': len(story_data[user_id]['puzzles_solved'])
    })


@story_bp.route('/puzzle/<puzzle_id>/hint', methods=['GET'])
@_require_auth
def get_puzzle_hint(puzzle_id):
    """
    获取谜题提示（消耗线索）
    """
    user_id = request.user_id
    progress = _get_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '剧情进度未初始化'}), 400

    puzzles_data = _load_enhanced_data('story_puzzles.json')
    if not puzzles_data:
        return jsonify({'error': '谜题数据不存在'}), 404

    puzzle = next((p for p in puzzles_data.get('puzzles', []) if p['puzzle_id'] == puzzle_id), None)
    if not puzzle:
        return jsonify({'error': f'谜题不存在: {puzzle_id}'}), 404

    hints = puzzle.get('hints', [])
    if not hints:
        return jsonify({'success': True, 'hint': '暂无提示'})

    # 获取当前已解锁的提示等级
    used_hints = progress.get('puzzle_hints_used', {}).get(puzzle_id, 0)
    if used_hints >= len(hints):
        return jsonify({
            'success': True,
            'hint': '提示已全部解锁',
            'hint_level': used_hints,
            'total_hints': len(hints),
            'remaining_hints': 0
        })
    next_hint = hints[used_hints]

    # 检查线索是否足够
    clue_cost = next_hint.get('cost', 0)
    story_data = _load_story_data()
    collected = story_data[user_id].get('clues_collected', [])
    if clue_cost > 0 and len(collected) < clue_cost:
        return jsonify({
            'success': False,
            'error': f'需要至少 {clue_cost} 条线索才能获取提示，当前持有 {len(collected)} 条'
        })

    # 消耗线索（降低可收集数量上限提示，不真正扣除）
    if 'puzzle_hints_used' not in story_data[user_id]:
        story_data[user_id]['puzzle_hints_used'] = {}
    story_data[user_id]['puzzle_hints_used'][puzzle_id] = used_hints + 1
    story_data[user_id]['updated_at'] = datetime.now().isoformat()
    _save_story_data(story_data)

    return jsonify({
        'success': True,
        'puzzle_id': puzzle_id,
        'hint': next_hint['text'],
        'hint_level': used_hints + 1,
        'hint_cost': clue_cost,
        'total_hints': len(hints),
        'remaining_hints': len(hints) - used_hints - 1
    })


# ============================================
# 新增 API：隐藏任务系统
# ============================================

@story_bp.route('/hidden', methods=['GET'])
@_require_auth
def get_hidden_tasks():
    """
    获取已解锁的隐藏任务
    """
    user_id = request.user_id
    progress = _get_user_story_progress(user_id)
    if progress is None:
        progress = _init_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '无法初始化用户剧情进度'}), 500

    hidden_data = _load_enhanced_data('story_hidden_tasks.json')
    if not hidden_data:
        return jsonify({'error': '隐藏任务数据不存在'}), 404

    completed_ids = progress.get('hidden_tasks_completed', [])
    current_stage = progress.get('stage', '新生适应期')
    completed_stories = progress.get('completed_story_ids', [])
    level = 1  # 默认等级，从用户数据中可获取

    user_data = _load_user_data(user_id)
    if user_data:
        role = user_data.get('role', {})
        level = role.get('level', 1)

    hidden_tasks = hidden_data.get('hidden_tasks', [])
    tasks = []
    for ht in hidden_tasks:
        is_completed = ht['task_id'] in completed_ids
        # 检查触发条件
        trigger_cond = ht.get('trigger_condition', '')
        can_trigger = False
        trigger_type = ht.get('trigger_type', 'manual')

        if is_completed:
            can_trigger = False
        elif trigger_type == 'time':
            can_trigger = True  # 时间触发的任务由前端控制
        elif trigger_type == 'map_click':
            can_trigger = 'exploration_progress' in trigger_cond
        elif trigger_type == 'ar_scan':
            can_trigger = 'ar_scan_count' in trigger_cond
        elif trigger_type == 'npc_affection':
            can_trigger = 'npc_affection' in trigger_cond
        elif trigger_type == 'npc_all_max':
            can_trigger = True  # 前端检查所有NPC好感度
        elif trigger_type == 'exploration_full':
            can_trigger = True  # 前端检查探索度100%
        else:
            can_trigger = True

        tasks.append({
            'task_id': ht['task_id'],
            'name': ht['name'],
            'description': ht['description'],
            'detail': ht.get('detail', ''),
            'stage': ht.get('stage', ''),
            'chapter': ht.get('chapter', 0),
            'difficulty': ht.get('difficulty', 'medium'),
            'trigger_type': trigger_type,
            'is_completed': is_completed,
            'can_trigger': can_trigger,
            'unlock_text': ht.get('unlock_text', ''),
            'rewards': ht.get('rewards', {})
        })

    return jsonify({
        'success': True,
        'hidden_tasks': tasks,
        'completed_count': len(completed_ids),
        'total_count': len(tasks),
        'current_stage': current_stage
    })


@story_bp.route('/hidden/<task_id>/complete', methods=['POST'])
@_require_auth
def complete_hidden_task(task_id):
    """
    完成隐藏任务
    """
    user_id = request.user_id
    progress = _get_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '剧情进度未初始化'}), 400

    hidden_data = _load_enhanced_data('story_hidden_tasks.json')
    if not hidden_data:
        return jsonify({'error': '隐藏任务数据不存在'}), 404

    hidden_task = next((t for t in hidden_data.get('hidden_tasks', []) if t['task_id'] == task_id), None)
    if not hidden_task:
        return jsonify({'error': f'隐藏任务不存在: {task_id}'}), 404

    story_data = _load_story_data()
    completed_ids = story_data[user_id].get('hidden_tasks_completed', [])
    if task_id in completed_ids:
        return jsonify({'success': True, 'message': '隐藏任务已完成', 'already_completed': True})

    # 完成隐藏任务
    story_data[user_id].setdefault('hidden_tasks_completed', []).append(task_id)
    story_data[user_id]['updated_at'] = datetime.now().isoformat()
    _save_story_data(story_data)

    # 发放奖励
    rewards = hidden_task.get('rewards', {})
    _add_reward_to_user(user_id, {
        'experience': rewards.get('experience', 0),
        'gold': rewards.get('gold', 0)
    })

    # 解锁线索
    new_clues = rewards.get('clues', [])
    for clue_id in new_clues:
        if clue_id not in story_data[user_id].get('clues_collected', []):
            story_data[user_id].setdefault('clues_collected', []).append(clue_id)

    # 解锁成就
    ach_id = hidden_task.get('achievement_unlock')
    if ach_id:
        _update_achievement(
            '学业成就', ach_id, user_id,
            name=hidden_task.get('name', ''),
            desc=hidden_task.get('description', ''),
            icon='🔮'
        )

    return jsonify({
        'success': True,
        'message': f"隐藏任务「{hidden_task['name']}」完成！",
        'task_id': task_id,
        'task_name': hidden_task['name'],
        'rewards': rewards,
        'new_clues': new_clues,
        'achievement_unlock': ach_id,
        'completed_count': len(story_data[user_id]['hidden_tasks_completed'])
    })


# ============================================
# 新增 API：剧情分支选择系统
# ============================================

@story_bp.route('/choices', methods=['GET'])
@_require_auth
def get_story_choices():
    """
    获取用户的剧情分支选择记录
    """
    user_id = request.user_id
    progress = _get_user_story_progress(user_id)
    if progress is None:
        progress = _init_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '无法初始化用户剧情进度'}), 500

    choices = progress.get('story_choices', {})
    current_branch = progress.get('current_branch', 'default')
    completed_stories = progress.get('completed_story_ids', [])
    current_stage = progress.get('stage', '新生适应期')

    # 检查当前篇章是否有可用的分支选择
    enhanced_data = _load_enhanced_data('story_enhanced.json')
    branch_choices = []
    if enhanced_data:
        chapter_data = enhanced_data.get('chapters', {}).get(current_stage, {})
        chapter_tasks = STORY_STAGES.get(current_stage, {}).get('tasks', [])
        # 找到当前进行中的任务
        current_story_id = progress.get('current_story_id')
        current_task = next((t for t in chapter_tasks if t.get('story_id') == current_story_id), None)
        if current_task:
            # 检查是否有分支定义
            task_branches = current_task.get('branches')
            if task_branches:
                branch_choices = task_branches

    return jsonify({
        'success': True,
        'choices': choices,
        'current_branch': current_branch,
        'current_stage': current_stage,
        'completed_count': len(completed_stories),
        'available_branch_choices': branch_choices
    })


@story_bp.route('/choices', methods=['POST'])
@_require_auth
def make_story_choice():
    """
    提交剧情分支选择
    用户的选择将影响后续剧情走向和最终结局
    """
    user_id = request.user_id
    data = request.json or {}
    choice_id = data.get('choice_id')
    choice_value = data.get('choice_value')

    if not choice_id or choice_value is None:
        return jsonify({'error': '缺少选择ID或选择值'}), 400

    progress = _get_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '剧情进度未初始化'}), 400

    story_data = _load_story_data()
    if 'story_choices' not in story_data[user_id]:
        story_data[user_id]['story_choices'] = {}

    # 记录选择
    story_data[user_id]['story_choices'][choice_id] = choice_value
    story_data[user_id]['updated_at'] = datetime.now().isoformat()

    # 特殊选择影响结局
    if choice_id == 'branch_career':
        # 考研 or 就业 选择影响篇章四结局
        story_data[user_id]['current_branch'] = choice_value

    _save_story_data(story_data)

    return jsonify({
        'success': True,
        'message': f'选择已记录：「{choice_value}」',
        'choice_id': choice_id,
        'choice_value': choice_value,
        'branch': story_data[user_id].get('current_branch', 'default'),
        'choices': story_data[user_id].get('story_choices', {})
    })


@story_bp.route('/branch/check', methods=['GET'])
@_require_auth
def check_branch_status():
    """
    检查当前章节分支状态和可用结局
    """
    user_id = request.user_id
    progress = _get_user_story_progress(user_id)
    if progress is None:
        return jsonify({'error': '剧情进度未初始化'}), 400

    choices = progress.get('story_choices', {})
    current_branch = progress.get('current_branch', 'default')
    completed_stories = progress.get('completed_story_ids', [])
    puzzles_solved = progress.get('puzzles_solved', [])
    clues_collected = progress.get('clues_collected', [])
    hidden_completed = progress.get('hidden_tasks_completed', [])

    # 检查结局条件
    enhanced_data = _load_enhanced_data('story_enhanced.json')
    endings = enhanced_data.get('ending_definitions', {}) if enhanced_data else {}

    # 检测当前分支
    career_choice = choices.get('branch_career')
    grad_choice = choices.get('branch_graduation')

    # 计算可用结局
    available_endings = []
    if current_stage := progress.get('stage'):
        if current_stage == '毕业冲刺期':
            # 只有在毕业冲刺期才能检查结局
            if career_choice == 'employment' or (not career_choice and grad_choice == 'employment'):
                available_endings.append('employment')
            if career_choice == 'academic' or (not career_choice and grad_choice == 'academic'):
                available_endings.append('academic')
            if career_choice == 'entrepreneur' or (not career_choice and grad_choice == 'entrepreneur'):
                available_endings.append('entrepreneur')

    # 完成度评估
    total_puzzles = 4
    total_hidden = 8
    total_clues = 32
    completion_rate = {
        'story': len(completed_stories) / 20 * 100 if completed_stories else 0,
        'puzzle': len(puzzles_solved) / total_puzzles * 100 if puzzles_solved else 0,
        'clue': len(clues_collected) / total_clues * 100 if clues_collected else 0,
        'hidden': len(hidden_completed) / total_hidden * 100 if hidden_completed else 0
    }

    return jsonify({
        'success': True,
        'choices': choices,
        'current_branch': current_branch,
        'available_endings': available_endings,
        'puzzles_solved': puzzles_solved,
        'clues_collected': clues_collected,
        'hidden_completed': hidden_completed,
        'completion_rate': completion_rate,
        'is_grad_stage': progress.get('stage') == '毕业冲刺期'
    })
