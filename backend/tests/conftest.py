"""
校园RPG - 主线剧情V2系统 pytest Fixtures
所有fixtures仅在此文件中定义
"""
import os
import sys
import json
import pytest

# 添加backend路径到sys.path，使helpers可被导入
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from helpers import (
    create_test_db, seed_test_data, create_test_app,
    generate_test_token,
    assert_success, assert_error, assert_field, assert_field_contains
)


# ============================================================
# Pytest Fixtures
# ============================================================

@pytest.fixture(scope='function')
def test_db():
    """
    为每个测试函数创建独立的内存数据库
    scope='function' 确保测试间完全隔离
    """
    conn = create_test_db()
    seed_test_data(conn)
    yield conn
    conn.close()


@pytest.fixture(scope='function')
def app(test_db):
    """创建Flask测试应用，挂载测试数据库连接"""
    test_app = create_test_app(test_db)
    yield test_app


@pytest.fixture(scope='function')
def client(app):
    """Flask测试客户端"""
    return app.test_client()


@pytest.fixture
def test_user():
    """标准测试用户"""
    return {'id': 'test_user_001', 'username': 'testuser'}


@pytest.fixture
def auth_headers(test_user):
    """带JWT认证的请求头"""
    token = generate_test_token(test_user['id'])
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }


@pytest.fixture
def user_fresh():
    """大一测试用户"""
    return {'id': 'test_user_fresh', 'username': 'test_fresh'}


@pytest.fixture
def user_mid():
    """大二测试用户"""
    return {'id': 'test_user_mid', 'username': 'test_mid'}


@pytest.fixture
def user_grad():
    """大四测试用户"""
    return {'id': 'test_user_grad', 'username': 'test_grad'}


@pytest.fixture
def headers_fresh(user_fresh):
    token = generate_test_token(user_fresh['id'])
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


@pytest.fixture
def headers_mid(user_mid):
    token = generate_test_token(user_mid['id'])
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


@pytest.fixture
def headers_grad(user_grad):
    token = generate_test_token(user_grad['id'])
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
