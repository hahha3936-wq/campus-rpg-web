"""
Campus RPG - Main Story V2 System Full Test Suite
Covers: JWT auth, chapter list, task list, progress detail, branch choice, ending list
"""
import json
import pytest
from helpers import (
    generate_test_token, assert_success, assert_error, assert_field,
    assert_field_contains
)


# ============================================================
# P0-1: Basic Interface Tests (6 cases)
# ============================================================

class TestBasicInterface:
    """Basic interface availability tests"""

    def test_t01_jwt_no_token(self, client):
        """T01: JWT no token blocked"""
        resp = client.get('/api/story/v2/chapter/list')
        assert resp.status_code == 401, f'T01 Expected 401, got {resp.status_code}'
        data = resp.get_json()
        # Chinese "未登录，请先登录" contains "登录"
        assert '登录' in data.get('error', ''), f'T01 Expected "登录" in error message'

    def test_t02_jwt_invalid_token(self, client):
        """T02: JWT invalid token blocked"""
        resp = client.get('/api/story/v2/chapter/list',
                          headers={'Authorization': 'Bearer invalid_token_xyz'})
        assert resp.status_code == 401, f'T02 Expected 401, got {resp.status_code}'
        data = resp.get_json()
        assert '登录' in data.get('error', ''), f'T02 Expected "登录" in error message'

    def test_t03_jwt_expired_token(self, client):
        """T03: JWT expired token blocked"""
        expired_token = generate_test_token('any_user', expired=True)
        resp = client.get('/api/story/v2/chapter/list',
                          headers={'Authorization': f'Bearer {expired_token}'})
        assert resp.status_code == 401, f'T03 Expected 401, got {resp.status_code}'

    def test_t04_chapter_list(self, client, auth_headers):
        """T04: Chapter list API"""
        resp = client.get('/api/story/v2/chapter/list', headers=auth_headers)
        assert resp.status_code == 200, f'T04 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T04')
        chapters = data.get('chapters', [])
        assert len(chapters) == 4, f'T04 Expected 4 chapters, got {len(chapters)}'
        keys = [c['chapter_key'] for c in chapters]
        expected = ['new_student', 'academic_growth', 'career_prep', 'graduation_sprint']
        assert keys == expected, f'T04 Chapter order wrong, expected {expected}, got {keys}'

    def test_t05_task_list(self, client, auth_headers):
        """T05: Task list API"""
        resp = client.get('/api/story/v2/task/list', headers=auth_headers)
        assert resp.status_code == 200, f'T05 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T05')
        tasks = data.get('tasks', [])
        assert len(tasks) == 20, f'T05 Expected 20 tasks, got {len(tasks)}'
        for chapter_key in ['new_student', 'academic_growth', 'career_prep', 'graduation_sprint']:
            chapter_tasks = [t for t in tasks if t['chapter_key'] == chapter_key]
            assert len(chapter_tasks) == 5, f'T05 {chapter_key} should have 5 tasks, got {len(chapter_tasks)}'
        branch_tasks = [t for t in tasks if t.get('is_branch_point')]
        assert len(branch_tasks) == 1, f'T05 Expected 1 branch point, got {len(branch_tasks)}'
        assert branch_tasks[0]['task_id'] == 'story_career_2', 'T05 Branch point should be story_career_2'

    def test_t06_progress_detail(self, client, auth_headers):
        """T06: Progress detail API"""
        resp = client.get('/api/story/v2/progress/detail', headers=auth_headers)
        assert resp.status_code == 200, f'T06 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T06')
        progress = data.get('progress', {})
        assert progress, 'T06 Progress data should not be empty'
        assert_field(progress, 'current_chapter_key', 'new_student', 'T06 New user should start from first chapter')
        assert_field(progress, 'current_task_id', 'story_fresh_1', 'T06 Current task should be story_fresh_1')


# ============================================================
# P0-2: Data Init and Compatibility Tests (2 cases)
# ============================================================

class TestDataInit:
    """Data initialization and compatibility tests"""

    def test_t07_new_user_init(self, client, test_user):
        """T07: New user progress initialization"""
        headers = {
            'Authorization': f'Bearer {generate_test_token(test_user["id"])}',
            'Content-Type': 'application/json'
        }
        resp = client.get('/api/story/v2/progress/detail', headers=headers)
        assert resp.status_code == 200, f'T07 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T07')
        progress = data.get('progress', {})
        required_fields = ['user_id', 'current_chapter_key', 'current_task_id',
                          'completed_tasks', 'collected_clues', 'puzzles_solved',
                          'hidden_tasks_completed', 'story_choices', 'endings_unlocked',
                          'exploration_progress', 'updated_at']
        for field in required_fields:
            assert field in progress, f'T07 Progress missing field: {field}'
        assert isinstance(progress['completed_tasks'], list), 'T07 completed_tasks should be list'
        assert isinstance(progress['story_choices'], dict), 'T07 story_choices should be dict'

    def test_t08_v1_data_migration(self, client, test_user, app):
        """T08: Old user V1 data migration"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks,story_choices)
                VALUES (?,?,?,?,?)
            ''', (
                test_user['id'],
                'academic_growth',
                'story_academic_2',
                json.dumps(['story_fresh_1', 'story_fresh_2', 'story_fresh_3', 'story_fresh_4', 'story_fresh_5']),
                '{}'
            ))
            conn.commit()

        headers = {
            'Authorization': f'Bearer {generate_test_token(test_user["id"])}',
            'Content-Type': 'application/json'
        }
        resp = client.get('/api/story/v2/progress/detail', headers=headers)
        assert resp.status_code == 200, f'T08 V2 API should access migrated data, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T08')
        progress = data.get('progress', {})
        assert_field(progress, 'current_chapter_key', 'academic_growth', 'T08 After migration chapter should be academic_growth')
        assert_field(progress, 'current_task_id', 'story_academic_2', 'T08 After migration task should be story_academic_2')
        assert len(progress['completed_tasks']) == 5, f'T08 Should have 5 completed tasks, got {len(progress["completed_tasks"])}'


# ============================================================
# P1: Frontend Compatibility Tests (2 cases)
# ============================================================

class TestFrontendCompatibility:
    """Frontend compatibility and rendering tests"""

    def test_t32_progress_detail_data_format(self, client, auth_headers):
        """T32: Progress detail data format compatible with frontend"""
        resp = client.get('/api/story/v2/progress/detail', headers=auth_headers)
        assert resp.status_code == 200, f'T32 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T32')
        progress = data.get('progress', {})
        assert 'current_chapter_key' in progress and isinstance(progress['current_chapter_key'], str)
        assert 'current_task_id' in progress and isinstance(progress['current_task_id'], str)
        assert 'completed_tasks' in progress and isinstance(progress['completed_tasks'], list)
        assert 'story_choices' in progress and isinstance(progress['story_choices'], dict)
        assert 'endings_unlocked' in progress and isinstance(progress['endings_unlocked'], list)

    def test_t41_zero_progress_new_user(self, client, test_user):
        """T41: Zero progress boundary test - new user with no operations"""
        headers = {
            'Authorization': f'Bearer {generate_test_token(test_user["id"])}',
            'Content-Type': 'application/json'
        }
        resp = client.get('/api/story/v2/progress/detail', headers=headers)
        assert resp.status_code == 200, f'T41 Progress API should work, got {resp.status_code}'
        resp = client.get('/api/story/v2/chapter/list', headers=headers)
        assert resp.status_code == 200, f'T41 Chapter API should work, got {resp.status_code}'
        data = resp.get_json()
        assert len(data.get('chapters', [])) == 4, 'T41 Should return 4 chapters'
        resp = client.get('/api/story/v2/task/list', headers=headers)
        assert resp.status_code == 200, f'T41 Task API should work, got {resp.status_code}'
        data = resp.get_json()
        assert len(data.get('tasks', [])) == 20, 'T41 Should return 20 tasks'


# ============================================================
# P2: Exception Handling Tests (4 cases)
# ============================================================

class TestExceptionHandling:
    """Exception handling tests"""

    def test_t35_missing_params(self, client, auth_headers):
        """T35: Missing params handling"""
        resp = client.post('/api/story/v2/branch/choose',
                           headers=auth_headers,
                           json={})
        assert resp.status_code == 400, f'T35 Expected 400, got {resp.status_code}'
        data = resp.get_json()
        # Chinese "缺少参数" contains "参数" or "缺少"
        assert '参数' in data.get('error', '') or '缺少' in data.get('error', ''), f'T35 Expected "参数" or "缺少" in error message'

    def test_t37_idempotent_task_complete(self, client, auth_headers, app, test_user):
        """T37: Idempotent task completion"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO user_story_progress (user_id,current_chapter_key,current_task_id,completed_tasks) VALUES (?,?,?,?)',
                (test_user['id'], 'new_student', 'story_fresh_1', '[]'))
            cursor.execute(
                'INSERT OR REPLACE INTO user_ar_markers (user_id,marker_id,task_id,verified,verified_at) VALUES (?,?,?,1,datetime("now"))',
                (test_user['id'], 'marker_001', 'story_fresh_1'))
            conn.commit()

        resp1 = client.post('/api/story/v2/task/complete/story_fresh_1', headers=auth_headers)
        assert resp1.status_code == 200, f'T37 First complete expected 200, got {resp1.status_code}'
        data1 = resp1.get_json()
        assert_success(data1, 'T37 First complete')

        resp2 = client.post('/api/story/v2/task/complete/story_fresh_1', headers=auth_headers)
        assert resp2.status_code == 200, f'T37 Idempotent expected 200, got {resp2.status_code}'
        data2 = resp2.get_json()
        assert_success(data2, 'T37 Idempotent complete')
        assert data2.get('already_completed') == True, 'T37 Should be marked as already_completed'

    def test_t38_permission_boundary(self, client, test_user, app):
        """T38: Permission boundary - user isolation"""
        user_a = test_user
        user_b = {'id': 'user_b_id', 'username': 'user_b'}

        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks)
                VALUES (?,?,?,?)
            ''', (user_b['id'], 'new_student', 'story_fresh_1', '["story_fresh_1"]'))
            conn.commit()

        headers_a = {
            'Authorization': f'Bearer {generate_test_token(user_a["id"])}',
            'Content-Type': 'application/json'
        }
        resp = client.get('/api/story/v2/progress/detail', headers=headers_a)
        assert resp.status_code == 200, 'T38 Self progress access should succeed'
        data = resp.get_json()
        progress = data.get('progress', {})
        assert progress['completed_tasks'] == [], 'T38 User A progress should be empty'

    def test_t44_invalid_token_formats(self, client):
        """T44: Invalid token format handling"""
        invalid_formats = [
            'Bearer',
            'Bearer ',
            'bearer lowercase_token',
            'Basic fake_token',
            'token_without_prefix',
        ]
        for fmt in invalid_formats:
            resp = client.get('/api/story/v2/chapter/list',
                              headers={'Authorization': fmt})
            assert resp.status_code == 401, f'T44 Format "{fmt}" should return 401, got {resp.status_code}'
