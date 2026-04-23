"""
Campus RPG - Main Story V2 AR Integration Tests
Covers: AR marker verification, correct/wrong markers, puzzle verification
"""
import json
import pytest
from helpers import (
    generate_test_token, assert_success, assert_error, assert_field,
    assert_field_contains
)


# ============================================================
# P0-7: AR Integration Tests (3 cases)
# ============================================================

class TestARIntegration:
    """AR integration tests"""

    def test_t23_ar_verify_correct_marker(self, client, auth_headers):
        """T23: AR marker verification - correct marker"""
        resp = client.post('/api/story/v2/ar-verify',
                           headers=auth_headers,
                           json={'task_id': 'story_fresh_1', 'marker_id': 'marker_001'})
        assert resp.status_code == 200, f'T23 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T23')
        assert_field(data, 'ar_verified', True, 'T23')

    def test_t24_ar_verify_wrong_marker(self, client, auth_headers):
        """T24: AR marker verification - wrong marker"""
        resp = client.post('/api/story/v2/ar-verify',
                           headers=auth_headers,
                           json={'task_id': 'story_fresh_1', 'marker_id': 'marker_002'})
        assert resp.status_code == 400, f'T24 Expected 400, got {resp.status_code}'
        data = resp.get_json()
        assert data.get('success') == False, 'T24 Should return failure'

    def test_t25_puzzle_verify(self, client, auth_headers):
        """T25: AR puzzle verification"""
        resp = client.post('/api/story/v2/puzzle/verify/puzzle_fresh_001',
                           headers=auth_headers,
                           json={'answer': 'east'})
        assert resp.status_code == 200, f'T25 Expected 200, got {resp.status_code}'
        data = resp.get_json()
        assert_success(data, 'T25')
        assert_field(data, 'puzzle_id', 'puzzle_fresh_001', 'T25')


# ============================================================
# P2: AR Edge Case Tests
# ============================================================

class TestAREdgeCases:
    """AR edge case and exception tests"""

    def test_ar_missing_task_id(self, client, auth_headers):
        """AR verify missing task_id"""
        resp = client.post('/api/story/v2/ar-verify',
                           headers=auth_headers,
                           json={'marker_id': 'marker_001'})
        assert resp.status_code == 400, 'Missing task_id should return 400'

    def test_ar_missing_marker_id(self, client, auth_headers):
        """AR verify missing marker_id"""
        resp = client.post('/api/story/v2/ar-verify',
                           headers=auth_headers,
                           json={'task_id': 'story_fresh_1'})
        assert resp.status_code == 400, 'Missing marker_id should return 400'

    def test_puzzle_missing_answer(self, client, auth_headers):
        """Puzzle verify missing answer"""
        resp = client.post('/api/story/v2/puzzle/verify/puzzle_fresh_001',
                           headers=auth_headers,
                           json={})
        assert resp.status_code in [200, 400], 'Puzzle verify should have clear response'
