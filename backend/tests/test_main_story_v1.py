"""
校园RPG - 主线剧情V1 API 测试
测试 backend/main_story_api.py 中的所有 /api/story/* 端点

V1 API 直接操作 JSON 文件，不使用数据库。
测试用户文件和数据使用唯一ID前缀（test_story_v1_xxx）确保隔离。
"""

import json
import os
import sys
import pytest
import jwt as pyjwt
from datetime import datetime, timedelta

# 项目路径配置
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BACKEND_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, 'data')

JWT_SECRET = os.environ.get('JWT_SECRET', 'campus-rpg-secret-key-2026')
JWT_ALGORITHM = 'HS256'

TEST_USER_ID = 'test_story_v1_001'
TEST_USER_FILE = 'user_data_' + TEST_USER_ID + '.json'
STORY_FILE = 'main_story.json'


# ============================================================
# 工具函数
# ============================================================

def gen_token(uid, expired=False):
    exp = datetime.utcnow() - timedelta(hours=1) if expired else datetime.utcnow() + timedelta(days=7)
    payload = {'user_id': uid, 'exp': exp, 'iat': datetime.utcnow()}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def hdr(uid):
    return {'Authorization': 'Bearer ' + gen_token(uid), 'Content-Type': 'application/json'}


def ok(data, msg=''):
    assert data.get('success') == True, f'{msg}: {data}'


def _clean_test_user_progress():
    """清理测试用户的故事进度"""
    story_path = os.path.join(DATA_DIR, STORY_FILE)
    if os.path.exists(story_path):
        with open(story_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if TEST_USER_ID in data:
            del data[TEST_USER_ID]
        with open(story_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


# ============================================================
# 模块级 Setup/Teardown
# ============================================================

def setup_module():
    """模块加载时：创建测试用户文件并清理进度"""
    user_path = os.path.join(DATA_DIR, TEST_USER_FILE)
    with open(user_path, 'w', encoding='utf-8') as f:
        json.dump({
            'user': {
                'id': TEST_USER_ID, 'username': 'test_story_v1',
                'grade': '大一', 'experience': 0, 'gold': 100,
                'level': 1, 'current_stage': '新生适应期'
            }
        }, f, ensure_ascii=False, indent=2)
    _clean_test_user_progress()


def teardown_module():
    """模块卸载时：清理测试用户文件"""
    user_path = os.path.join(DATA_DIR, TEST_USER_FILE)
    if os.path.exists(user_path):
        os.remove(user_path)
    _clean_test_user_progress()


# ============================================================
# Flask 测试客户端
# ============================================================

@pytest.fixture
def api_client():
    """创建Flask测试客户端"""
    sys.path.insert(0, BACKEND_DIR)
    from flask import Flask, request
    import main_story_api as msa

    test_app = Flask(__name__)
    test_app.config['TESTING'] = True
    test_app.register_blueprint(msa.story_bp, url_prefix='/api/story')

    def verify(tok):
        try:
            p = pyjwt.decode(tok, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return p.get('user_id')
        except:
            return None

    @test_app.before_request
    def inj():
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            uid = verify(auth[7:])
            if uid:
                request.user_id = uid

    return test_app.test_client()


# ============================================================
# 每个测试前：重置故事进度（确保独立）
# ============================================================

@pytest.fixture(autouse=True)
def reset_story():
    """每个测试前将故事进度重置为干净空状态"""
    _clean_test_user_progress()
    yield
    _clean_test_user_progress()


# ============================================================
# V1-T01: GET /api/story/stages
# ============================================================

class TestStoryStages:

    def test_v1_t01_returns_4_chapters(self, api_client):
        """V1-T01: 篇章列表返回4个篇章"""
        resp = api_client.get('/api/story/stages', headers=hdr(TEST_USER_ID))
        assert resp.status_code == 200, f'V1-T01 got {resp.status_code}: {resp.get_json()}'
        d = resp.get_json()
        ok(d, 'V1-T01')
        stages = d.get('stages', {})
        assert isinstance(stages, dict), f'V1-T01 stages should be dict, got {type(stages)}'
        assert len(stages) == 4, f'V1-T01 expected 4, got {len(stages)}'
        assert '新生适应期' in stages and '毕业冲刺期' in stages, 'V1-T01 should have both stages'

    def test_v1_t01b_no_auth_401(self, api_client):
        """V1-T01b: 无token返回401"""
        resp = api_client.get('/api/story/stages')
        assert resp.status_code == 401


# ============================================================
# V1-T02: GET /api/story/progress
# ============================================================

class TestStoryProgress:

    def test_v1_t02_progress_init(self, api_client):
        """V1-T02: 新用户自动初始化进度，任务状态正确"""
        resp = api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        assert resp.status_code == 200, f'V1-T02 got {resp.status_code}: {resp.get_json()}'
        d = resp.get_json()
        ok(d, 'V1-T02')
        p = d.get('progress', {})
        valid_stages = ['新生适应期', '学业成长期', '实习准备期', '毕业冲刺期']
        assert p.get('stage') in valid_stages, f'V1-T02 stage should be valid, got {p.get("stage")}'
        assert 'all_tasks' in p, 'V1-T02 missing all_tasks'
        assert len(p['all_tasks']) == 5, f'V1-T02 expected 5 tasks, got {len(p["all_tasks"])}'
        # 验证所有任务都有status字段
        for t in p['all_tasks']:
            assert t['status'] in ('active', 'locked', 'completed'), \
                f'V1-T02 invalid task status: {t["status"]}'
        # 验证至少有一个active任务
        active_tasks = [t for t in p['all_tasks'] if t['status'] == 'active']
        assert len(active_tasks) >= 1, 'V1-T02 should have at least one active task'

    def test_v1_t02b_exploration_progress_field(self, api_client):
        """V1-T02b: exploration_progress 字段存在且结构正确"""
        resp = api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        d = resp.get_json()
        p = d.get('progress', {})
        assert 'exploration_progress' in p, 'V1-T02b missing exploration_progress'
        exp = p['exploration_progress']
        assert isinstance(exp, dict), 'V1-T02b should be dict'
        assert 'discovered_areas' in exp, 'V1-T02b missing discovered_areas'
        assert 'total_clues_found' in exp, 'V1-T02b missing total_clues_found'

    def test_v1_t02c_progress_required_fields(self, api_client):
        """V1-T02c: 所有必需字段存在"""
        resp = api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        d = resp.get_json()
        p = d.get('progress', {})
        for t in p.get('all_tasks', []):
            for f in ['story_id', 'title', 'status', 'rewards']:
                assert f in t, f'V1-T02c task missing {f}'
        for f in ['core_mystery', 'mystery_hint', 'hidden_tasks', 'chapter_puzzle',
                  'clues_collected', 'clues_count', 'exploration_progress']:
            assert f in p, f'V1-T02c progress missing {f}'


# ============================================================
# V1-T03: POST /api/story/complete/<story_id>
# ============================================================

class TestStoryComplete:

    def test_v1_t03_complete_active_task(self, api_client):
        """V1-T03: 完成当前激活的任务"""
        # 先初始化
        resp0 = api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        d0 = resp0.get_json()
        current_id = d0['progress']['current_story_id']

        resp = api_client.post('/api/story/complete/' + current_id, headers=hdr(TEST_USER_ID))
        assert resp.status_code == 200, f'V1-T03 got {resp.status_code}: {resp.get_json()}'
        d = resp.get_json()
        ok(d, 'V1-T03')
        assert 'completed_count' in d, 'V1-T03 missing completed_count'

    def test_v1_t03b_complete_updates_status(self, api_client):
        """V1-T03b: 完成任务后状态变为completed"""
        # 初始化并获取当前任务
        resp0 = api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        current_id = resp0.get_json()['progress']['current_story_id']
        # 完成该任务
        api_client.post('/api/story/complete/' + current_id, headers=hdr(TEST_USER_ID))
        # 验证状态
        resp = api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        d = resp.get_json()
        p = d.get('progress', {})
        assert current_id in p.get('completed_story_ids', []), \
            'V1-T03b completed_story_ids should contain ' + current_id
        completed_task = next((x for x in p.get('all_tasks', []) if x['story_id'] == current_id), None)
        assert completed_task is not None and completed_task['status'] == 'completed', \
            'V1-T03b task status should be completed, got: ' + str(completed_task.get('status') if completed_task else None)


# ============================================================
# V1-T04: GET /api/story/clues
# ============================================================

class TestStoryClues:

    def test_v1_t04_clues_returns_structure(self, api_client):
        """V1-T04: 线索接口返回完整结构"""
        resp = api_client.get('/api/story/clues', headers=hdr(TEST_USER_ID))
        assert resp.status_code == 200, f'V1-T04 got {resp.status_code}: {resp.get_json()}'
        d = resp.get_json()
        ok(d, 'V1-T04')
        for f in ['collected_count', 'total_count', 'by_category', 'by_stage', 'collected_ids']:
            assert f in d, f'V1-T04 missing {f}'

    def test_v1_t04b_by_stage(self, api_client):
        """V1-T04b: 线索按篇章分组"""
        resp = api_client.get('/api/story/clues', headers=hdr(TEST_USER_ID))
        d = resp.get_json()
        by_stage = d.get('by_stage', {})
        for s in ['新生适应期', '学业成长期', '实习准备期', '毕业冲刺期']:
            assert s in by_stage, f'V1-T04b missing {s}'
            assert isinstance(by_stage[s], list), f'V1-T04b {s} should be list'

    def test_v1_t04c_by_category(self, api_client):
        """V1-T04c: 线索按分类"""
        resp = api_client.get('/api/story/clues', headers=hdr(TEST_USER_ID))
        d = resp.get_json()
        cat = d.get('by_category', {})
        assert 'main' in cat and 'total' in cat['main'], 'V1-T04c should have main category'


# ============================================================
# V1-T05: POST /api/story/clues/collect
# ============================================================

class TestClueCollect:

    def test_v1_t05_collect_clue(self, api_client):
        """V1-T05: 收集线索"""
        resp = api_client.post('/api/story/clues/collect',
                             headers=hdr(TEST_USER_ID),
                             json={'clue_id': 'clue_fresh_001'})
        assert resp.status_code == 200, f'V1-T05 got {resp.status_code}: {resp.get_json()}'
        ok(resp.get_json(), 'V1-T05')
        d2 = api_client.get('/api/story/clues', headers=hdr(TEST_USER_ID)).get_json()
        assert 'clue_fresh_001' in d2.get('collected_ids', []), 'V1-T05 should be collected'

    def test_v1_t05b_idempotent(self, api_client):
        """V1-T05b: 重复收集幂等"""
        api_client.post('/api/story/clues/collect',
                     headers=hdr(TEST_USER_ID),
                     json={'clue_id': 'clue_fresh_002'})
        resp = api_client.post('/api/story/clues/collect',
                             headers=hdr(TEST_USER_ID),
                             json={'clue_id': 'clue_fresh_002'})
        assert resp.status_code == 200, f'V1-T05b got {resp.status_code}'


# ============================================================
# V1-T06: GET /api/story/puzzles
# ============================================================

class TestStoryPuzzles:

    def test_v1_t06_puzzles_returns_4(self, api_client):
        """V1-T06: 谜题接口返回4个谜题"""
        resp = api_client.get('/api/story/puzzles', headers=hdr(TEST_USER_ID))
        assert resp.status_code == 200, f'V1-T06 got {resp.status_code}: {resp.get_json()}'
        d = resp.get_json()
        ok(d, 'V1-T06')
        puzzles = d.get('puzzles', [])
        assert len(puzzles) == 4, f'V1-T06 expected 4, got {len(puzzles)}'
        for p in puzzles:
            for f in ['puzzle_id', 'name', 'is_solved', 'hints']:
                assert f in p, f'V1-T06 puzzle missing {f}'


# ============================================================
# V1-T07: GET /api/story/hidden
# ============================================================

class TestHiddenTasks:

    def test_v1_t07_hidden_returns_list(self, api_client):
        """V1-T07: 隐藏任务接口返回列表"""
        resp = api_client.get('/api/story/hidden', headers=hdr(TEST_USER_ID))
        assert resp.status_code == 200, f'V1-T07 got {resp.status_code}: {resp.get_json()}'
        d = resp.get_json()
        ok(d, 'V1-T07')
        assert isinstance(d.get('hidden_tasks', []), list), 'V1-T07 should be list'


# ============================================================
# V1-T08: POST /api/story/choices
# ============================================================

class TestStoryChoices:

    def test_v1_t08_make_and_get_choice(self, api_client):
        """V1-T08: 提交并获取分支选择"""
        api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        resp = api_client.post('/api/story/choices',
                             headers=hdr(TEST_USER_ID),
                             json={'choice_id': 'career_choice_1', 'choice_value': 'employment'})
        assert resp.status_code == 200, f'V1-T08 got {resp.status_code}: {resp.get_json()}'
        d = resp.get_json()
        ok(d, 'V1-T08')
        assert d.get('choice_value') == 'employment', 'V1-T08 value mismatch'
        assert 'choices' in d, 'V1-T08 missing choices in response'

    def test_v1_t08b_get_choices(self, api_client):
        """V1-T08b: 获取选择记录"""
        api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        api_client.post('/api/story/choices',
                      headers=hdr(TEST_USER_ID),
                      json={'choice_id': 'branch_1', 'choice_value': 'academic'})
        resp = api_client.get('/api/story/choices', headers=hdr(TEST_USER_ID))
        assert resp.status_code == 200, f'V1-T08b got {resp.status_code}: {resp.get_json()}'
        ok(resp.get_json(), 'V1-T08b')
        assert 'branch_1' in resp.get_json().get('choices', {}), 'V1-T08b should retrieve choice'


# ============================================================
# V1-T09: 探索进度
# ============================================================

class TestExplorationProgress:

    def test_v1_t09_exp_structure(self, api_client):
        """V1-T09: exploration_progress 结构正确"""
        resp = api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        d = resp.get_json()
        p = d.get('progress', {})
        exp = p.get('exploration_progress', {})
        assert exp.get('discovered_areas') == [], 'V1-T09 should be empty list'
        assert exp.get('total_clues_found') == 0, 'V1-T09 should be 0'


# ============================================================
# 前端兼容性
# ============================================================

class TestFrontendCompatibility:

    def test_v1_t10_frontend_fields(self, api_client):
        """V1-T10: 前端期望的字段全部存在"""
        resp = api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        d = resp.get_json()
        p = d.get('progress', {})
        # _renderTasksTab
        for t in p.get('all_tasks', []):
            for f in ['story_id', 'title', 'status', 'rewards', 'is_branch_point']:
                assert f in t, f'V1-T10 missing {f}'
        # _renderExploreTab
        assert 'exploration_progress' in p, 'V1-T10 missing exploration_progress'
        # 顶层字段
        for f in ['stage', 'all_tasks', 'hidden_tasks', 'chapter_puzzle', 'core_mystery']:
            assert f in p, f'V1-T10 missing {f}'

    def test_v1_t11_no_null_critical(self, api_client):
        """V1-T11: 关键字段不为None"""
        resp = api_client.get('/api/story/progress', headers=hdr(TEST_USER_ID))
        d = resp.get_json()
        p = d.get('progress', {})
        for f in ['stage', 'all_tasks', 'chapter_unlocked']:
            assert p.get(f) is not None, f'V1-T11 {f} should not be None'
        for t in p.get('all_tasks', []):
            assert t.get('story_id') is not None and t.get('status') is not None, \
                'V1-T11 story_id/status should not be None'
