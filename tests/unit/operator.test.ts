import { describe, it, expect } from "vitest";
import {
  requeueEligibility,
  chaseEligibility,
  chaseMessage,
  chatIdToWhapiTo,
  DEFAULT_MAX_ATTEMPTS,
} from "../../lib/services/operator";

describe("operator — requeue eligibility (failed/error only, attempts-capped)", () => {
  it("requeues a failed/error row under the attempts cap", () => {
    expect(requeueEligibility({ status: "failed", attempts: 2 })).toEqual({ eligible: true });
    expect(requeueEligibility({ status: "error", attempts: 0 }).eligible).toBe(true);
  });

  it("refuses a healthy row (new/done)", () => {
    expect(requeueEligibility({ status: "new", attempts: 0 }).eligible).toBe(false);
    expect(requeueEligibility({ status: "done", attempts: 0 }).eligible).toBe(false);
  });

  it("does NOT auto-requeue a 'processing' row (no double-processing an in-flight row)", () => {
    // inbox has no processing-start timestamp, so 'processing' is never inferred
    // as stuck — it would risk re-running an actively in-flight message.
    expect(requeueEligibility({ status: "processing", attempts: 1 }).eligible).toBe(false);
  });

  it("enforces the attempts cap", () => {
    const r = requeueEligibility({ status: "failed", attempts: DEFAULT_MAX_ATTEMPTS });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/cap/);
  });
});

describe("operator — chase eligibility (open + link + no human takeover)", () => {
  it("allows an open order with a link and no human", () => {
    expect(chaseEligibility({ status: "open", hasLink: true, humanActive: false })).toEqual({
      eligible: true,
    });
  });
  it("refuses when a human took over the chat", () => {
    const r = chaseEligibility({ status: "open", hasLink: true, humanActive: true });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/human/);
  });
  it("refuses a non-open order or one without a link", () => {
    expect(chaseEligibility({ status: "paid", hasLink: true, humanActive: false }).eligible).toBe(false);
    expect(chaseEligibility({ status: "open", hasLink: false, humanActive: false }).eligible).toBe(false);
  });
});

describe("operator — message + chat id helpers", () => {
  it("builds a Hebrew reminder with name, amount, and the link", () => {
    const msg = chaseMessage({ invoiceName: "דני", total: 350, paymentLink: "https://pay/x" });
    expect(msg).toContain("דני");
    expect(msg).toContain("350₪");
    expect(msg).toContain("https://pay/x");
  });
  it("omits name/amount gracefully when missing", () => {
    const msg = chaseMessage({ invoiceName: null, total: null, paymentLink: "https://pay/y" });
    expect(msg).toContain("https://pay/y");
    expect(msg).not.toContain("undefined");
  });
  it("passes a chat id through unchanged (already a WHAPI id)", () => {
    expect(chatIdToWhapiTo(" 972507828242@s.whatsapp.net ")).toBe("972507828242@s.whatsapp.net");
  });
});
