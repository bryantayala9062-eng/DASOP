import urllib.request
import urllib.parse
import urllib.error
import json
import traceback

print("Trying login...")
try:
    req = urllib.request.Request('http://localhost:8000/api/auth/login', 
                                 data=urllib.parse.urlencode({'username':'SuperUser', 'password':'123'}).encode('utf-8'))
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    resp = urllib.request.urlopen(req)
    token = json.loads(resp.read().decode('utf-8'))['access_token']
    print("Login successful.")
except urllib.error.HTTPError as e:
    print('LOGIN ERROR:', e.code, e.read().decode('utf-8'))
    exit(1)

print("Trying network endpoint...")
try:
    req2 = urllib.request.Request('http://localhost:8000/api/dashboard/analytics/network')
    req2.add_header('Authorization', 'Bearer ' + token)
    resp2 = urllib.request.urlopen(req2)
    print("Network successful:", len(resp2.read().decode('utf-8')))
except urllib.error.HTTPError as e:
    print('NETWORK ERROR:', e.code, e.read().decode('utf-8'))
