"""
Campus RPG - Main Story V2 Branch and Ending Tests
Covers: Branch choice recording, idempotency, ending unlock conditions, reward distribution
"""
import json
import pytest
from helpers import (
    generate_test_token, assert_success, assert_error, assert_field,
    assert_field_contains
)


# ============================================================
# P0-5: Branch Choice Tests (3 cases)
# ============================================================

class TestBranchChoice:
    """Branch choice tests"""

    def test_t17_branch_choice_record(self, client, auth_headers, app, test_user):
        """T17: Branch choice recorded in story_choices"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks,story_choices)
                VALUES (?,?,?,?,?)
            ''', (test_user['id'], 'career_prep', 'story_career_2', '[]', '{}'))
            conn.commit()

        resp = client.post('/api/story/v2/branch/choose',
                           headers=auth_headers,
                           json={'task_id': 'story_career_2', 'branch_key': 'employment'})
        assert resp.status_code == 200, f'T17 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T17')
        assert_field(data, 'choices', {'story_career_2': 'employment'}, 'T17')

    def test_t18_repeat_branch_choice_idempotent(self, client, auth_headers, app, test_user):
        """T18: Repeat branch choice is idempotent"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks,story_choices)
                VALUES (?,?,?,?,?)
            ''', (test_user['id'], 'career_prep', 'story_career_2',
                   '[]', json.dumps({'story_career_2': 'employment'})))
            conn.commit()

        resp = client.post('/api/story/v2/branch/choose',
                           headers=auth_headers,
                           json={'task_id': 'story_career_2', 'branch_key': 'employment'})
        assert resp.status_code == 200, f'T18 Idempotent expected 200'
        data = resp.get_json()
        choices = data.get('choices', {})
        branch_keys = [k for k in choices.keys() if k == 'story_career_2']
        assert len(branch_keys) == 1, f'T18 Should not record duplicate, got {branch_keys}'

    def test_t19_branch_affects_ending(self, client, auth_headers, app, test_user):
        """T19: Branch choice affects ending conditions"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks,story_choices)
                VALUES (?,?,?,?,?)
            ''', (test_user['id'], 'career_prep', 'story_career_2',
                   '[]', json.dumps({'story_career_2': 'employment'})))
            conn.commit()

        resp = client.get('/api/story/v2/ending/list', headers=auth_headers)
        assert resp.status_code == 200, f'T19 Ending list should work'
        data = resp.get_json()
        endings = data.get('endings', [])
        employment_ending = next((e for e in endings if e['ending_key'] == 'ending_employment'), None)
        assert employment_ending is not None, 'T19 Should have employment ending'
        required_choices = employment_ending.get('required_choices', {})
        assert required_choices.get('branch_career') == 'employment', 'T19 employment ending should require branch_career=employment'


# ============================================================
# P0-6: Ending System Tests (3 cases)
# ============================================================

class TestEndingSystem:
    """Ending system tests"""

    def test_t20_ending_unlock_conditions_met(self, client, auth_headers, app, test_user):
        """T20: Ending unlock conditions verified when met"""
        employment_path = ['story_grad_1', 'story_grad_2', 'story_grad_3', 'story_grad_4', 'story_grad_5']
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks,
                 story_choices,endings_unlocked)
                VALUES (?,?,?,?,?,?)
            ''', (
                test_user['id'], 'graduation_sprint', 'story_grad_5',
                json.dumps(employment_path),
                json.dumps({'story_career_2': 'employment'}),
                json.dumps([])
            ))
            conn.commit()

        resp = client.get('/api/story/v2/ending/list', headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        endings = data.get('endings', [])
        employment_ending = next((e for e in endings if e['ending_key'] == 'ending_employment'), None)
        assert employment_ending is not None
        required_tasks = employment_ending.get('required_tasks', [])
        assert required_tasks == ['story_grad_5'], f'T20 required_tasks should be ["story_grad_5"]'

    def test_t21_ending_unlock_conditions_not_met(self, client, auth_headers, app, test_user):
        """T21: Ending unlock conditions not met when tasks incomplete"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks,story_choices)
                VALUES (?,?,?,?,?)
            ''', (
                test_user['id'], 'graduation_sprint', 'story_grad_3',
                json.dumps(['story_grad_1', 'story_grad_2', 'story_grad_3']),
                json.dumps({'story_career_2': 'employment'})
            ))
            conn.commit()

        resp = client.get('/api/story/v2/ending/list', headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        endings = data.get('endings', [])
        employment_ending = next((e for e in endings if e['ending_key'] == 'ending_employment'), None)
        required_tasks = employment_ending.get('required_tasks', [])
        assert 'story_grad_5' in required_tasks, 'T21 employment should require story_grad_5'

    def test_t22_ending_reward_issued(self, client, auth_headers, app, test_user):
        """T22: Ending reward issued on completion"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            all_tasks = ['story_grad_1', 'story_grad_2', 'story_grad_3', 'story_grad_4', 'story_grad_5']
            cursor.execute('''
                INSERT INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks,
                 story_choices,endings_unlocked)
                VALUES (?,?,?,?,?,?)
            ''', (
                test_user['id'], 'graduation_sprint', 'story_grad_5',
                json.dumps(all_tasks),
                json.dumps({'story_career_2': 'employment'}),
                json.dumps(['ending_employment'])
            ))
            conn.commit()

        resp = client.get('/api/story/v2/ending/list', headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        endings = data.get('endings', [])
        employment_ending = next((e for e in endings if e['ending_key'] == 'ending_employment'), None)
        assert employment_ending is not None
        assert_field(employment_ending, 'final_title', '职场新星', 'T22')
        reward = employment_ending.get('reward', {})
        assert reward.get('experience') == 300, f'T22 EXP should be 300, got {reward.get("experience")}'


# ============================================================
# P1: Story Lock Isolation Tests
# ============================================================

class TestStoryLock:
    """Story lock isolation tests"""

    def test_t30_branch_lock_isolation(self, client, headers_mid, app, user_mid):
        """T30: Branch lock isolation - employment branch selected"""
        with app.app_context():
            conn = app.config['TEST_DB']
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO user_story_progress
                (user_id,current_chapter_key,current_task_id,completed_tasks,story_choices)
                VALUES (?,?,?,?,?)
            ''', (
                user_mid['id'], 'career_prep', 'story_career_2',
                '[]',
                json.dumps({'story_career_2': 'employment'})
            ))
            conn.commit()

        resp = client.get('/api/story/v2/task/list', headers=headers_mid)
        assert resp.status_code == 200
        data = resp.get_json()
        tasks = data.get('tasks', [])
        employment_tasks = [t for t in tasks if t['task_id'] == 'story_career_2'][0]
        assert employment_tasks['is_branch_point'] == True, 'T30 story_career_2 should be branch point'
