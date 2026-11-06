import type { CapacitorConfig } from "@capacitor/cli";

// The Android app bundles the built website (dist/) and talks to your deployed FastAPI server (VITE_API_BASE in .env.android).
// The website itself is unchanged and is still served by FastAPI.
const config: CapacitorConfig = {
  appId: "com.fridgemate.app",
  appName: "FridgeMate",
  webDir: "dist",
  android: { allowMixedContent: false }, // https only - never plain http to the server
  server: { androidScheme: "https" },     // the app runs at https://localhost (this origin is allowed by the backend's CORS list)
};
export default config;
