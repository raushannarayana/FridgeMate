// Run after `cap add android` (npm run android:add / android:sync do this for you). Safe to run many times.
//  1. Camera permission in AndroidManifest.xml  (needed for the QR scanner)
//  2. App name "FridgeMate"
//  3. FridgeMate launcher icons (from android-assets/res)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "android/app/src/main/res");
const manifestPath = path.join(root, "android/app/src/main/AndroidManifest.xml");
if (!fs.existsSync(manifestPath)) { console.error("android/ not found. Run: npm run android:add"); process.exit(1); }

// 1. permissions ---------------------------------------------------------------------------------------------------
let m = fs.readFileSync(manifestPath, "utf8");
const add = (needle, line) => { if (!m.includes(needle)) { m = m.replace("</manifest>", `    ${line}\n</manifest>`); console.log("manifest: added", needle); } };
add('android.permission.INTERNET', '<uses-permission android:name="android.permission.INTERNET" />');
add('android.permission.CAMERA', '<uses-permission android:name="android.permission.CAMERA" />');
// required=false: phones without a rear camera can still install the app (they use "Scan from photo")
add('android.hardware.camera"', '<uses-feature android:name="android.hardware.camera" android:required="false" />');
add('android.hardware.camera.autofocus', '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />');
fs.writeFileSync(manifestPath, m);

// 2. app name ------------------------------------------------------------------------------------------------------
const strings = path.join(res, "values/strings.xml");
fs.mkdirSync(path.dirname(strings), { recursive: true });
fs.writeFileSync(strings, `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">FridgeMate</string>
    <string name="title_activity_main">FridgeMate</string>
    <string name="package_name">com.fridgemate.app</string>
    <string name="custom_url_scheme">com.fridgemate.app</string>
</resources>
`);

// 3. icons ---------------------------------------------------------------------------------------------------------
const src = path.join(root, "android-assets/res");
for (const d of fs.readdirSync(src)) {
  const to = path.join(res, d); fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(to)) if (/^ic_launcher(_round|_foreground)?\.(png|webp)$/.test(f)) fs.rmSync(path.join(to, f)); // avoid duplicate resources
  for (const f of fs.readdirSync(path.join(src, d))) fs.copyFileSync(path.join(src, d, f), path.join(to, f));
}
fs.writeFileSync(path.join(res, "values/ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#16A34A</color>
</resources>
`);
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
const any26 = path.join(res, "mipmap-anydpi-v26"); fs.mkdirSync(any26, { recursive: true });
fs.writeFileSync(path.join(any26, "ic_launcher.xml"), adaptive); fs.writeFileSync(path.join(any26, "ic_launcher_round.xml"), adaptive);
console.log("FridgeMate Android project patched: camera permission, app name, icons.");
