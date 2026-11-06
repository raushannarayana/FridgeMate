import { isNative } from "./platform";
/** Why the camera cannot be used, with a message the person can act on. */
export type CameraProblem = { kind: "insecure" | "unsupported" | "denied" | "none" | "busy" | "other"; message: string };

export const HTTPS_PORT = 8443; // run_https.py default

/** Browsers only hand out the camera on https:// pages (or http://localhost). Plain http://192.168.x.x gets no camera at all. */
export function checkCameraSupport(): CameraProblem | null {
  if (!window.isSecureContext) {
    const host = window.location.hostname;
    return { kind: "insecure", message: `Your browser blocks the camera on plain http:// pages. Open FridgeMate over HTTPS: on the computer run "python run_https.py", then open https://${host}:${HTTPS_PORT} on this phone (or use an https tunnel such as ngrok). Until then, use "Scan from photo" or the box below.` };
  }
  if (!navigator.mediaDevices?.getUserMedia) return { kind: "unsupported", message: "This browser cannot use the camera. Try Chrome, or use \"Scan from photo\" or the box below." };
  return null;
}

export const DENIED_NATIVE_MESSAGE = "Camera permission is off for FridgeMate. Open Android Settings > Apps > FridgeMate > Permissions > Camera, choose Allow, then come back and press Start camera. You can also use \"Scan from photo\" or the box below.";
export const DENIED_MESSAGE = "Camera permission is blocked. In Chrome, tap the icon at the left of the address bar, choose Permissions, set Camera to Allow, then press Start camera again. You can also use \"Scan from photo\" or the box below.";

/** The denied-permission help that fits where the app is running (Android app vs browser). */
export const deniedMessage = () => (isNative ? DENIED_NATIVE_MESSAGE : DENIED_MESSAGE);

/** Turn whatever html5-qrcode / getUserMedia threw (an Error, a DOMException or a plain string) into a helpful message. */
export function describeCameraError(e: unknown): CameraProblem {
  const x = e as { name?: string; message?: string } | undefined; const text = `${x?.name ?? ""} ${x?.message ?? ""} ${String(e)}`;
  if (/NotAllowed|PermissionDenied|Permission denied|permission dismissed/i.test(text)) return { kind: "denied", message: deniedMessage() };
  if (/NotFound|DevicesNotFound|Requested device not found|no camera/i.test(text)) return { kind: "none", message: "No camera was found on this device. Use \"Scan from photo\" or the box below." };
  if (/NotReadable|TrackStart|Could not start video|in use|AbortError/i.test(text)) return { kind: "busy", message: "The camera is busy. Close other apps or browser tabs that are using it, then press Start camera again." };
  if (/SecurityError|secure context|getUserMedia.*undefined|mediaDevices/i.test(text)) return checkCameraSupport() ?? { kind: "insecure", message: "The browser blocked the camera for security reasons. Open the page over HTTPS." };
  return { kind: "other", message: `The camera could not be started (${(x?.message || String(e)).slice(0, 120)}). Use "Scan from photo" or the box below.` };
}

const fatal = (e: unknown) => ["denied", "busy", "insecure", "unsupported"].includes(describeCameraError(e).kind);
const REAR = /back|rear|environment|world|arri[eè]re|tr[aá]s|trasera/i;
const stopStream = (s?: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

/**
 * Open the phone's REAR camera. Tries, in order:
 *   1. facingMode exact "environment" (strictly the back camera, up to 1920x1080 so small labels are sharp)
 *   2. facingMode "environment" (preferred; also lets a laptop with only a webcam work)
 *   3. a camera chosen by name / position from the device list (labels exist once permission was granted)
 * It never retries after a permission / busy / insecure error - that would only spam the permission prompt.
 */
export async function openRearCamera(): Promise<{ stream: MediaStream; facing: string }> {
  const md = navigator.mediaDevices; const size = { width: { ideal: 1920 }, height: { ideal: 1080 } }; let last: unknown;
  const open = async (video: MediaTrackConstraints) => { const stream = await md.getUserMedia({ video, audio: false }); return { stream, facing: stream.getVideoTracks()[0]?.getSettings().facingMode ?? "unknown" }; };
  for (const video of [{ facingMode: { exact: "environment" }, ...size }, { facingMode: "environment", ...size }] as MediaTrackConstraints[]) {
    try { return await open(video); } catch (e) { last = e; if (fatal(e)) throw e; }
  }
  try {
    const cams = (await md.enumerateDevices()).filter((d) => d.kind === "videoinput"); if (!cams.length) throw last ?? new Error("NotFoundError");
    const cam = cams.find((c) => REAR.test(c.label)) ?? cams[cams.length - 1]; return await open({ deviceId: { exact: cam.deviceId }, ...size });
  } catch (e) { throw fatal(e) ? e : last ?? e; }
}
export { stopStream };
