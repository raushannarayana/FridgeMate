import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startScanLoop, type FrameDecoder } from "./qrscan";

describe("startScanLoop", () => {
  beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
  const video = { readyState: 4 } as HTMLVideoElement;
  it("reports each decoded text and never runs two decodes at once", async () => {
    let busy = 0, maxBusy = 0; const seen: string[] = [];
    const decoder: FrameDecoder = { mode: "js", decode: async () => { busy++; maxBusy = Math.max(maxBusy, busy); await new Promise((r) => setTimeout(r, 50)); busy--; return "hello"; } };
    const stop = startScanLoop(video, decoder, (t) => seen.push(t), 100); await vi.advanceTimersByTimeAsync(600); stop();
    expect(seen.length).toBeGreaterThan(2); expect(seen.every((t) => t === "hello")).toBe(true); expect(maxBusy).toBe(1);
  });
  it("stops when asked and survives a decoder that throws", async () => {
    let calls = 0; const decoder: FrameDecoder = { mode: "js", decode: async () => { calls++; throw new Error("bad frame"); } };
    const stop = startScanLoop(video, decoder, () => {}, 50); await vi.advanceTimersByTimeAsync(300); const n = calls; stop(); await vi.advanceTimersByTimeAsync(500);
    expect(n).toBeGreaterThan(2); expect(calls).toBeLessThanOrEqual(n + 1);
  });
  it("waits until the video has data", async () => {
    let calls = 0; const v = { readyState: 0 } as HTMLVideoElement; const stop = startScanLoop(v, { mode: "js", decode: async () => (++calls, null) }, () => {}, 50);
    await vi.advanceTimersByTimeAsync(300); expect(calls).toBe(0); (v as any).readyState = 4; await vi.advanceTimersByTimeAsync(300); stop(); expect(calls).toBeGreaterThan(0);
  });
});
