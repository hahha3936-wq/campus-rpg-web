"""
Chat Widget Mobile Adaptation Test
Tests mobile layout, bottom sheet, toggle visibility, and functionality.
"""
import json
import requests
from playwright.sync_api import sync_playwright

TEST_USERNAME = 'mobile_test_user'
TEST_PASSWORD = 'test123456'
API_BASE = 'http://localhost:5000/api'
PAGE_URL = 'http://localhost:5000/index.html'

IPHONE_11 = {'deviceName': 'iPhone 11'}
IPHONE_SE = {'deviceName': 'iPhone SE'}
PIXEL_5 = {'deviceName': 'Pixel 5'}


def _auth():
    requests.post(f'{API_BASE}/auth/register', json={
        'username': TEST_USERNAME, 'password': TEST_PASSWORD, 'nickname': 'MobileTest'
    }, timeout=60)
    resp = requests.post(f'{API_BASE}/auth/login', json={
        'username': TEST_USERNAME, 'password': TEST_PASSWORD
    }, timeout=60)
    return resp.json().get('token') if resp.ok else None, resp.json().get('user') if resp.ok else None


def _check_server():
    try:
        return requests.get('http://localhost:5000/index.html', timeout=60).status_code == 200
    except:
        return False


def _setup_page(context, token, user):
    page = context.new_page()
    js_errors = []
    page.on('pageerror', lambda err: js_errors.append(str(err)))

    page.goto('http://localhost:5000/login.html', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(500)
    page.evaluate(f"""
        localStorage.setItem('campus_rpg_token', '{token}');
        localStorage.setItem('campus_rpg_user', JSON.stringify({json.dumps(user)}));
        localStorage.setItem('campus_rpg_newbie_done', 'true');
        localStorage.setItem('campus_rpg_onboarding_seen', 'true');
        localStorage.removeItem('chat-widget-pos');
    """)

    import time
    ts = int(time.time())
    page.goto(f'{PAGE_URL}?t={ts}', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)
    page.evaluate("""
        () => {
            const overlays = ['newbie-overlay', 'onboarding-overlay', 'ms-overlay', 'ach-unlock-overlay', 'sd-overlay', 'sp-overlay', 'su-overlay', 'npc-eco-overlay'];
            overlays.forEach(id => document.getElementById(id)?.remove());
        }
    """)
    page.wait_for_timeout(500)
    return page, js_errors


def _dismiss_overlays(page):
    page.evaluate("""
        () => {
            const overlays = ['newbie-overlay', 'onboarding-overlay', 'ms-overlay', 'ach-unlock-overlay', 'sd-overlay', 'sp-overlay', 'su-overlay', 'npc-eco-overlay'];
            overlays.forEach(id => document.getElementById(id)?.remove());
        }
    """)
    page.wait_for_timeout(300)


def test_device(name, device):
    print(f"\n{'='*50}")
    print(f"Testing: {name}")
    print(f"{'='*50}\n")
    if not _check_server():
        print(f"FAIL [{name}]: Server not running")
        return False

    token, user = _auth()
    if not token:
        print(f"FAIL [{name}]: Auth")
        return False

    passed = 0
    failed = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(**device)
        page, js_errors = _setup_page(context, token, user)

        viewport_w, viewport_h = 414, 896
        print(f"  Viewport: {viewport_w}x{viewport_h}")

        widget = page.locator('#chat-widget-window')
        toggle = page.locator('#chat-widget-toggle')
        page_btn = page.locator('button.btn-ai-guide')
        input_field = page.locator('#chat-input')
        send_btn = page.locator('#chat-send-btn')
        mobile_close = page.locator('#chat-mobile-close-btn')

        # T1: Toggle visible at default position
        print("  T1: Toggle visible at bottom-right...")
        box = toggle.bounding_box()
        if box:
            # On mobile, should be at bottom-right (right: 16px, bottom: 16px from edge)
            right_dist = viewport['width'] - (box['x'] + box['width'])
            bottom_dist = viewport['height'] - (box['y'] + box['height'])
            print(f"    Toggle: x={box['x']:.0f}, y={box['y']:.0f}, right_dist={right_dist:.0f}, bottom_dist={bottom_dist:.0f}")
            if right_dist < 100 and bottom_dist < 100:
                print(f"    PASS")
                passed += 1
            else:
                print(f"    FAIL: Toggle not at bottom-right")
                failed += 1
        else:
            print(f"    FAIL: Toggle not visible")
            failed += 1

        # T2: Page button opens widget
        print("  T2: Page button opens widget...")
        page_btn.first.click()
        page.wait_for_timeout(800)

        styles = page.evaluate("""
            () => {
                const w = document.getElementById('chat-widget-window');
                const cs = window.getComputedStyle(w);
                return { width: cs.width, height: cs.height, right: cs.right, bottom: cs.bottom, borderRadius: cs.borderRadius };
            }
        """)
        print(f"    Widget styles: {styles}")
        if '100vw' in styles['width'] or styles['width'].startswith(viewport['width']):
            print(f"    PASS: Widget is full-width on mobile")
            passed += 1
        else:
            print(f"    WARN: Widget width={styles['width']} (expected 100vw = {viewport['width']})")
            failed += 1

        # T3: Toggle hidden when widget open
        print("  T3: Toggle hidden when widget open...")
        toggle_visible = toggle.is_visible()
        print(f"    Toggle visible: {toggle_visible}")
        if not toggle_visible:
            print(f"    PASS: Toggle hidden behind bottom sheet")
            passed += 1
        else:
            print(f"    FAIL: Toggle should be hidden")
            failed += 1

        # T4: Mobile close button visible
        print("  T4: Mobile close button visible...")
        if mobile_close.count():
            mc_visible = mobile_close.first.is_visible()
            print(f"    Mobile close button visible: {mc_visible}")
            if mc_visible:
                print(f"    PASS")
                passed += 1
            else:
                print(f"    FAIL")
                failed += 1
        else:
            print(f"    FAIL: Mobile close button not found in DOM")
            failed += 1

        # T5: Input field usable
        print("  T5: Input field focusable...")
        if input_field.count():
            input_field.first.click()
            page.wait_for_timeout(300)
            focused = page.evaluate("document.activeElement.id")
            print(f"    Focused element: {focused}")
            if focused == 'chat-input':
                print(f"    PASS: Input field can be focused")
                passed += 1
            else:
                print(f"    FAIL: Input not focused")
                failed += 1
        else:
            print(f"    FAIL: Input field not found")
            failed += 1

        # T6: Mobile close button closes widget
        print("  T6: Mobile close button closes widget...")
        _dismiss_overlays(page)
        mobile_close.first.click()
        page.wait_for_timeout(500)
        if not widget.is_visible():
            print(f"    PASS: Widget closed")
            passed += 1
        else:
            print(f"    FAIL: Widget did not close")
            failed += 1

        # T7: Toggle visible after closing via mobile close
        print("  T7: Toggle visible after close...")
        if toggle.is_visible():
            print(f"    PASS: Toggle visible again")
            passed += 1
        else:
            print(f"    FAIL: Toggle not visible after close")
            failed += 1

        # T8: Toggle click opens widget (mobile)
        print("  T8: Toggle click opens widget...")
        toggle.first.click()
        page.wait_for_timeout(500)
        if widget.is_visible():
            print(f"    PASS")
            passed += 1
        else:
            print(f"    FAIL: Widget did not open via toggle")
            failed += 1

        # T9: No JS errors
        print("  T9: No JS errors...")
        if not js_errors:
            print(f"    PASS")
            passed += 1
        else:
            print(f"    FAIL: {js_errors[:2]}")
            failed += 1

        browser.close()

    print(f"\n  [{name}] Result: {passed} passed, {failed} failed")
    return failed == 0


def test_landscape():
    print(f"\n{'='*50}")
    print(f"Testing: iPhone landscape (375x268)")
    print(f"{'='*50}\n")
    if not _check_server():
        print(f"FAIL: Server not running")
        return False

    token, user = _auth()
    if not token:
        print(f"FAIL: Auth")
        return False

    passed = 0
    failed = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={'width': 375, 'height': 268})
        page, js_errors = _setup_page(context, token, user)

        widget = page.locator('#chat-widget-window')
        toggle = page.locator('#chat-widget-toggle')

        # T10: Landscape widget takes full screen
        print("  T10: Landscape widget takes full screen...")
        page.locator('button.btn-ai-guide').first.click()
        page.wait_for_timeout(800)

        styles = page.evaluate("""
            () => {
                const w = document.getElementById('chat-widget-window');
                const cs = window.getComputedStyle(w);
                return { width: cs.width, height: cs.height, borderRadius: cs.borderRadius };
            }
        """)
        print(f"    Widget styles: {styles}")
        if styles['width'] in ['375px', '100vw'] and styles['height'] in ['268px', '100vh']:
            print(f"    PASS")
            passed += 1
        else:
            print(f"    WARN: Widget not full screen (expected 375x268)")
            failed += 1

        # T11: Toggle hidden in landscape
        print("  T11: Toggle hidden in landscape...")
        if not toggle.is_visible():
            print(f"    PASS")
            passed += 1
        else:
            print(f"    FAIL: Toggle should be hidden in landscape")
            failed += 1

        browser.close()

    print(f"\n  [Landscape] Result: {passed} passed, {failed} failed")
    return failed == 0


def main():
    results = []
    results.append(('iPhone 11', test_device('iPhone 11', {'viewport': {'width': 414, 'height': 896}})))
    results.append(('iPhone SE', test_device('iPhone SE', {'viewport': {'width': 375, 'height': 667}})))
    results.append(('iPhone landscape', test_landscape()))

    print(f"\n{'='*50}")
    print("OVERALL RESULTS")
    print(f"{'='*50}")
    for name, ok in results:
        print(f"  {name}: {'PASS' if ok else 'FAIL'}")
    print(f"{'='*50}")


if __name__ == '__main__':
    main()
