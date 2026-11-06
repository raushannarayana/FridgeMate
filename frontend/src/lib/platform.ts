import { Capacitor } from "@capacitor/core";

/** True only inside the installed Android app (Capacitor). On the website this is false and nothing below changes behaviour. */
export const isNative: boolean = Capacitor.isNativePlatform();

/**
 * Address of the FastAPI server.
 *  - Website: empty -> relative "/api/..." (the page and the API share one origin, exactly as before).
 *  - Android app: set VITE_API_BASE (in frontend/.env.android) to your deployed https address, e.g. https://fridgemate.example.com
 */
export const API_BASE: string = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").trim().replace(/\/+$/, "");

const toBase64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onerror = () => rej(r.error); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.readAsDataURL(b);
});

/** Android WebViews ignore <a download>. Save the file in the app cache and open the Android share sheet (Save to Drive / Files, WhatsApp, Print...). */
export async function saveAndShare(blob: Blob, filename: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const safe = filename.replace(/[^\w.\- ]+/g, "_") || "fridgemate-file";
  const { uri } = await Filesystem.writeFile({ path: safe, data: await toBase64(blob), directory: Directory.Cache });
  await Share.share({ title: safe, files: [uri], dialogTitle: "Save or share" });
}
