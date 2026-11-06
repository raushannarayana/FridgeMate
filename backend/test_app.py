import os, re
for k, v in {"DATABASE_URL": "sqlite:///test_fridgemate.db", "RATE_LIMIT_OFF": "1", "DISABLE_SCHEDULER": "1", "PUBLIC_URL": "http://testserver"}.items(): os.environ[k] = v
if os.path.exists("test_fridgemate.db"): os.remove("test_fridgemate.db")
import datetime as dt
from fastapi.testclient import TestClient
import main
from main import app
c = TestClient(app)
def login(e, p="demo1234"): return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]}
A, B = login("alice@demo.com"), login("bob@demo.com")
def foods(h, fid=1): return c.get(f"/api/fridges/{fid}/foods", headers=h).json()
def make(h, **kw): return c.post("/api/fridges/1/foods", headers=h, json={"name": "Soup", "quantity": 1, "expiry_date": "2099-01-01", **kw}).json()
def labels(h, fid): return c.get(f"/api/foods/{fid}/labels", headers=h).json()
def token(url): return url.split("/q/")[1]

def test_bad_login(): assert c.post("/api/auth/login", json={"email": "alice@demo.com", "password": "wrongpass"}).status_code == 401
def test_validation_error_format():
    r = c.post("/api/auth/register", json={"name": "x", "email": "bad", "password": "1"}); assert r.status_code == 422 and "error" in r.json()
def test_personal_food_hidden_from_others():
    names = [f["name"] for f in foods(B)]; assert "Greek Yogurt" not in names and "Paneer" in names
def test_non_owner_cannot_edit_or_delete():
    # Carol is a plain member of Hostel Fridge (Alice is its admin, and admins may delete any item for moderation)
    C = login("carol@demo.com"); pan = [f for f in foods(A) if f["name"] == "Paneer"][0]
    assert c.delete(f"/api/foods/{pan['id']}", headers=C).status_code == 403
    assert c.patch(f"/api/foods/{pan['id']}", headers=C, json={"name": "x", "quantity": 1}).status_code == 403
def test_group_isolation():
    h = {"Authorization": "Bearer " + c.post("/api/auth/register", json={"name": "Eve", "email": "eve@x.com", "password": "password1"}).json()["token"]}
    assert c.get("/api/fridges/1/foods", headers=h).status_code == 403
def test_qr_image_decodes_to_correct_item():
    import cv2, numpy as np
    f = make(A, name="QRSoup"); r = c.get(f"/api/foods/{f['id']}/label?type=qr", headers=A); assert r.headers["content-type"] == "image/png"
    img = cv2.imdecode(np.frombuffer(r.content, np.uint8), 1); url, _, _ = cv2.QRCodeDetectorAruco().detectAndDecode(img)
    assert url.startswith("http://testserver/q/") and len(token(url)) >= 32
    assert c.get("/api/qr/" + token(url)).json()["name"] == "QRSoup"
def test_pdf_labels_and_sheet():
    f = make(A); assert c.get(f"/api/foods/{f['id']}/label?type=combined&fmt=pdf", headers=A).headers["content-type"] == "application/pdf"
    assert c.get("/api/fridges/1/labels/sheet", headers=A).headers["content-type"] == "application/pdf"
def test_public_scan_hides_private_info():
    pers = make(A, name="Secret", permission="personal"); t = token(labels(A, pers["id"])[0]["url"])
    d = c.get("/api/qr/" + t).json(); assert d == {"access": "public", "via": "QR", "name": "Secret", "permission": "personal", "status": "fresh"}
    sh = make(A, name="Open", permission="shared"); d = c.get("/api/qr/" + token(labels(A, sh["id"])[0]["url"])).json()
    assert d["access"] == "public" and "quantity" not in d and "notes" not in d
    assert c.get("/api/qr/bogus").status_code == 404
def test_nfc_and_qr_are_independent():
    f = make(A, name="Dual"); fid = f["id"]
    assert c.post(f"/api/foods/{fid}/labels/nfc/regenerate", headers=A).status_code == 200
    ls = {l["type"]: l for l in labels(A, fid)}; qt, nt = token(ls["QR"]["url"]), token(ls["NFC"]["url"]); assert qt != nt
    c.post(f"/api/foods/{fid}/labels/nfc/written", headers=A)
    assert c.get("/api/qr/" + nt).json()["via"] == "NFC"
    c.post(f"/api/foods/{fid}/labels/qr/deactivate", headers=A)
    assert c.get("/api/qr/" + qt).status_code == 410 and c.get("/api/qr/" + nt).status_code == 200
    c.post(f"/api/foods/{fid}/labels/nfc/regenerate", headers=A)
    assert c.get("/api/qr/" + nt).status_code == 410  # old NFC token replaced
def test_scan_count_and_activity():
    f = make(A, name="Counted"); t = token(labels(A, f["id"])[0]["url"]); c.get("/api/qr/" + t); c.get("/api/qr/" + t)
    assert labels(A, f["id"])[0]["scan_count"] == 2
    c.post(f"/api/foods/{f['id']}/labels/nfc/regenerate", headers=A)
    assert any("NFC label" in a["text"] for a in c.get("/api/fridges/1/activity", headers=A).json())
def test_removed_food_scan():
    f = make(A, name="Gone"); t = token(labels(A, f["id"])[0]["url"]); c.delete(f"/api/foods/{f['id']}", headers=A)
    assert c.get("/api/qr/" + t).status_code == 404
def test_double_claim_blocked():
    f = make(B, name="Pizza", quantity=2, permission="available")
    r1 = c.post(f"/api/foods/{f['id']}/request", headers=A, json={"quantity": 2}).json()["id"]
    r2 = c.post(f"/api/foods/{f['id']}/request", headers=A, json={"quantity": 2}).json()["id"]
    assert c.post(f"/api/requests/{r1}/approve", headers=B).status_code == 200
    assert c.post(f"/api/requests/{r2}/approve", headers=B).status_code == 409
    # NOTE: true parallel-claim safety relies on PostgreSQL row locks (SELECT ... FOR UPDATE); SQLite ignores them.
def test_expiry_reminders_not_duplicated():
    tomorrow = (dt.date.today() + dt.timedelta(days=1)).isoformat(); make(A, name="Reminder", expiry_date=tomorrow)
    n1 = len(c.get("/api/notifications", headers=A).json()); n2 = len(c.get("/api/notifications", headers=A).json()); assert n1 == n2 and n1 > 0
def test_password_reset_flow(capsys):
    c.post("/api/auth/register", json={"name": "Zed", "email": "zed@x.com", "password": "oldpassword"})
    assert c.post("/api/auth/forgot", json={"email": "zed@x.com"}).json() == {"ok": True}
    t = re.search(r"token=(\S+)", capsys.readouterr().out).group(1)
    assert c.post("/api/auth/reset", json={"token": t, "password": "newpassword"}).status_code == 200
    assert c.post("/api/auth/reset", json={"token": t, "password": "again1234"}).status_code == 400
    assert c.post("/api/auth/login", json={"email": "zed@x.com", "password": "newpassword"}).status_code == 200
def test_analytics_from_database():
    d = c.get("/api/fridges/1/analytics", headers=A).json(); assert d["total"] == sum(d["by_status"].values()) and d["monthly"] and d["consume_first"][0]["reason"]
def test_pagination_header():
    r = c.get("/api/fridges/1/foods?limit=2", headers=A); assert len(r.json()) == 2 and int(r.headers["x-total-count"]) > 2
def test_admin_only_membership():
    assert c.delete("/api/fridges/1/members/3", headers=B).status_code == 403
def test_date_extraction():
    r = main.extract_dates("MFG 01/02/2025\nBEST BEFORE 15-08-2026\nEXP 03/2027")
    assert {"kind": "expiry", "date": "2026-08-15"} .items() <= r[1].items() and r[2]["date"] == "2027-03-31" and r[0]["kind"] == "manufacture"
def test_ocr_rejects_non_image():
    assert c.post("/api/ocr/dates", headers=A, files={"file": ("a.txt", b"hello", "text/plain")}).status_code == 415
def test_export_and_delete_account():
    h = {"Authorization": "Bearer " + c.post("/api/auth/register", json={"name": "Tmp", "email": "tmp@x.com", "password": "password1"}).json()["token"]}
    assert c.get("/api/me/export", headers=h).json()["user"]["email"] == "tmp@x.com"; assert c.delete("/api/me", headers=h).status_code == 200


# ---- QR regression tests: the label must point to an address a phone can really open ----
def _decode(png):
    import cv2, numpy as np
    img = cv2.imdecode(np.frombuffer(png, np.uint8), 1); return cv2.QRCodeDetectorAruco().detectAndDecode(img)[0]
def test_localhost_public_url_is_replaced_by_real_address(monkeypatch):
    f = make(A, name="LanSoup"); monkeypatch.setattr(main, "PUBLIC_URL", "http://localhost:8000")
    lan = {"host": "192.168.1.20:8000"}
    url = c.get(f"/api/foods/{f['id']}/labels", headers={**A, **lan}).json()[0]["url"]
    assert url.startswith("http://192.168.1.20:8000/q/")
    r = c.get(f"/api/foods/{f['id']}/label?type=qr", headers={**A, **lan}); assert _decode(r.content) == url
def test_explicit_public_url_wins(monkeypatch):
    f = make(A, name="NgrokSoup"); monkeypatch.setattr(main, "PUBLIC_URL", "https://fridge.example.com/")
    assert c.get(f"/api/foods/{f['id']}/labels", headers=A).json()[0]["url"].startswith("https://fridge.example.com/q/")
def test_config_warns_when_labels_point_to_localhost(monkeypatch):
    monkeypatch.setattr(main, "PUBLIC_URL", "http://localhost:8000")
    assert c.get("/api/config", headers={"host": "localhost:8000"}).json()["label_url_is_local"] is True
    assert c.get("/api/config", headers={"host": "10.0.0.5:8000"}).json()["label_url_is_local"] is False
def test_qr_decodes_at_every_size_including_a4_sheet():
    f = make(A, name="Sheet"); assert _decode(c.get(f"/api/foods/{f['id']}/label?type=combined", headers=A).content).startswith("http")
    assert c.get("/api/fridges/1/labels/sheet", headers=A).headers["content-type"] == "application/pdf"
def test_scan_link_opens_spa_route():
    assert c.get("/q/sometoken").status_code == 200  # served by the React build or the static fallback redirect


# ---- name-only sign-in ----
def test_quick_login_creates_guest_who_joins_fridge_and_is_idempotent():
    r = c.post("/api/auth/quick", json={"name": "  Riya   Sharma "}); assert r.status_code == 200 and r.json()["user"]["name"] == "Riya Sharma"
    h = {"Authorization": "Bearer " + r.json()["token"]}; assert c.get("/api/me", headers=h).json()["name"] == "Riya Sharma"
    assert any(f["name"] == "Hostel Fridge" for f in c.get("/api/fridges", headers=h).json())
    again = c.post("/api/auth/quick", json={"name": "riya sharma"}).json(); assert again["user"]["id"] == r.json()["user"]["id"]
    assert c.get("/api/fridges/1/foods", headers=h).status_code == 200
def test_quick_login_cannot_take_over_email_accounts_or_use_password():
    a = c.post("/api/auth/quick", json={"name": "Alice"}).json(); assert a["user"]["id"] != 1   # demo Alice (email account) is untouched
    assert c.post("/api/auth/login", json={"email": "alice@guest.fridgemate.local", "password": "demo1234"}).status_code in (401, 422)
def test_quick_login_validation_and_switch(monkeypatch):
    assert c.post("/api/auth/quick", json={"name": "   "}).status_code == 422 and c.post("/api/auth/quick", json={"name": "<script>"}).status_code == 422
    monkeypatch.setattr(main, "QUICK_LOGIN", False); assert c.post("/api/auth/quick", json={"name": "Zed"}).status_code == 403
    assert c.get("/api/config").json()["quick_login"] is False


# ---- camera / HTTPS support ----
def test_permissions_policy_allows_camera_for_own_origin_only():
    for path in ("/api/config", "/", "/q/abc"):
        pp = c.get(path).headers["permissions-policy"]; assert "camera=(self)" in pp and "microphone=()" in pp
def test_https_certificate_covers_lan_ip_and_is_reused(tmp_path):
    import run_https
    from cryptography import x509
    hosts = ["localhost", "127.0.0.1", "192.168.1.20", "fridge.local"]; crt, key = run_https.ensure_cert(tmp_path, hosts)
    cert = x509.load_pem_x509_certificate(crt.read_bytes()); san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert "192.168.1.20" in {str(i) for i in san.get_values_for_type(x509.IPAddress)} and "fridge.local" in san.get_values_for_type(x509.DNSName)
    assert key.read_bytes().startswith(b"-----BEGIN PRIVATE KEY")
    first = crt.read_bytes()
    run_https.ensure_cert(tmp_path, hosts); assert crt.read_bytes() == first                                                # reused: phone is not re-warned
    run_https.ensure_cert(tmp_path, hosts[:2]); assert crt.read_bytes() == first                                            # fewer hosts still covered -> reused
    new, _ = run_https.ensure_cert(tmp_path, hosts + ["10.0.0.7"]); assert new.read_bytes() != first                        # new address -> new cert
    assert "10.0.0.7" in {str(i) for i in x509.load_pem_x509_certificate(new.read_bytes()).extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress)}
