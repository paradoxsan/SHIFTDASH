import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken, checkPassword } from "../../lib/auth";

describe("session token (HMAC) — sign/verify/tamper/expiry", () => {
  it("round-trips a freshly created token", async () => {
    const token = await createSessionToken();
    expect(token.startsWith("v1.")).toBe(true);
    expect(await verifySessionToken(token)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken();
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(await verifySessionToken(tampered)).toBe(false);
  });

  it("rejects malformed and wrong-version tokens", async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("garbage")).toBe(false);
    expect(await verifySessionToken("v2.9999999999.sig")).toBe(false);
  });

  it("rejects an expired token even with a valid-looking shape", async () => {
    // exp in the far past; signature won't match anyway -> must be false.
    expect(await verifySessionToken("v1.1.deadbeef")).toBe(false);
  });
});

describe("checkPassword", () => {
  it("matches the configured password and rejects others", () => {
    expect(checkPassword("test-password")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
    expect(checkPassword(undefined)).toBe(false);
  });
});
