import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { anthropicHeaders, thinkingFor } from "@/lib/ai/anthropic";

const KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("anthropicHeaders", () => {
  it("refuses to build a request with no credential at all", () => {
    expect(() => anthropicHeaders()).toThrow();
  });

  it("sends a console API key as x-api-key", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-xxx";
    const h = anthropicHeaders();
    expect(h["x-api-key"]).toBe("sk-ant-api03-xxx");
    expect(h.authorization).toBeUndefined();
  });

  it("sends any other credential as a bearer token", () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "gateway-token";
    const h = anthropicHeaders();
    expect(h.authorization).toBe("Bearer gateway-token");
    expect(h["x-api-key"]).toBeUndefined();
    expect(h["anthropic-beta"]).toBeUndefined();
  });

  // A subscription OAuth token is rejected as an unknown key without this beta
  // header, which makes the failure look like a bad credential.
  it("adds the oauth beta header for a subscription token", () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "sk-ant-oat01-xxx";
    expect(anthropicHeaders()["anthropic-beta"]).toBe("oauth-2025-04-20");
  });

  it("prefers the bearer token when both are set, so a token overrides the key", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-xxx";
    process.env.ANTHROPIC_AUTH_TOKEN = "sk-ant-oat01-xxx";
    const h = anthropicHeaders();
    expect(h.authorization).toBe("Bearer sk-ant-oat01-xxx");
    expect(h["x-api-key"]).toBeUndefined();
  });
});

describe("thinkingFor", () => {
  it("keeps the thinking budget below max_tokens at every level", () => {
    for (const effort of ["low", "medium", "high", "xhigh", "nonsense"]) {
      const { budget, maxTokens } = thinkingFor(effort);
      expect(budget, effort).toBeLessThan(maxTokens);
    }
  });

  it("turns thinking off only at low effort", () => {
    expect(thinkingFor("low").budget).toBe(0);
    for (const effort of ["medium", "high", "xhigh"]) {
      expect(thinkingFor(effort).budget, effort).toBeGreaterThan(0);
    }
  });

  it("deepens monotonically, and an unknown level gets the deepest", () => {
    expect(thinkingFor("medium").budget).toBeLessThan(thinkingFor("high").budget);
    expect(thinkingFor("high").budget).toBeLessThan(thinkingFor("xhigh").budget);
    expect(thinkingFor("typo")).toEqual(thinkingFor("xhigh"));
  });
});
