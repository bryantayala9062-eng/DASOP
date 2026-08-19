import urllib.request
import json

url = "http://localhost:8000/api/signatures"
try:
    data = json.dumps({"name": "test", "issue_date": "2026-08-18"}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as response:
        print("Status Code:", response.getcode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.reason)
    print("Response body:", e.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)
