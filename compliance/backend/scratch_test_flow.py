import urllib.request
import json

base_url = "http://localhost:8000"

def login():
    url = f"{base_url}/api/auth/login"
    data = json.dumps({"username": "bryant", "password": "password"}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            return res_data.get("token")
    except urllib.error.HTTPError as e:
        print("Login Failed:", e.code, e.read().decode('utf-8'))
        return None
    except Exception as e:
        print("Login Error:", e)
        return None

def test_get_signatures(token):
    url = f"{base_url}/api/signatures"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as response:
            print("GET Signatures Code:", response.getcode())
            print("Data:", response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print("GET Signatures Failed:", e.code, e.read().decode('utf-8'))
    except Exception as e:
        print("GET Signatures Error:", e)

def test_post_signatures(token):
    url = f"{base_url}/api/signatures"
    data = json.dumps({"name": "Test Company", "issue_date": "2026-08-18"}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as response:
            print("POST Signatures Code:", response.getcode())
            print("Data:", response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print("POST Signatures Failed:", e.code, e.read().decode('utf-8'))
    except Exception as e:
        print("POST Signatures Error:", e)

token = login()
if token:
    print("Logged in. Token retrieved.")
    test_get_signatures(token)
    test_post_signatures(token)
