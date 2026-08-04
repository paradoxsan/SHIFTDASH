import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptWithKey, decryptWithKey } from "../../lib/secrets";

describe("secrets — AES-256-GCM encryption at rest (Phase 4)", () => {
  const key = randomBytes(32);

  it("round-trips a plaintext secret", () => {
    const secret = "service_role_eyJhbGciOiJIUzI1NiIs.super.secret";
    const enc = encryptWithKey(secret, key);
    expect(decryptWithKey(enc, key)).toBe(secret);
  });

  it("stores only ciphertext — the plaintext never appears in the payload", () => {
    const secret = "PLAINTEXT-NEEDLE-12345";
    const enc = encryptWithKey(secret, key);
    expect(enc.ciphertext).not.toContain(secret);
    expect(enc.nonce).not.toContain(secret);
    // ciphertext + nonce are base64
    expect(enc.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(enc.nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("uses a fresh nonce each call (same input → different ciphertext)", () => {
    const a = encryptWithKey("same", key);
    const b = encryptWithKey("same", key);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails authentication when decrypted with the wrong key", () => {
    const enc = encryptWithKey("secret", key);
    expect(() => decryptWithKey(enc, randomBytes(32))).toThrow();
  });

  it("fails authentication when the ciphertext is tampered with", () => {
    const enc = encryptWithKey("secret", key);
    const raw = Buffer.from(enc.ciphertext, "base64");
    raw[0] ^= 0xff; // flip a bit
    expect(() => decryptWithKey({ ...enc, ciphertext: raw.toString("base64") }, key)).toThrow();
  });

  it("rejects a non-32-byte key", () => {
    expect(() => encryptWithKey("x", randomBytes(16))).toThrow(/32 bytes/);
  });
});
