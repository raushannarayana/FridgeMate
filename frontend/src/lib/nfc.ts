// Web NFC helpers. Web NFC works only in Chrome on Android over HTTPS. iPhone can tap-to-open tags natively, but cannot use Web NFC.
export const supportsWebNfc = () => typeof window !== "undefined" && "NDEFReader" in window && window.isSecureContext === true;
const err = (name: string, message: string) => Object.assign(new Error(message), { name });
export function nfcErrorMessage(e: any): string {
  switch (e?.name) {
    case "NotAllowedError": return "NFC permission was denied. Allow NFC for this site in Chrome's site settings and try again.";
    case "NotSupportedError": return "NFC is unavailable or switched off on this device. Turn NFC on in system settings.";
    case "NotReadableError": return "The tag could not be read. Hold it steady against the back of the phone and retry.";
    case "NetworkError": return "Write failed: the tag moved away, is read-only/locked, or is too small. Retry or use another NTAG tag.";
    case "AbortError": return "NFC action cancelled.";
    default: return e?.message || "Unknown NFC error";
  }
}
export function readOnce(timeoutMs = 30000) {
  return new Promise<{ count: number; urls: string[] }>((resolve, reject) => {
    const r = new (window as any).NDEFReader(); const ctl = new AbortController();
    const to = setTimeout(() => { ctl.abort(); reject(err("AbortError", "Timed out waiting for a tag")); }, timeoutMs);
    r.addEventListener("reading", (e: any) => { clearTimeout(to); ctl.abort(); const recs: any[] = e.message.records;
      resolve({ count: recs.length, urls: recs.filter((x) => x.recordType === "url").map((x) => new TextDecoder().decode(x.data)) }); }, { once: true });
    r.addEventListener("readingerror", () => { clearTimeout(to); ctl.abort(); reject(err("NotReadableError", "Unreadable tag")); }, { once: true });
    r.scan({ signal: ctl.signal }).catch((e: any) => { clearTimeout(to); reject(e); });
  });
}
/** Writes exactly ONE url record. Nothing private is ever put on the tag. Asks before overwriting existing data. */
export async function writeNfcUrl(url: string, confirmOverwrite: () => Promise<boolean>) {
  if (!supportsWebNfc()) throw err("NotSupportedError", "Web NFC is not supported on this browser/device");
  const existing = await readOnce();
  if (existing.count > 0 && !(await confirmOverwrite())) throw err("AbortError", "Cancelled - the tag was not changed");
  await new (window as any).NDEFReader().write({ records: [{ recordType: "url", data: url }] }, { overwrite: true });
}
export async function scanNfcOnce(): Promise<string> {
  if (!supportsWebNfc()) throw err("NotSupportedError", "Web NFC is not supported on this browser/device");
  const r = await readOnce(); if (!r.urls[0]) throw err("NotReadableError", "This tag has no FridgeMate link"); return r.urls[0];
}
