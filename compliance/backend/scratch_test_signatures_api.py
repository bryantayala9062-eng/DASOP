import urllib.request
import json

url = "http://localhost:8000/api/signatures"
try:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req) as response:
        print("Status Code:", response.getcode())
        data = json.loads(response.read().decode('utf-8'))
        print("Data length:", len(data))
except Exception as e:
    print("Error:", e)
