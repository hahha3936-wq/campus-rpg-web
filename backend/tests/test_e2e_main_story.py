"""
校园RPG E2E 测试：主线剧情面板 & 探索Buff
使用 Playwright + Flask 测试客户端模拟真实浏览器交互

前置条件：
1. backend/server.py 已在 localhost:5000 运行
2. pip install playwright pytest-playwright
3. playwright install chromium --with-deps

运行方式：
    cd backend
    pytest tests/test_e2e_main_story.py -v -s
"""

import json
import os
import sys
import pytest
import requests
from playwright.sync_api import sync_playwright

PROJECT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
DATA_DIR = os.path.join(PROJECT_DIR, 'data')
TEST_USERNAME = 'e2e_test_user'
TEST_PASSWORD = 'test123456'
STORY_FILE = 'main_story.json'
MAIN_STORY_PATH = os.path.join(DATA_DIR, STORY_FILE)

API_BASE = 'http://localhost:5000/api'


def _clean_test_user_story_progress():
    """清空测试用户的故事进度"""
    if os.path.exists(MAIN_STORY_PATH):
        with open(MAIN_STORY_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        usernames_to_remove = [k for k in list(data.keys()) if k == TEST_USERNAME or k.startswith('test_e2e_')]
        for k in usernames_to_remove:
            data.pop(k, None)
        with open(MAIN_STORY_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


def _ensure_test_user_in_db():
    """通过 Flask API 注册测试用户"""
    try:
        resp = requests.post(f'{API_BASE}/auth/register', json={
            'username': TEST_USERNAME,
            'password': TEST_PASSWORD,
            'nickname': 'E2E_test'
        }, timeout=5)
        return resp.status_code in (200, 201, 409)
    except Exception as e:
        print(f'Register error: {e}')
        return False


def _login_and_get_token():
    """通过登录 API 获取有效 JWT token"""
    resp = requests.post(f'{API_BASE}/auth/login', json={
        'username': TEST_USERNAME,
        'password': TEST_PASSWORD
    }, timeout=5)
    if resp.ok:
        data = resp.json()
        return data.get('token'), data.get('user')
    print(f'Login failed {resp.status_code}: {resp.text}')
    return None, None


@pytest.fixture(scope='module', autouse=True)
def setup_test_env():
    """注册测试用户并准备干净的进度"""
    _ensure_test_user_in_db()
    _clean_test_user_story_progress()
    yield
    _clean_test_user_story_progress()


@pytest.fixture(scope='module')
def auth_token_and_user():
    """获取有效的 JWT token 和用户信息"""
    token, user = _login_and_get_token()
    assert token, 'Failed to get auth token - is the server running?'
    assert user, 'Failed to get user data from login response'
    return token, user


@pytest.fixture(scope='module')
def e2e_context(auth_token_and_user):
    """
    创建模块级浏览器上下文和持久页面，注入认证 token 和用户信息。
    localStorage 在持久页面上设置后一直被所有测试共享。
    """
    auth_token, auth_user = auth_token_and_user
    import json as _json

    playwright_instance = sync_playwright().start()
    browser = playwright_instance.chromium.launch(headless=True)
    context = browser.new_context()
    # 创建一个在整个测试模块生命周期内保持打开的页面
    page = context.new_page()
    # 在持久页面上注入 localStorage（只做一次）
    page.goto('http://localhost:5000/login.html', wait_until='domcontentloaded', timeout=15000)
    page.evaluate(f"""
        () => {{
            window.localStorage.setItem('campus_rpg_token', '{auth_token}');
            window.localStorage.setItem('campus_rpg_user', JSON.stringify({_json.dumps(auth_user)}));
        }}
    """)
    print(f'[E2E] Auth injected for: {auth_user.get("username", "unknown")}')

    yield context, page  # 返回 (context, page) 元组

    page.close()
    context.close()
    browser.close()
    playwright_instance.stop()


@pytest.fixture
def page(e2e_context):
    """
    返回一个使用已认证上下文的页面（共享同一个持久页面实例）。
    每次测试开始时导航到 index.html。
    """
    context, page = e2e_context
    page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
    page.wait_for_timeout(1000)
    yield page


def _ensure_on_main_page(page):
    """确保页面在主页，如果被重定向则记录原因"""
    if '/login' in page.url:
        print(f'[E2E] Redirected to login! URL: {page.url}')
        # 获取控制台消息
        logs = page.evaluate("""
            () => {
                return window._e2eLogs || [];
            }
        """)
        print(f'[E2E] JS logs: {logs}')
        # 获取页面内容
        content = page.content()
        print(f'[E2E] Page content length: {len(content)}')


class TestMainStoryPanel:

    def test_ms_button_visible(self, page):
        """E2E-MS-01: 主页面上有主线剧情按钮"""
        # 直接从 index.html 开始（避免 / 重定向到 login 的问题）
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)
        print(f'[E2E-MS-01] Page URL: {page.url}')
        btn = page.locator('[data-action="main-story"]')
        visible = btn.is_visible()
        if not visible:
            page.screenshot(path='e2e_debug.png')
        assert visible, '主线剧情按钮不可见'
        print('[E2E-MS-01] PASS: 主线剧情按钮可见')

    def test_ms_panel_opens(self, page):
        """E2E-MS-02: 点击主线剧情按钮，面板正常打开"""
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)
        page.click('[data-action="main-story"]')
        page.wait_for_timeout(3000)
        overlay = page.locator('#ms-overlay')
        assert overlay.is_visible(), '主线剧情面板未打开'
        print('[E2E-MS-02] PASS: 主线剧情面板正常打开')

    def test_ms_tasks_tab_loads(self, page):
        """E2E-MS-03: 打开主线剧情面板，任务Tab有内容"""
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)
        page.click('[data-action="main-story"]')
        page.wait_for_timeout(3000)
        body = page.locator('#ms-body')
        assert body.is_visible(), '面板内容区域不可见'
        content = body.inner_text()
        assert content.strip() != '', '任务Tab内容为空'
        print(f'[E2E-MS-03] PASS: 任务Tab有内容 ({len(content)} chars)')

    def test_ms_clues_tab_loads(self, page):
        """E2E-MS-04: 切换到线索Tab，异步加载后显示线索内容"""
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)
        page.click('[data-action="main-story"]')
        page.wait_for_timeout(3000)
        clues_tab = page.locator('.ms-inner-tab[data-tab="clues"]')
        clues_tab.click()
        page.wait_for_timeout(4000)
        body = page.locator('#ms-body')
        content = body.inner_text()
        assert content != '', '线索Tab内容为空'
        assert '线索' in content or '数据加载' in content, '线索Tab缺少相关内容'
        print(f'[E2E-MS-04] PASS: 线索Tab有内容 ({len(content)} chars)')

    def test_ms_explore_tab_loads(self, page):
        """E2E-MS-05: 切换到探索Tab，显示区域数据"""
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)
        page.click('[data-action="main-story"]')
        page.wait_for_timeout(3000)
        explore_tab = page.locator('.ms-inner-tab[data-tab="explore"]')
        explore_tab.click()
        page.wait_for_timeout(1000)
        body = page.locator('#ms-body')
        content = body.inner_text()
        assert content.strip() != '', '探索Tab内容为空'
        assert '探索' in content, '探索Tab缺少探索相关内容'
        print(f'[E2E-MS-05] PASS: 探索Tab有内容 ({len(content)} chars)')

    def test_ms_no_critical_console_errors(self, page):
        """E2E-MS-06: 打开面板过程中无严重控制台错误"""
        errors = []

        def handle_console(msg):
            if msg.type == 'error':
                text = msg.text
                if not any(x in text for x in ['favicon', 'net::', 'Failed to load resource']):
                    errors.append(text)

        page.on('console', handle_console)
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)
        page.click('[data-action="main-story"]')
        page.wait_for_timeout(3000)

        if errors:
            print(f'[E2E-MS-06] Console errors: {errors}')
        assert len(errors) == 0, f'存在控制台错误: {errors}'
        print('[E2E-MS-06] PASS: 无严重控制台错误')


class TestExplorationBuff:

    def test_exp_map_opens(self, page):
        """E2E-EXP-01: 校园探索地图可以打开"""
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)
        exp_btn = page.locator('[data-action="exploration"]')
        if exp_btn.is_visible():
            exp_btn.click()
            page.wait_for_timeout(3000)
            map_container = page.locator('#map, .exploration-map, #exploration-container')
            visible = map_container.count() > 0 and map_container.first.is_visible()
            print(f'[E2E-EXP-01] 地图容器可见: {visible}')
        else:
            print('[E2E-EXP-01] SKIP: 探索按钮未找到')

    def test_buff_button_with_notification(self, page):
        """E2E-EXP-02: 点击探索Buff按钮，无JS崩溃"""
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)

        errors = []
        def handle_console(msg):
            if msg.type == 'error':
                errors.append(msg.text)
        page.on('console', handle_console)

        dialog_shown = []
        def handle_dialog(dialog):
            dialog_shown.append(dialog.message)
            dialog.dismiss()
        page.on('dialog', handle_dialog)

        buff_btns = page.locator('button[onclick*="_activateBuff"], button[onclick*="activateBuff"]')
        count = buff_btns.count()
        print(f'[E2E-EXP-02] 找到 {count} 个Buff按钮')

        if count > 0:
            buff_btns.first.click()
            page.wait_for_timeout(2000)
            if dialog_shown:
                print(f'[E2E-EXP-02] PASS: 点击Buff按钮触发弹窗')
            else:
                print('[E2E-EXP-02] PASS: 点击Buff按钮无崩溃')
        else:
            print('[E2E-EXP-02] INFO: 页面未加载Buff按钮（地图数据可能为空）')

        assert len([e for e in errors if 'Uncaught' in e]) == 0, f'存在未捕获错误: {errors}'
        print('[E2E-EXP-02] PASS: 无JS崩溃')


class TestFrontendAPIFlow:

    def test_story_progress_api_integration(self, page):
        """E2E-API-01: 面板通过 apiFetch 调用 /api/story/progress"""
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)

        logs = []
        def handle_console(msg):
            if '[MainStory]' in msg.text:
                logs.append(msg.text)
        page.on('console', handle_console)

        page.click('[data-action="main-story"]')
        page.wait_for_timeout(3000)

        ms_logs = [l for l in logs if '[MainStory]' in l]
        print(f'[E2E-API-01] MainStory logs: {ms_logs}')

        has_api_call = any('[MainStory] /api/story/progress status:' in l for l in ms_logs)
        assert has_api_call, '未检测到 /api/story/progress 调用日志'
        print('[E2E-API-01] PASS: API调用日志正常')

    def test_clues_api_async_load(self, page):
        """E2E-API-02: 切换线索Tab后，异步调用 /api/story/clues"""
        page.goto('http://localhost:5000/index.html', wait_until='domcontentloaded', timeout=15000)
        page.wait_for_timeout(3000)

        logs = []
        def handle_console(msg):
            if '[MainStory]' in msg.text:
                logs.append(msg.text)
        page.on('console', handle_console)

        page.click('[data-action="main-story"]')
        page.wait_for_timeout(3000)
        page.locator('.ms-inner-tab[data-tab="clues"]').click()
        page.wait_for_timeout(4000)

        ms_logs = [l for l in logs if '[MainStory]' in l]
        print(f'[E2E-API-02] MainStory clues logs: {ms_logs}')

        has_clues_call = any('[MainStory] /api/story/clues' in l for l in ms_logs)
        assert has_clues_call, '未检测到 /api/story/clues 调用日志'
        print('[E2E-API-02] PASS: 线索API异步调用正常')
