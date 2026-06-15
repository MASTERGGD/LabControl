def test_routes_in_app(client):
    routes = [r.path for r in client.app.routes if hasattr(r, 'path')]
    system_routes = [r for r in routes if 'system' in r]
    print("\nSystem routes in client.app:", system_routes)
    r = client.get("/system/health")
    print("Status:", r.status_code)
    assert r.status_code == 401
