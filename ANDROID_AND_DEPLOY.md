# FridgeMate: website + Android app from one project

One project, one FastAPI backend, one database:

```
Laptop browser  --->  https://YOUR-SERVER/        (React website, served by FastAPI, unchanged)
Android app     --->  https://YOUR-SERVER/api/... (same API; the app bundles the same React code)
                              |
                         FastAPI  ->  database (SQLite file on a persistent disk, or PostgreSQL)
```

The website keeps working exactly as before. The Android app is the same React code wrapped by Capacitor; it only needs to know the server address.

## 0. What was changed (nothing deleted)

| File | Change |
|---|---|
| `frontend/src/lib/platform.ts` (new) | `API_BASE` (server address; empty on the website) and `isNative` (true only inside the app); share-sheet saving for downloads |
| `frontend/src/lib/api.ts` | Calls `API_BASE + "/api/..."`; friendly "cannot reach server" error; label PNG/PDF and data export use the Android share sheet inside the app (browser download unchanged) |
| `frontend/src/lib/auth.tsx`, `pages/Layout.tsx` | A network error no longer logs you out; shows "Can't reach the server - Try again". Only a server rejection (401/403/404) logs out |
| `frontend/src/lib/camera.ts`, `pages/Scan.tsx` | Android-specific help text when camera permission is off. Scanner code is unchanged |
| `frontend/src/main.tsx` | No service worker inside the app |
| `frontend/capacitor.config.ts` (new) | App name FridgeMate, id `com.fridgemate.app`, https only |
| `frontend/scripts/patch-android.mjs` (new) | Adds camera permission, app name and icons to the generated Android project |
| `frontend/android-assets/` (new) | Launcher icons made from your `icon.svg` |
| `frontend/package.json` | Capacitor packages + scripts `android:add`, `android:sync`, `android:open`, `build:android` |
| `frontend/.env.android.example` (new) | Where you put your server address for the app |
| `backend/main.py` | CORS now also allows the Android app origin; demo accounts are created only when `DEMO_MODE=true`; refuses to start with the default `JWT_SECRET` when `DEMO_MODE=false`. Existing data is never touched |
| `Dockerfile`, `.dockerignore` (new) | Honours the host's `$PORT`; keeps databases and secrets out of the image |

`backend/frontend_dist` (the prebuilt website) was **not** rebuilt here. The old build still works. Docker builds the website from source automatically, so the online website includes the new code.

## 1. Deploy the backend (so nothing depends on your laptop)

Any host that runs a Docker image works (Render, Railway, Fly.io and similar). Check each host's current free-tier and disk terms yourself; they change.

1. Put this project in a Git repository (GitHub) or deploy with the host's CLI. The `Dockerfile` in the project root is all it needs.
2. Create a web service from the Dockerfile and set these environment variables:

| Variable | Value |
|---|---|
| `JWT_SECRET` | long random text: `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
| `DEMO_MODE` | `false` |
| `PUBLIC_URL` | your final address, e.g. `https://fridgemate.onrender.com` (printed inside QR labels) |
| `QUICK_LOGIN` | `true` keeps name-only sign-in; `false` is safer on the internet (see section 5) |
| `DATABASE_URL` | see step 3 |

3. **Database (must be persistent, otherwise data disappears on every restart):**
   - **Option A, keep SQLite (closest to today):** attach a persistent disk/volume mounted at `/data` and set `DATABASE_URL=sqlite:////data/fridgemate.db` (four slashes). Copy your existing `fridgemate.db` onto that disk before first start, using the host's file-copy or SSH feature. If a database file already exists the app never overwrites it.
   - **Option B, PostgreSQL:** create a managed Postgres database and set `DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST/DBNAME`. The image already contains the driver. Moving existing SQLite records into Postgres needs a one-off copy script; ask me and send your `.db` file.
4. Open `https://YOUR-SERVER/` in Chrome on your laptop: the website must load. Open `https://YOUR-SERVER/api/config`: you should see JSON, and `label_base_url` must be your https address (not localhost).

## 2. Build the Android APK (Android Studio)

You need: **Node.js 22+**, **Android Studio** (current release; it includes the JDK 21 that current Capacitor needs). Use the same Node on the command line as Android Studio's terminal.

```
cd fridgemate/frontend
npm install
copy .env.android.example .env.android        (macOS/Linux: cp .env.android.example .env.android)
```
Edit `.env.android`: `VITE_API_BASE=https://YOUR-SERVER` (https, no trailing slash).

```
npm run android:add      # creates the android/ folder, adds camera permission + name + icons, builds and syncs the web code
npm run android:open     # opens the project in Android Studio
```

In Android Studio:
1. Wait for **Gradle sync** to finish (first time it downloads a lot; accept any "install missing SDK" prompts).
2. Menu **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
3. Click **locate** in the popup. The file is `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
4. Rename it to **`FridgeMate.apk`**, copy it to your phone (USB, Drive, WhatsApp to yourself), tap it, and allow "Install unknown apps" for the app you opened it from.

Faster for testing: enable *Developer options > USB debugging* on the phone, connect it, pick it in Android Studio's device list and press the green **Run** button.

**After you change frontend code or the server address:** `npm run android:sync`, then build again. If you only change the backend, the app needs no rebuild.
The debug APK is fine for you and your friends. Publishing to Google Play needs a signed release build (**Build > Generate Signed Bundle / APK**) and a keystore you must back up.

## 3. Rebuilding the website (laptop)

Unchanged: `cd frontend && npm run build`, copy `frontend/dist` into `backend/frontend_dist`, run `uvicorn main:app` (or just redeploy the Docker image, which rebuilds it).

## 4. Test checklist (do both platforms separately)

**Laptop (Chrome)**
- [ ] `https://YOUR-SERVER/` loads; sign in; your old foods/accounts are there
- [ ] Add food, edit, delete; share request + approve with a second account
- [ ] Alerts page shows expiry reminders
- [ ] Scan page: *Start camera* works over https, or *Scan from photo* with a label image
- [ ] Download label PNG/PDF

**Android phone (APK)**
- [ ] App opens as "FridgeMate" with the green fridge icon
- [ ] Sign in with the same account as on the laptop; same foods appear (shared database)
- [ ] Add a food on the phone, refresh the laptop: it appears (and the reverse)
- [ ] Scan > Start camera: Android asks for camera permission, choose *While using the app*; point at a label: the food details open
- [ ] Label PNG/PDF: the Android share sheet opens
- [ ] Switch off Wi-Fi/data: "Can't reach the server" with Try again; you are not logged out

## 5. Security notes for a public server

- **Name-only sign-in:** anyone who types your name opens your profile. If accounts hold anything private, set `QUICK_LOGIN=false` and use email + password. Note: accounts that were created by name only have no password, so switch it off only after those users have email accounts.
- Keep `JWT_SECRET` secret and never put it in the Android app. `.env.android` holds only the public server address.
- Back up the database regularly (download the SQLite file, or use the Postgres host's backups).

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| App says "no server address" | `.env.android` missing or empty; set `VITE_API_BASE`, then `npm run android:sync` and rebuild |
| "Cannot reach the FridgeMate server" | Wrong address, server asleep (free hosts sleep; wait a minute and retry), or the phone is offline |
| Works on laptop, requests blocked in app | The server must be the version with the new CORS list (this project). Custom origin? set `CORS_ORIGINS` |
| Camera does not start | Android Settings > Apps > FridgeMate > Permissions > Camera > Allow. Check the manifest has `android.permission.CAMERA` (run `npm run android:sync`) |
| QR opens `localhost` when scanned by another phone | `PUBLIC_URL` is not set to your https address; regenerate labels afterwards |
| Gradle / JDK error | Android Studio > Settings > Build Tools > Gradle > Gradle JDK = the bundled JDK 21 |
| `cap add android` says android exists | Already created. Use `npm run android:sync` |
| Server will not start: JWT_SECRET message | Set `JWT_SECRET` (required whenever `DEMO_MODE=false`) |

## 7. Known limits

- Web NFC does not exist inside the Android app's WebView, so NFC writing/scanning stays a Chrome-on-Android website feature; QR works in both.
- The label dialog's *Print* button opens a browser print window and does not work inside the app. Use PNG/PDF and the share sheet (Print is available from there).
- Scanning a label with the phone's normal camera app opens the website in the browser, not the app.
