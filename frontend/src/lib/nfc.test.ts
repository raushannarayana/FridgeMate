import { describe, it, expect, vi, beforeEach } from "vitest";
import { supportsWebNfc, nfcErrorMessage, writeNfcUrl } from "./nfc";
function mockReader(records: any[], write = vi.fn().mockResolvedValue(undefined)) {
  (window as any).NDEFReader = class { l: any = {}; addEventListener(n: string, f: any) { this.l[n] = f; } async scan() { setTimeout(() => this.l.reading?.({ message: { records } }), 0); } write = write; };
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true }); return write;
}
beforeEach(() => { delete (window as any).NDEFReader; });
describe("Web NFC feature detection", () => {
  it("is unsupported when NDEFReader is missing", () => { Object.defineProperty(window, "isSecureContext", { value: true, configurable: true }); expect(supportsWebNfc()).toBe(false); });
  it("is unsupported on insecure origins", () => { mockReader([]); Object.defineProperty(window, "isSecureContext", { value: false, configurable: true }); expect(supportsWebNfc()).toBe(false); });
  it("is supported with NDEFReader over HTTPS", () => { mockReader([]); expect(supportsWebNfc()).toBe(true); });
});
describe("writeNfcUrl", () => {
  it("writes exactly one url record to an empty tag", async () => {
    const w = mockReader([]); await writeNfcUrl("https://x.test/q/abc", async () => true);
    expect(w).toHaveBeenCalledWith({ records: [{ recordType: "url", data: "https://x.test/q/abc" }] }, { overwrite: true });
  });
  it("asks before overwriting and does not write when declined", async () => {
    const w = mockReader([{ recordType: "url", data: new TextEncoder().encode("https://old") }]);
    await expect(writeNfcUrl("https://x.test/q/abc", async () => false)).rejects.toThrow(/Cancelled/); expect(w).not.toHaveBeenCalled();
  });
  it("propagates write failures", async () => {
    const e = Object.assign(new Error("x"), { name: "NetworkError" }); mockReader([], vi.fn().mockRejectedValue(e));
    await expect(writeNfcUrl("u", async () => true)).rejects.toMatchObject({ name: "NetworkError" });
  });
  it("rejects with NotSupportedError when unsupported", async () => { await expect(writeNfcUrl("u", async () => true)).rejects.toMatchObject({ name: "NotSupportedError" }); });
});
describe("nfcErrorMessage", () => {
  it("explains permission errors", () => expect(nfcErrorMessage({ name: "NotAllowedError" })).toMatch(/permission/i));
  it("explains disabled NFC", () => expect(nfcErrorMessage({ name: "NotSupportedError" })).toMatch(/switched off/i));
});
