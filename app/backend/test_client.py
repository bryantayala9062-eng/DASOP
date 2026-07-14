from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
try:
    resp = client.post("/api/auth/login", data={"username": "SuperUser", "password": "123"})
    token = resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    
    print("Testing network...")
    r1 = client.get("/api/dashboard/analytics/network", headers=headers)
    print("NETWORK:", r1.status_code, r1.text[:100])
    
    print("Testing risk-carrusel...")
    r2 = client.get("/api/dashboard/analytics/risk-carrusel", headers=headers)
    print("CARRUSEL:", r2.status_code, r2.text[:100])

    print("Testing risk-efos...")
    r3 = client.get("/api/dashboard/analytics/risk-efos", headers=headers)
    print("EFOS:", r3.status_code, r3.text[:100])
    
except Exception as e:
    import traceback
    traceback.print_exc()
