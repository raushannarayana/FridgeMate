# FridgeMate - Shared Refrigerator Management (QR-first, optional NFC)
Software-only project: React + TypeScript + Vite + Tailwind frontend, FastAPI + SQLAlchemy backend, PostgreSQL (Docker) or SQLite (local).
**QR is the primary identity system. NFC is an optional extra** - nothing depends on NFC hardware.

## What changed in v3/v4 (QR fixes, name sign-in, food pictures)
1. **QR pointed to `localhost`** (Docker/.env default) - phones could not open it. Labels now use the real address you opened the app with unless `PUBLIC_URL` is a real address; the label dialog warns if it is still local.
2. **Backend had no proxy-header support** behind ngrok/HTTPS proxies - Docker now starts uvicorn with `--proxy-headers`.
3. **Fallback page could not read a scanned QR** (it only understood `#/q/..`, the QR holds `/q/..`) and loaded its scanner from a CDN - fixed and bundled locally.
4. **React app was not prebuilt** - `backend/frontend_dist` is now included, so `uvicorn` alone serves the full app.
5. QR drawing: integer module size and a proper 4-module quiet zone (no blurry resampling); scanner: responsive scan box, single-fire, *Scan from photo* fallback.
6. TypeScript error fixed (`vite-env.d.ts`); stale test fixed; 5 new QR regression tests.
7. **New: name-only sign-in** (see *Signing in*) and **food pictures** (see *Food pictures*) in the React app and in the fallback page. 30 backend + 51 frontend tests pass.
8. **Camera scanner fixed for phones** (see *Phone testing*): `python run_https.py` serves the app over HTTPS, the rear camera opens, the whole frame is decoded live (small/tilted labels work), details load automatically, clear permission/HTTPS messages, `Permissions-Policy` header. The old library only decoded a ~130 px box.

## Android app + website (one project)
The same React code also builds an installable Android app (Capacitor) that uses the same backend and database as the website. See **ANDROID_AND_DEPLOY.md** for deployment, the APK build in Android Studio, and the test checklist.

## 1. Quick start
### Docker (PostgreSQL + backend + React, one command)
```
cp .env.example .env        # set JWT_SECRET, DB_PASSWORD, PUBLIC_URL
docker compose up --build   # open http://localhost:8000
```
Demo data is seeded automatically on first start (only if the database is empty - restarts never overwrite data).
### Without Docker
```
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000     # API + static fallback UI at :8000
cd frontend && npm install && npm run dev                                                    # React app at :5173 (proxies /api to :8000)
```
The React build is already included in `backend/frontend_dist`, so `uvicorn` alone serves the full app at :8000. To rebuild it after editing the frontend: `cd frontend && npm run build`, then copy `frontend/dist` to `backend/frontend_dist`.
If `frontend_dist` is absent, the original static page (`backend/static`) is served as a fallback.

### Signing in
**Just type your name** on the first screen and press Continue - no email or password needed. You join the shared fridge automatically, and typing the same name again (any device, any capitalisation) brings you back to the same profile and items.
Because a name is not a secret, anyone who types your name opens your profile. That is fine for a hostel/classroom/demo; for a private account use **Log in with email / Create an email account** instead. Real email accounts can never be reached by typing a name. Switch name-only sign-in off completely with `QUICK_LOGIN=false` in `.env`.
Optional demo email accounts (password `demo1234`): alice@demo.com (admin of Hostel Fridge, code `DEMO1234`), bob@demo.com, carol@demo.com (admin of Family Fridge, `FAMILY01`).

### Food pictures
Every item shows a picture chosen from its name: *milk* -> milk carton, *apple* -> apple, *eggs*, *bread*, *paneer*, *dahi*, *chicken*, *biryani*, *rice/atta/dal packs* and about 30 more (English and common Indian names). Unknown foods get a neutral grocery pack with the first letter, or a picture matching the category. Pictures are drawn in the app (inline SVG), so they work offline. Typing "milk" also pre-selects the *Dairy* category. To add a food, edit `RULES` in `frontend/src/components/FoodImage.tsx`.

Seed data: personal / shared / available items, expiring + expired items, ~60 days of consumption history, approved + pending sharing requests, notifications.

## 2. Tests
```
cd backend && pip install -r requirements-dev.txt && pytest      # API, QR decode, NFC labels, privacy, sharing, reminders, reset, OCR parsing
cd frontend && npm test                                          # Web NFC feature detection + write flow with a mocked NDEFReader
```
Camera scanning was tested with an emulated Android phone (Chrome, rear-camera request, HTTPS, permissions) and a simulated camera feed; it has not been verified on every physical phone model. Not covered by automated tests: parallel claims on PostgreSQL.

## 3. Phone testing - camera scanner over HTTPS (Android / iPhone)
**Why the camera said "Camera unavailable (it needs HTTPS or localhost)":** browsers hand out the camera only to secure pages. `http://192.168.x.x:8000` is not secure, so Chrome on the phone removes the camera API completely. Use HTTPS:

**Option A - built-in HTTPS (same Wi-Fi, nothing to install except `pip install -r requirements.txt`)**
1. On the computer: `cd backend`, then `python run_https.py`  (Windows: `py run_https.py`).
2. It prints addresses such as `https://192.168.1.20:8443` and a QR code. Open that address on the phone (same Wi-Fi). If Windows asks, allow Python through the firewall (private networks).
3. First visit only: Chrome says *Your connection is not private* (the certificate is your own, created in `backend/certs/`). Tap **Advanced -> Proceed to 192.168.1.20 (unsafe)**.
4. Type your name, open **Scan**, tap **Start camera**, tap **Allow**, and point the **rear camera** at a label. The food details open by themselves.
Your database and items are the same as with `uvicorn`; only the address changes. Use `--port 9443` to change the port. Labels you create while using the https address contain that address, so they open directly on phones. If you printed labels while using an old `http://` or `localhost` address, regenerate them.

**Option B - https tunnel (no certificate warning)**: `ngrok http 8000` (or `cloudflared tunnel --url http://localhost:8000`), open the `https://...` link it prints on the phone, and optionally set `PUBLIC_URL=https://<that-link>`. Use this for Docker too.

**Camera permission (Android Chrome):** the first time, tap *Allow*. If you tapped *Block*: tap the icon left of the address bar -> *Permissions* -> *Camera* -> *Allow*, then press *Start camera* again. The server also sends `Permissions-Policy: camera=(self)`.

**How scanning works now:** the whole camera frame is decoded at full resolution - the QR can be anywhere in view, small or tilted (the white box is only a guide). The phone's own barcode detector is used when it exists, with a built-in JavaScript decoder as backup. Only FridgeMate labels are accepted; any other QR shows a message and scanning continues. If the camera cannot be used there are always *Scan from photo* and the manual paste box.

**Troubleshooting:** *"needs HTTPS"* -> you opened an `http://` address; use Option A/B. *Phone cannot connect* -> same Wi-Fi? firewall? use the IP printed by `run_https.py`. *"Camera is busy"* -> close other apps/tabs using the camera. *Warning every time* -> normal for a self-signed certificate; use Option B to avoid it.

Labels encode `<origin>/q/<random 43-char token>`. The origin is `PUBLIC_URL` if it is a real address; if `PUBLIC_URL` is empty or `localhost`, the address you opened the app with is used (LAN IP, ngrok, domain). A QR that points to `localhost` can never open on a phone, so the label dialog shows a warning when that is the case. The phone's normal camera app can scan labels even over plain http.

## 4. Privacy model of a scan (QR and NFC identical)
| Viewer | Sees |
|---|---|
| Anyone, shared/available item | name, owner first name, permission, status, expiry |
| Anyone, personal item | name and status only |
| Logged-in member of that fridge | full details (personal items: owner only) |
Labels are bearer links: anyone who can see an active label can open its public view. Deactivate or regenerate if a label is lost.

## 5. NFC
Each food can have a QR label and an NFC label with **separate tokens** (independently deactivated/regenerated, each with scan count and last-scanned time). The tag stores **one URL record only**.
| Platform | Behaviour (verify on your own devices) |
|---|---|
| Android Chrome | Web NFC read + write on compatible phones, HTTPS required |
| iPhone | Tapping a tag written with a URL opens it natively; no Web NFC write/scan in the web app |
| Desktop | No general Web NFC support |
Buy NTAG213/215/216 NDEF stickers (NTAG213 is enough for a URL). **Permanent locking is NOT implemented** - Web NFC has no lock API; the UI says so instead of showing a fake lock button.
The **SIMULATED NFC TAP** button (demo mode only) calls the same lookup as a real tap and is clearly labelled - it is *not* a physical NFC test.
### Physical NFC test checklist (not yet performed by the author of this code)
- [ ] Chrome on Android over HTTPS, NFC on, create NFC label, "Write to NFC tag", hold an NTAG sticker -> success message
- [ ] Write to a tag that already has data -> overwrite confirmation appears
- [ ] Tap the written tag on the Android phone's home screen -> opens the item page
- [ ] Tap the same tag with an iPhone -> link banner opens the item page
- [ ] Regenerate NFC label -> old tag shows "replaced by a newer one"
- [ ] Deactivate NFC label -> tag shows "deactivated"; the QR label still works
- [ ] Try a tiny/locked tag -> clear error message

## 6. Architecture (viva-friendly)
Browser (React SPA, PWA) -> REST/JSON -> FastAPI -> SQLAlchemy -> PostgreSQL. APScheduler runs hourly expiry reminders. Pillow + qrcode draw labels. Tesseract (optional) reads package dates.
Every permission check is in the backend; the frontend only hides buttons. Single origin in production (FastAPI serves the built React app), so no CORS problems.
### Database / ER description
users 1-N refrigerator_members N-1 refrigerators; refrigerators 1-N food_items (owner -> users); food_items 1-N **food_labels** (type QR|NFC, token, status, scan_count); food_items 1-N sharing_requests (requester -> users);
users 1-N notifications (unique user+key = no duplicate reminders); refrigerators 1-N food_activity_logs; users 1-N password_resets. Timestamps are UTC; "today" is computed in the fridge's timezone (default Asia/Kolkata).
### Security summary
PBKDF2-SHA256 password hashes (200k iterations), JWT (7 days), per-route membership/ownership checks, random 256-bit label tokens, in-memory rate limits (login, register, reset, lookup, OCR), validated inputs (Pydantic), SQLAlchemy parameterised queries, image type/size checks, CORS allow-list, secrets via env vars, password-reset tokens stored hashed and never returned by the API.
### Main API (interactive docs at /docs)
`/api/auth/*`, `/api/me`, `/api/fridges`, `/api/fridges/{id}/foods|members|activity|analytics|requests|labels/sheet`, `/api/foods/{id}`, `/api/foods/{id}/label?type=qr|nfc|combined&fmt=png|pdf`,
`/api/foods/{id}/labels[/qr|nfc/regenerate|deactivate]`, `/api/foods/{id}/labels/nfc/written`, `/api/qr/{token}`, `/api/foods/{id}/request`, `/api/requests/{id}/approve|reject`, `/api/notifications`, `/api/ocr/dates`.
Errors share one shape: `{"detail": "...", "error": {"status": 403, "message": "..."}}`. Foods list is paginated (`limit`, `offset`, `X-Total-Count`).

## 7. Five-minute demo script
1. Landing page -> log in as Alice. 2. Dashboard: stats, charts, Consume First reasons. 3. Settings: invite code DEMO1234, members, roles.
4. Add food (Shared) -> label dialog opens. 5. Download PNG/PDF, print the 5x5 cm label, show the A4 sheet. 6. Scan the QR with a phone (ngrok URL): public view vs logged-in view; scan a *personal* item to show minimal info.
7. Create NFC label; write a tag on Android if you have one, otherwise use the clearly labelled SIMULATED tap. 8. Log in as Bob: request Alice's apples; Alice approves; quantities and notifications update. 9. Alerts: expiry reminders. 10. Analytics and waste-avoided estimate (explain it is an estimate).

## 8. Honest status (what has and has not been verified)
**The code was written in a sandbox with no network access, so neither the backend tests, the React build, nor Docker have been run by the author.** Only Python syntax checks and the OCR date-parsing logic were executed. Expect a few small fixes on first run. Please run the commands above and fix anything that fails before presenting.
| Feature | Status | Note |
|---|---|---|
| FastAPI backend, auth, groups, food CRUD, permissions | Written, untested here | tests included (`pytest`) |
| QR generate/print/scan, privacy rules | Written, untested here | includes a test that decodes the generated QR image |
| NFC labels (separate tokens, lifecycle, write/read UI) | Written, untested here | **not physically tested**; no real NTAG sticker used |
| Sharing + approval | Written, untested here | parallel-claim safety relies on PostgreSQL row locks; only a sequential double-claim is tested |
| Expiry reminders | Written, untested here | hourly job + on-read, DB-unique dedupe |
| OCR | Partial | needs Tesseract installed; date parsing verified; no sample-image test set; rotation correction not implemented |
| Analytics / Consume First | Written, untested here | computed from DB rows |
| React frontend, PWA | Written, untested here | tsconfig is non-strict; `npm run build` not run |
| Docker | Written, untested here | |
**Not built:** Alembic migrations (tables are created at startup), image upload for food photos, per-user notification preferences, optional virtual IoT monitor, ML waste prediction, permanent NFC locking, Redis-backed rate limiting, frontend component/responsive tests, a SIMULATED tap on the scan page (it is inside the label dialog).
Do not describe this as production-ready.
