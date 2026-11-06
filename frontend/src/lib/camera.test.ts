import { afterEach, describe, expect, it } from "vitest";
import { checkCameraSupport, describeCameraError } from "./camera";
import { labelToken } from "./api";

describe("labelToken", () => {
  const T = "Dak184g4nlJEf59zxcpDBg_DHEW9yzJM1c8eDOobnT4";
  it.each([[`https://192.168.1.20:8443/q/${T}`, T], [`http://localhost:8000/q/${T}?x=1`, T], [`https://abc.ngrok.app/#/q/${T}`, T], [`  ${T}  `, T]])("%s", (i, o) => expect(labelToken(i)).toBe(o));
  it("rejects QR codes that are not FridgeMate labels", () => { for (const x of ["https://example.com", "hello world", "WIFI:T:WPA;S:home;;", "12345", ""]) expect(labelToken(x)).toBeNull(); });
});
describe("describeCameraError", () => {
  it.each([[{ name: "NotAllowedError", message: "Permission denied" }, "denied"], ["Error getting userMedia, error = NotAllowedError: Permission denied", "denied"],
    [{ name: "NotFoundError" }, "none"], [{ name: "NotReadableError", message: "Could not start video source" }, "busy"], [new Error("boom"), "other"]])("%j -> %s", (e, k) => expect(describeCameraError(e).kind).toBe(k));
  it("denied message tells the person exactly what to tap", () => expect(describeCameraError({ name: "NotAllowedError" }).message).toMatch(/Permissions.*Camera.*Allow/));
});
describe("checkCameraSupport", () => {
  const orig = Object.getOwnPropertyDescriptor(window, "isSecureContext");
  afterEach(() => { if (orig) Object.defineProperty(window, "isSecureContext", orig); });
  it("explains HTTPS when the page is not a secure context", () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true }); const p = checkCameraSupport();
    expect(p?.kind).toBe("insecure"); expect(p?.message).toMatch(/run_https\.py/); expect(p?.message).toMatch(/https:\/\/.+:8443/);
  });
});
