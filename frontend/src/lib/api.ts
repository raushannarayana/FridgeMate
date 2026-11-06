import { API_BASE, isNative, saveAndShare } from "./platform";
export const tokenStore = { get: () => localStorage.getItem("fm_token"), set: (t: string) => localStorage.setItem("fm_token", t), clear: () => localStorage.removeItem("fm_token") };
export class ApiError extends Error { constructor(m: string, public status: number) { super(m); } }
export type Food = { id: number; fridge_id: number; name: string; category: string; quantity: number; unit: string; location: string; storage_date: string; expiry_date: string | null;
  expiry_type: string; permission: "personal" | "shared" | "available"; notes: string; owner: string; owner_id: number; status: string; qr_active: boolean; nfc_active: boolean; reason?: string };
export type Fridge = { id: number; name: string; role: "admin" | "member"; code: string | null; timezone: string };
export type LabelInfo = { id: number; type: "QR" | "NFC"; status: string; written_at: string | null; last_scanned: string | null; scan_count: number; url: string | null };
export async function api<T = any>(path: string, o: { method?: string; body?: unknown; form?: FormData; blob?: boolean } = {}): Promise<T> {
  const h: Record<string, string> = {}; const t = tokenStore.get(); if (t) h.Authorization = "Bearer " + t; if (o.body) h["Content-Type"] = "application/json";
  if (isNative && !API_BASE) throw new ApiError("This app has no server address. Rebuild it with VITE_API_BASE set (see ANDROID_AND_DEPLOY.md).", 0);
  let r: Response;
  try { r = await fetch(API_BASE + "/api" + path, { method: o.method, headers: h, body: o.form ?? (o.body ? JSON.stringify(o.body) : undefined) }); }
  catch { throw new ApiError("Cannot reach the FridgeMate server. Check your internet connection and try again.", 0); }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new ApiError(typeof e.detail === "string" ? e.detail : "Request failed", r.status); }
  return (o.blob ? await r.blob() : await r.json()) as T;
}
export async function download(path: string, filename: string) {
  const blob = await api<Blob>(path, { blob: true });
  if (isNative) return saveAndShare(blob, filename); // Android app: save + share sheet
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
/** Token from a scanned QR / pasted text, or null when it clearly is not a FridgeMate label (e.g. a website's QR code). */
export const labelToken = (text: string): string | null => { const m = text.match(/\/q\/([\w-]+)/); if (m) return m[1]; const t = text.trim(); return /^[\w-]{20,}$/.test(t) ? t : null; };
export const tokenFrom = (text: string) => (text.match(/\/q\/([\w-]+)/)?.[1] ?? text.trim());
