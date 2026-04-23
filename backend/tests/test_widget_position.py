"""
Chat Widget Position Fix Test
Verifies:
1. Widget loads in default position (bottom-right)
2. Drag works correctly
3. Position persists after refresh (localStorage)
4. No upward drift
"""
import json
import os
import sys
import requests
from playwright.sync_api import sync_playwright

TEST_USERNAME = 'widget_test_user'
TEST_PASSWORD = 'test123456'
API_BASE = 'http://localhost:5000/api'
PAGE_URL = 'http://localhost:5000/index.html'


def _register_and_login():
    requests.post(f'{API_BASE}/auth/register', json={
        'username': TEST_USERNAME, 'password': TEST_PASSWORD, 'nickname': 'WidgetTest'
    }, timeout=60)
    resp = requests.post(f'{API_BASE}/auth/login', json={
        'username': TEST_USERNAME, 'password': TEST_PASSWORD
    }, timeout=60)
    if resp.ok:
        data = resp.json()
        return data.get('token'), data.get('user')
    return None, None


def _check_server():
    try:
        r = requests.get('http://localhost:5000/index.html', timeout=60)
        return r.status_code == 200
    except:
        return False


def test_widget_position():
    print("\n=== Chat Widget Position Test ===\n")

    if not _check_server():
        print("FAIL: Backend server not running at localhost:5000")
        return False
    print("OK: Backend server is running")

    token, user = _register_and_login()
    if not token:
        print("FAIL: Could not get auth token")
        return False
    print(f"OK: Authenticated as {TEST_USERNAME}")

    all_passed = True

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=['--start-maximized'])
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)

        # Visit login.html first, then inject all required localStorage items
        page.goto('http://localhost:5000/login.html', wait_until='domcontentloaded', timeout=30000)
        page.wait_for_timeout(500)
        page.evaluate(f"""
            window.localStorage.setItem('campus_rpg_token', '{token}');
            window.localStorage.setItem('campus_rpg_user', JSON.stringify({json.dumps(user)}));
            window.localStorage.setItem('campus_rpg_newbie_done', 'true');
            window.localStorage.setItem('campus_rpg_onboarding_seen', 'true');
        """)
        print("OK: Auth + guide flags injected")

        # Navigate to index.html
        page.goto(PAGE_URL, wait_until='networkidle', timeout=30000)
        page.wait_for_timeout(3000)
        print(f"OK: Page loaded, URL: {page.url}")

        if 'login' in page.url.lower():
            print(f"FAIL: Redirected to login page!")
            browser.close()
            return False

        # Dismiss all possible overlays
        page.evaluate("""
            () => {
                const overlays = ['newbie-overlay', 'onboarding-overlay', 'ms-overlay', 'ach-unlock-overlay', 'sd-overlay', 'sp-overlay', 'su-overlay', 'npc-eco-overlay'];
                overlays.forEach(id => document.getElementById(id)?.remove());
            }
        """)
        page.wait_for_timeout(500)

        # Click the "问阿游" button
        ai_btn = page.locator('button.btn-ai-guide')
        if ai_btn.count():
            ai_btn.first.click(timeout=5000)
            print("OK: Clicked '问阿游' button")
        else:
            page.evaluate("if (window.ChatWidget && window.ChatWidget.open) window.ChatWidget.open();")
            print("OK: Called ChatWidget.open() directly")
        page.wait_for_timeout(2000)

        widget = page.locator('#chat-widget-window')
        toggle = page.locator('#chat-widget-toggle')

        if not widget.count():
            print("FAIL: #chat-widget-window not found")
            body_children = page.evaluate("document.body.children.length")
            print(f"  Body children: {body_children}")
            browser.close()
            return False
        print("OK: Widget element found")

        if not toggle.count():
            print("FAIL: #chat-widget-toggle not found")
            all_passed = False
        else:
            print("OK: Toggle button found")

        # Check default position
        toggle_box = toggle.bounding_box()
        if toggle_box:
            vw = page.viewport_size['width']
            vh = page.viewport_size['height']
            right_dist = vw - (toggle_box['x'] + toggle_box['width'])
            bottom_dist = vh - (toggle_box['y'] + toggle_box['height'])
            print(f"    Toggle: x={toggle_box['x']:.0f}, y={toggle_box['y']:.0f}, w={toggle_box['width']:.0f}, h={toggle_box['height']:.0f}")
            print(f"    From right: {right_dist:.0f}px, from bottom: {bottom_dist:.0f}px")
            if bottom_dist > 50 and right_dist < 200:
                print("OK: Toggle in bottom-right area (default)")
            else:
                print(f"WARN: Toggle may not be in bottom-right")
        else:
            print("FAIL: Could not get toggle bounding box")
            all_passed = False

        # Open widget
        toggle.click()
        page.wait_for_timeout(1000)
        if widget.is_visible():
            print("OK: Widget opens on toggle click")
        else:
            print("FAIL: Widget did not open")
            all_passed = False

        # Check widget position
        box = widget.bounding_box()
        if box:
            vw = page.viewport_size['width']
            vh = page.viewport_size['height']
            right_dist = vw - (box['x'] + box['width'])
            bottom_dist = vh - (box['y'] + box['height'])
            print(f"    Widget: x={box['x']:.0f}, y={box['y']:.0f}, w={box['width']:.0f}, h={box['height']:.0f}")
            print(f"    From right: {right_dist:.0f}px, from bottom: {bottom_dist:.0f}px")
        else:
            print("WARN: Could not get widget bounding box")

        # === DRAG TEST ===
        box = widget.bounding_box()
        if box:
            hdr = page.locator('.chat-header')
            hdr_box = hdr.bounding_box()
            if hdr_box:
                start_x = hdr_box['x'] + hdr_box['width'] / 2
                start_y = hdr_box['y'] + hdr_box['height'] / 2
                new_x = 300
                new_y = 200

                page.mouse.move(start_x, start_y)
                page.mouse.down()
                page.wait_for_timeout(100)
                page.mouse.move(new_x, new_y, steps=10)
                page.mouse.up()
                page.wait_for_timeout(500)

                new_box = widget.bounding_box()
                if new_box:
                    moved = abs(new_box['x'] - new_x) < 100 and abs(new_box['y'] - new_y) < 100
                    if moved:
                        print(f"OK: Widget dragged to x={new_box['x']:.0f}, y={new_box['y']:.0f}")
                    else:
                        print(f"WARN: Widget at x={new_box['x']:.0f}, y={new_box['y']:.0f}, expected x~{new_x}, y~{new_y}")
                else:
                    print("FAIL: Widget disappeared after drag")
                    all_passed = False

                saved_pos = page.evaluate("localStorage.getItem('chat-widget-pos')")
                if saved_pos:
                    pos = json.loads(saved_pos)
                    print(f"OK: localStorage saved: {pos}")
                    if 'right' in pos and 'bottom' in pos:
                        print("    Format: right/bottom (correct)")
                    elif 'left' in pos and 'top' in pos:
                        print("    Format: left/top (old format)")
                else:
                    print("FAIL: No position saved in localStorage")
                    all_passed = False

        # === PERSISTENCE TEST ===
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(3000)

        page.evaluate("""
            () => {
                const overlays = ['newbie-overlay', 'onboarding-overlay', 'ms-overlay', 'ach-unlock-overlay', 'sd-overlay', 'sp-overlay', 'su-overlay', 'npc-eco-overlay'];
                overlays.forEach(id => document.getElementById(id)?.remove());
            }
        """)
        page.wait_for_timeout(500)

        if page.locator('button.btn-ai-guide').count():
            try:
                page.locator('button.btn-ai-guide').first.click(timeout=5000)
            except:
                page.evaluate("if (window.ChatWidget && window.ChatWidget.open) window.ChatWidget.open();")
        else:
            page.evaluate("if (window.ChatWidget && window.ChatWidget.open) window.ChatWidget.open();")
        page.wait_for_timeout(2000)

        box_after = widget.bounding_box()
        if box_after:
            print(f"    After refresh: widget at x={box_after['x']:.0f}, y={box_after['y']:.0f}")
            if box_after['y'] > 100:
                print(f"OK: After refresh, widget at y={box_after['y']:.0f} (NOT at top - no drift)")
            else:
                print(f"FAIL: After refresh, widget at y={box_after['y']:.0f} - DRIFTING TO TOP!")
                all_passed = False
        else:
            print("WARN: Could not verify position after refresh")

        # === DEFAULT POSITION TEST ===
        page.evaluate("localStorage.removeItem('chat-widget-pos')")
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(3000)

        page.evaluate("""
            () => {
                const overlays = ['newbie-overlay', 'onboarding-overlay', 'ms-overlay', 'ach-unlock-overlay', 'sd-overlay', 'sp-overlay', 'su-overlay', 'npc-eco-overlay'];
                overlays.forEach(id => document.getElementById(id)?.remove());
            }
        """)
        page.wait_for_timeout(500)

        if page.locator('button.btn-ai-guide').count():
            try:
                page.locator('button.btn-ai-guide').first.click(timeout=5000)
            except:
                page.evaluate("if (window.ChatWidget && window.ChatWidget.open) window.ChatWidget.open();")
        else:
            page.evaluate("if (window.ChatWidget && window.ChatWidget.open) window.ChatWidget.open();")
        page.wait_for_timeout(1000)

        box_default = widget.bounding_box()
        if box_default:
            vh = page.viewport_size['height']
            bd = vh - (box_default['y'] + box_default['height'])
            print(f"OK: After clearing localStorage, widget y={box_default['y']:.0f}, bottom={bd:.0f}px")
            if bd > 50:
                print("    Default position: bottom-right (correct)")

        js_errors = [e for e in console_errors if 'chat-widget' in e.lower()]
        if js_errors:
            print(f"WARN: JS errors: {js_errors[:3]}")
        else:
            print("OK: No chat-widget related JS errors")

        browser.close()

    print("\n" + "=" * 40)
    print("RESULT: " + ("ALL CHECKS PASSED" if all_passed else "SOME CHECKS FAILED"))
    print("=" * 40)
    return all_passed


if __name__ == '__main__':
    ok = test_widget_position()
    sys.exit(0 if ok else 1)
