import jsQR from "jsqr";

/**
 * Live QR decoding of the WHOLE camera frame at (nearly) full resolution.
 *
 * Why not just html5-qrcode's live scanner? It copies the on-screen scan box (~130x130 px on a phone) into a canvas and decodes
 * that, so the camera's resolution never matters and a printed label has to fill almost the whole box. Here every frame is decoded
 * at full size, so a small label held 20-30 cm away works.
 *
 * Two decoders, used together:
 *  1. the browser's native BarcodeDetector (Android Chrome has it; very fast and tolerant of blur), if available;
 *  2. jsQR (pure JavaScript, works everywhere) - always runs when the native one finds nothing or fails,
 *     so a missing/broken native detector can never leave the scanner dead.
 */
export type FrameDecoder = { mode: "native+js" | "js"; decode: (video: HTMLVideoElement) => Promise<string | null> };
type NativeDetector = { detect: (src: CanvasImageSource) => Promise<{ rawValue?: string }[]> };

export async function createDecoder(): Promise<FrameDecoder> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  let native: NativeDetector | null = null;
  if (BD) { try { const f = (await BD.getSupportedFormats?.()) ?? ["qr_code"]; if (f.includes("qr_code")) native = new BD({ formats: ["qr_code"] }); } catch { native = null; } }
  const cv = document.createElement("canvas"); const g = cv.getContext("2d", { willReadFrequently: true }); let n = 0;
  const viaJs = (v: HTMLVideoElement): string | null => {
    const vw = v.videoWidth, vh = v.videoHeight; if (!vw || !vh || !g) return null;
    const max = ++n % 2 ? 1280 : 640; // alternate: a fast low-res pass (big, close QR) and a full-res pass (small, distant QR)
    const k = Math.min(1, max / Math.max(vw, vh)); cv.width = Math.round(vw * k); cv.height = Math.round(vh * k); g.drawImage(v, 0, 0, cv.width, cv.height);
    const im = g.getImageData(0, 0, cv.width, cv.height); return jsQR(im.data, im.width, im.height, { inversionAttempts: "dontInvert" })?.data || null;
  };
  return { mode: native ? "native+js" : "js", decode: async (v) => {
    if (native) { try { const r = await native.detect(v); const t = r.find((x) => x.rawValue)?.rawValue; if (t) return t; } catch { native = null; } } // broken native detector -> JS only from now on
    return viaJs(v);
  } };
}

/** Decode frames one after another (never overlapping) until the returned stop() is called. */
export function startScanLoop(video: HTMLVideoElement, decoder: FrameDecoder, onText: (text: string) => void, intervalMs = 100) {
  let alive = true;
  (async () => {
    while (alive) {
      const t0 = performance.now();
      try { if (video.readyState >= 2) { const text = await decoder.decode(video); if (text && alive) onText(text); } } catch { /* a bad frame is not fatal */ }
      await new Promise((r) => setTimeout(r, Math.max(30, intervalMs - (performance.now() - t0))));
    }
  })();
  return () => { alive = false; };
}
