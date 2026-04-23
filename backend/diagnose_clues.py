# -*- coding: utf-8 -*-
"""
Diagnostic script for /api/story/clues 404 issue.
Tests the clues endpoint and compares with /api/story/progress.
"""
import requests
import json
import sys

BASE_URL = 'http://127.0.0.1:5000'

def print_response(name, response):
    """Print all headers and body of a response."""
    print(f"\n{'='*60}")
    print(f"RESPONSE: {name}")
    print(f"{'='*60}")
    print(f"Status Code: {response.status_code}")
    print(f"\n--- HEADERS ---")
    for key, value in response.headers.items():
        print(f"  {key}: {value}")
    print(f"\n--- BODY ---")
    try:
        body_json = response.json()
        print(json.dumps(body_json, ensure_ascii=False, indent=2))
    except Exception:
        print(response.text)
    print(f"\n{'='*60}\n")


def main():
    print("="*60)
    print("DIAGNOSTIC: Testing /api/story/clues vs /api/story/progress")
    print("="*60)

    session = requests.Session()

    # Step 1: Register test user
    print("\n[1] Registering test user...")
    register_data = {
        'username': 'diag_test_user',
        'password': 'diag123456',
        'nickname': 'DiagTest'
    }
    try:
        resp = session.post(f'{BASE_URL}/api/auth/register', json=register_data)
        print(f"Register status: {resp.status_code}")
        if resp.status_code in (200, 201):
            print("User registered successfully")
        elif resp.status_code == 409:
            print("User already exists, continuing with login...")
        else:
            print(f"Register failed: {resp.text}")
    except Exception as e:
        print(f"Register request failed: {e}")
        return

    # Step 2: Login to get JWT token
    print("\n[2] Logging in to get JWT token...")
    login_data = {
        'username': 'diag_test_user',
        'password': 'diag123456'
    }
    try:
        resp = session.post(f'{BASE_URL}/api/auth/login', json=login_data)
        print(f"Login status: {resp.status_code}")
        if resp.ok:
            login_json = resp.json()
            token = login_json.get('token')
            print(f"Token obtained: {token[:50]}..." if token else "No token in response!")
        else:
            print(f"Login failed: {resp.text}")
            return
    except Exception as e:
        print(f"Login request failed: {e}")
        return

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    # Step 3: Test /api/story/progress (baseline - should work)
    print("\n[3] Testing /api/story/progress (baseline)...")
    try:
        resp = session.get(f'{BASE_URL}/api/story/progress', headers=headers)
        print_response("/api/story/progress", resp)
    except Exception as e:
        print(f"Progress request failed: {e}")

    # Step 4: Test /api/story/clues (the problematic endpoint)
    print("\n[4] Testing /api/story/clues (problematic endpoint)...")
    try:
        resp = session.get(f'{BASE_URL}/api/story/clues', headers=headers)
        print_response("/api/story/clues", resp)
    except Exception as e:
        print(f"Clues request failed: {e}")

    # Step 5: Check /api/health to confirm server is running
    print("\n[5] Checking server health...")
    try:
        resp = session.get(f'{BASE_URL}/api/health')
        print(f"Health check status: {resp.status_code}")
        print(f"Response: {resp.json()}")
    except Exception as e:
        print(f"Health check failed: {e}")

    # Step 6: Try to print URL map by importing server module
    print("\n[6] Attempting to print URL map from server module...")
    try:
        # Try to import the server module and print its URL rules
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else '.')

        # We'll try to read the rules by calling a special endpoint
        # that lists all routes
        print("\nFetching all routes via Werkzeug...")
        from werkzeug.routing import Map

        # Alternative: Try to introspect by calling an undocumented endpoint
        # or check what routes are actually registered
        resp = session.get(f'{BASE_URL}/api/story/')
        print(f"\n/api/story/ root check: {resp.status_code}")
        if resp.status_code == 404:
            print("  -> /api/story/ returns 404 (endpoint not registered)")
        elif resp.ok:
            print(f"  -> Response: {resp.text[:200]}")

        # Check if /api/story/stages exists (another story endpoint)
        resp = session.get(f'{BASE_URL}/api/story/stages', headers=headers)
        print(f"\n/api/story/stages check: {resp.status_code}")
        if resp.status_code == 404:
            print("  -> /api/story/stages returns 404")
        elif resp.ok:
            print(f"  -> Response OK (length: {len(resp.text)})")

        # List all routes by trying common patterns
        print("\nChecking common story sub-endpoints:")
        story_endpoints = [
            '/api/story/clues',  # This is the problematic one
            '/api/story/progress',  # This should work
            '/api/story/stages',
            '/api/story/accept',
            '/api/story/reset',
            '/api/story/puzzles',
            '/api/story/hidden',
            '/api/story/choices',
            '/api/story/branch/check',
        ]

        for endpoint in story_endpoints:
            try:
                resp = session.get(f'{BASE_URL}{endpoint}', headers=headers, timeout=5)
                status = resp.status_code
                marker = "✓" if status == 200 else "✗"
                print(f"  {marker} {endpoint}: {status}")
            except Exception as e:
                print(f"  ✗ {endpoint}: ERROR - {e}")

    except Exception as e:
        print(f"Could not get URL map: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "="*60)
    print("DIAGNOSTIC COMPLETE")
    print("="*60)


if __name__ == '__main__':
    import os
    main()
