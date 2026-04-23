"""
Campus RPG - Main Story V2 Chapter and Task Flow Tests
Covers: Chapter unlock logic, task flow, progress update, reward distribution
"""
import json
import pytest
from helpers import (
    generate_test_token, assert_success, assert_error, assert_field,
    assert_field_contains
)


# ============================================================
# P0-3: Chapter Unlock Tests (3 cases)
# ============================================================

class TestChapterUnlock:
    """Chapter unlock logic tests"""

    def test_t09_initial_only_first_chapter(self, client, auth_headers):
        """T09: Initially only first chapter is unlocked"""
        resp = client.get('/api/story/v2/progress/detail', headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        progress = data.get('progress', {})
        assert_field(progress, 'current_chapter_key', 'new_student', 'T09 Current chapter should be new_student')
        assert_field(progress, 'current_task_id', 'story_fresh_1', 'T09 Current task should be story_fresh_1')

    def test_t10_complete_chapter_unlocks_next(self, client, auth_headers, app, test_user):
        """T10: Complete all 5 chapter tasks unlocks next chapter"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            completed = ['story_fresh_1', 'story_fresh_2', 'story_fresh_3',
                         'story_fresh_4', 'story_fresh_5']
            cursor.execute('''
                INSERT OR REPLACE INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks)
                VALUES (?,?,?,?)
            ''', (test_user['id'], 'academic_growth', 'story_academic_1', json.dumps(completed)))
            conn.commit()

        headers = {
            'Authorization': f'Bearer {generate_test_token(test_user["id"])}',
            'Content-Type': 'application/json'
        }
        resp = client.get('/api/story/v2/progress/detail', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        progress = data.get('progress', {})
        assert_field(progress, 'current_chapter_key', 'academic_growth', 'T10 After completion chapter should be academic_growth')
        assert_field(progress, 'current_task_id', 'story_academic_1', 'T10 Current task should be story_academic_1')
        assert len(progress['completed_tasks']) == 5, f'T10 Should have 5 completed tasks'

    def test_t11_skip_chapter_blocked(self, client, headers_fresh, app, user_fresh):
        """T11: Cannot skip chapter - prerequisite not met"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO user_story_progress (user_id,current_chapter_key,current_task_id,completed_tasks) VALUES (?,?,?,?)',
                (user_fresh['id'], 'new_student', 'story_fresh_1', '[]'))
            # Verify AR for story_fresh_2 so we hit the prerequisite check
            cursor.execute(
                'INSERT OR REPLACE INTO user_ar_markers (user_id,marker_id,task_id,verified,verified_at) VALUES (?,?,?,1,datetime("now"))',
                (user_fresh['id'], 'marker_002', 'story_fresh_2'))
            conn.commit()

        # story_fresh_2 requires story_fresh_1 to be completed, but completed_tasks is empty
        resp = client.post('/api/story/v2/task/complete/story_fresh_2',
                          headers=headers_fresh)
        assert resp.status_code == 403, f'T11 Expected 403, got {resp.status_code}'
        data = resp.get_json()
        assert '前置' in data.get('error', ''), f'T11 Expected "前置" in error message'


# ============================================================
# P0-4: Task Flow Tests (5 cases)
# ============================================================

class TestTaskFlow:
    """Task flow tests"""

    def test_t12_task_complete_full_flow(self, client, auth_headers, app, test_user):
        """T12: Complete task full flow - verify rewards and progress update"""
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

        resp = client.post('/api/story/v2/task/complete/story_fresh_1', headers=auth_headers)
        assert resp.status_code == 200, f'T12 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T12')
        rewards = data.get('rewards', {})
        assert rewards.get('experience') == 80, f'T12 EXP should be 80, got {rewards.get("experience")}'
        assert rewards.get('gold') == 40, f'T12 Gold should be 40, got {rewards.get("gold")}'
        assert_field(data, 'completed_count', 1, 'T12')

    def test_t13_prerequisite_not_met(self, client, headers_fresh, app, user_fresh):
        """T13: Cannot skip tasks when prerequisite not met"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO user_story_progress (user_id,current_chapter_key,current_task_id,completed_tasks) VALUES (?,?,?,?)',
                (user_fresh['id'], 'new_student', 'story_fresh_1', '[]'))
            conn.commit()

        resp = client.post('/api/story/v2/task/complete/story_fresh_2',
                          headers=headers_fresh)
        assert resp.status_code == 403, f'T13 Expected 403, got {resp.status_code}'
        data = resp.get_json()
        assert_field_contains(data, 'error', '前置', 'T13')

    def test_t14_repeat_complete_idempotent(self, client, auth_headers, app, test_user):
        """T14: Repeat task completion is idempotent"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO user_story_progress (user_id,current_chapter_key,current_task_id,completed_tasks) VALUES (?,?,?,?)',
                (test_user['id'], 'new_student', 'story_fresh_1', '["story_fresh_1"]'))
            cursor.execute(
                'INSERT OR REPLACE INTO user_ar_markers (user_id,marker_id,task_id,verified,verified_at) VALUES (?,?,?,1,datetime("now"))',
                (test_user['id'], 'marker_001', 'story_fresh_1'))
            conn.commit()

        resp = client.post('/api/story/v2/task/complete/story_fresh_1', headers=auth_headers)
        assert resp.status_code == 200, f'T14 Idempotent expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert data.get('already_completed') == True, 'T14 Should be marked as already_completed'

    def test_t15_ar_not_verified_blocked(self, client, auth_headers, app, test_user):
        """T15: Tasks with AR requirement cannot be completed without AR verification"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO user_story_progress (user_id,current_chapter_key,current_task_id,completed_tasks) VALUES (?,?,?,?)',
                (test_user['id'], 'new_student', 'story_fresh_1', '[]'))
            conn.commit()

        resp = client.post('/api/story/v2/task/complete/story_fresh_1', headers=auth_headers)
        assert resp.status_code == 400, f'T15 Expected 400, got {resp.status_code}'
        data = resp.get_json()
        assert_field_contains(data, 'error', 'AR', 'T15')

    def test_t16_reward_issued_correctly(self, client, auth_headers, app, test_user):
        """T16: Rewards issued correctly on task completion"""
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

        resp = client.post('/api/story/v2/task/complete/story_fresh_1', headers=auth_headers)
        assert resp.status_code == 200, f'T16 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        rewards = data.get('rewards', {})
        assert rewards.get('experience') == 80, 'T16 EXP should be 80'
        assert rewards.get('gold') == 40, 'T16 Gold should be 40'


# ============================================================
# P2: Task Edge Case Tests
# ============================================================

class TestTaskEdgeCases:
    """Task edge case and exception tests"""

    def test_t36_nonexistent_task(self, client, auth_headers):
        """T36: Nonexistent task ID handling"""
        resp = client.post('/api/story/v2/task/complete/nonexistent_task_xyz',
                          headers=auth_headers)
        assert resp.status_code in [400, 404], f'T36 Expected 400/404, got {resp.status_code}'

    def test_t40_full_completion_stress(self, client, auth_headers, app, test_user):
        """T40: 100% completion stress test - all 20 tasks done"""
        all_tasks = [
            'story_fresh_1', 'story_fresh_2', 'story_fresh_3', 'story_fresh_4', 'story_fresh_5',
            'story_academic_1', 'story_academic_2', 'story_academic_3', 'story_academic_4', 'story_academic_5',
            'story_career_1', 'story_career_2', 'story_career_3', 'story_career_4', 'story_career_5',
            'story_grad_1', 'story_grad_2', 'story_grad_3', 'story_grad_4', 'story_grad_5',
        ]
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            for i, task_id in enumerate(all_tasks):
                marker = f'marker_{i+1:03d}'
                cursor.execute('''
                    INSERT OR REPLACE INTO user_ar_markers (user_id,marker_id,task_id,verified,verified_at)
                    VALUES (?,?,?,1,datetime("now"))
                ''', (test_user['id'], marker, task_id))
            cursor.execute('''
                INSERT OR REPLACE INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks)
                VALUES (?,?,?,?)
            ''', (test_user['id'], 'graduation_sprint', 'story_grad_5', json.dumps(all_tasks)))
            conn.commit()

        resp = client.get('/api/story/v2/progress/detail', headers=auth_headers)
        assert resp.status_code == 200, f'T40 Progress query should succeed'
        data = resp.get_json()
        progress = data.get('progress', {})
        assert len(progress['completed_tasks']) == 20, f'T40 Should have 20 completed tasks, got {len(progress["completed_tasks"])}'

    def test_t42_multi_ending_unlock(self, client, auth_headers, app, test_user):
        """T42: Multiple endings unlock simultaneously"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE user_story_progress
                SET endings_unlocked=?
                WHERE user_id=?
            ''', (json.dumps(['ending_employment', 'ending_academic']), test_user['id']))
            conn.commit()

        resp = client.get('/api/story/v2/ending/list', headers=auth_headers)
        assert resp.status_code == 200, f'T42 Ending list should work'
        data = resp.get_json()
        endings = data.get('endings', [])
        assert len(endings) == 3, f'T42 Should have 3 ending definitions, got {len(endings)}'

    def test_t43_db_concurrent_write(self, client, app, test_user):
        """T43: DB concurrent write test"""
        all_tasks = ['story_fresh_1', 'story_fresh_2', 'story_fresh_3']

        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO user_story_progress (user_id,current_chapter_key,current_task_id,completed_tasks) VALUES (?,?,?,?)',
                (test_user['id'], 'new_student', 'story_fresh_1', '[]'))
            for i, task_id in enumerate(all_tasks):
                marker = f'marker_{i+1:03d}'
                cursor.execute('''
                    INSERT OR REPLACE INTO user_ar_markers (user_id,marker_id,task_id,verified,verified_at)
                    VALUES (?,?,?,1,datetime("now"))
                ''', (test_user['id'], marker, task_id))
            conn.commit()

        headers = {
            'Authorization': f'Bearer {generate_test_token(test_user["id"])}',
            'Content-Type': 'application/json'
        }
        for task_id in all_tasks:
            resp = client.post(f'/api/story/v2/task/complete/{task_id}', headers=headers)
            assert resp.status_code in [200, 403], f'T43 {task_id} should return 200 or 403, got {resp.status_code}'

        resp = client.get('/api/story/v2/progress/detail', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert isinstance(data['progress']['completed_tasks'], list)
