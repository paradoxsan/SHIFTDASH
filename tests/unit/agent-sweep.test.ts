// The sweep's parser is where an expensive lesson lives: a machine-readable tag
// that the prompt asks for "when relevant" is skipped by every model tier about
// a third of the time. So the block is required on EVERY run with an explicit
// all-clear form, and — critically — a MISSING block is a sweep failure, never
// silence-means-healthy. A monitor that quietly stops reporting looks exactly
// like one reporting good news.
import { describe, it, expect } from "vitest";
import {
  parseSweep,
  severityFor,
  dedupKeyFor,
  MAX_FINDINGS,
  SWEEP_PREFIX,
  SWEEP_INSTRUCTIONS,
} from "../../lib/ai/sweep";

function block(fields: Record<string, string>): string {
  return `[FINDING]\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n[/FINDING]`;
}

describe("parseSweep — the all-clear vs no-answer distinction", () => {
  it("treats a MISSING block as a failed sweep, not as all-clear", () => {
    const r = parseSweep("הכל נראה תקין, אין בעיות אצל אף לקוח.");
    expect(r.reported).toBe(false);
    expect(r.findings).toHaveLength(0);
  });

  it("treats the explicit NONE block as a reported all-clear", () => {
    const r = parseSweep(block({ client: "-", code: "NONE", level: "warn", headline: "הכל תקין" }));
    expect(r.reported).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it("recognises all-clear by CODE, not by the headline wording", () => {
    // A reworded or translated headline must not turn an all-clear into an alert.
    const r = parseSweep(
      block({ client: "-", code: "none", level: "crit", headline: "everything is broken" })
    );
    expect(r.reported).toBe(true);
    expect(r.findings).toHaveLength(0);
  });
});

describe("parseSweep — findings", () => {
  it("extracts one finding with all fields", () => {
    const r = parseSweep(
      `סיכום הסריקה:\n${block({
        client: "brjewelry",
        code: "CREDENTIAL_EXPIRED",
        level: "crit",
        headline: "ה-credential של Google Sheets פג",
      })}`
    );
    expect(r.findings).toEqual([
      {
        client: "brjewelry",
        code: "CREDENTIAL_EXPIRED",
        level: "crit",
        headline: "ה-credential של Google Sheets פג",
      },
    ]);
  });

  it("extracts several findings from one answer", () => {
    const r = parseSweep(
      block({ client: "t-center", code: "WORKFLOW_OFF", level: "warn", headline: "א" }) +
        "\nוגם:\n" +
        block({ client: "brjewelry", code: "HIGH_ERROR_RATE", level: "crit", headline: "ב" })
    );
    expect(r.findings.map((f) => f.client)).toEqual(["t-center", "brjewelry"]);
  });

  it("maps a missing or '-' client to an agency-level finding", () => {
    const r = parseSweep(block({ client: "-", code: "N8N_DOWN", level: "crit", headline: "x" }));
    expect(r.findings[0].client).toBeNull();
  });

  it("IGNORES the model's client field when the caller knows which agent replied", () => {
    // The real failure this prevents, seen in a live dry run: one agent's answer
    // named another customer's workflow, and the finding landed on that
    // customer's row. `brjewelry` is a valid slug, so no code check could catch
    // it — the fix is that attribution is never the model's to state.
    const r = parseSweep(
      block({ client: "brjewelry", code: "HIGH_ERROR_RATE", level: "crit", headline: "SDR נופל" }),
      "shift-digital"
    );
    expect(r.findings[0].client).toBe("shift-digital");
  });

  it("still honours an explicit agency-level force of null", () => {
    const r = parseSweep(block({ client: "t-center", code: "X", level: "warn", headline: "y" }), null);
    expect(r.findings[0].client).toBeNull();
  });

  it("survives markdown fences and bolded values", () => {
    // Models wrap blocks in code fences and bold the values unprompted.
    const r = parseSweep(
      "```\n[FINDING]\nclient: **t-center**\ncode: **WORKFLOW_OFF**\nlevel: **crit**\nheadline: **הבוט כבוי**\n[/FINDING]\n```"
    );
    expect(r.findings[0]).toMatchObject({
      client: "t-center",
      code: "WORKFLOW_OFF",
      level: "crit",
      headline: "הבוט כבוי",
    });
  });

  it("is case-insensitive about the tag itself", () => {
    const r = parseSweep("[finding]\nclient: -\ncode: X_Y\nlevel: warn\nheadline: כותרת\n[/finding]");
    expect(r.findings).toHaveLength(1);
  });

  it("defaults an unrecognised level to warn rather than escalating", () => {
    const r = parseSweep(block({ client: "-", code: "X", level: "בינוני", headline: "כ" }));
    expect(r.findings[0].level).toBe("warn");
  });

  it("skips an unparseable block instead of alerting on a guess", () => {
    const r = parseSweep("[FINDING]\ngibberish with no fields\n[/FINDING]");
    expect(r.reported).toBe(true); // the model DID answer in format
    expect(r.findings).toHaveLength(0); // …but there was nothing to act on
  });
});

describe("parseSweep — code normalisation keeps dedup stable", () => {
  it("upper-cases and snake-cases a loose code", () => {
    const r = parseSweep(block({ client: "-", code: "workflow off!", level: "warn", headline: "x" }));
    expect(r.findings[0].code).toBe("WORKFLOW_OFF");
  });

  it("falls back rather than producing an empty discriminator", () => {
    const r = parseSweep(block({ client: "-", code: "***", level: "warn", headline: "x" }));
    expect(r.findings[0].code).toBe("UNSPECIFIED");
  });

  it("produces the same dedup key for the same condition twice", () => {
    // If this drifts, an ongoing problem re-notifies on every sweep.
    const mk = (code: string) =>
      dedupKeyFor(parseSweep(block({ client: "t-center", code, level: "warn", headline: "x" }))
        .findings[0]);
    expect(mk("workflow_off")).toBe(mk("WORKFLOW OFF"));
    expect(mk("WORKFLOW_OFF")).toBe(`${SWEEP_PREFIX}t-center:WORKFLOW_OFF`);
  });

  it("namespaces agency-level findings under the same prefix", () => {
    // resolveEventsByPrefix clears only this namespace, so a key outside it
    // would never auto-resolve.
    const f = parseSweep(block({ client: "-", code: "X", level: "warn", headline: "y" })).findings[0];
    expect(dedupKeyFor(f).startsWith(SWEEP_PREFIX)).toBe(true);
  });
});

describe("parseSweep — bounded, and never silently", () => {
  it("caps findings and reports how many it dropped", () => {
    const many = Array.from({ length: MAX_FINDINGS + 4 }, (_, i) =>
      block({ client: "-", code: `C${i}`, level: "warn", headline: `h${i}` })
    ).join("\n");
    const r = parseSweep(many);
    expect(r.findings).toHaveLength(MAX_FINDINGS);
    expect(r.dropped).toBe(4);
  });
});

describe("severity mapping is code's decision, not the model's", () => {
  it("maps crit and warn onto the existing severity enum", () => {
    expect(severityFor("crit")).toBe("high");
    expect(severityFor("warn")).toBe("medium");
  });
});

describe("the prompt states the unconditional rule twice", () => {
  it("demands the block even when nothing is wrong, and repeats it at the end", () => {
    // The repetition is not redundancy — the rule is dropped far less often when
    // it also appears at the end of the prompt.
    expect(SWEEP_INSTRUCTIONS).toContain("גם כשהכל תקין");
    expect(SWEEP_INSTRUCTIONS).toContain("code: NONE");
    const tail = SWEEP_INSTRUCTIONS.slice(-300);
    expect(tail).toContain("[FINDING]");
  });

  it("does not ask the agent for a client field it is not allowed to decide", () => {
    // Asking for it and then ignoring it would invite the model to reason about
    // other customers; the per-agent prompt simply has no such field.
    expect(SWEEP_INSTRUCTIONS).not.toContain("client:");
    expect(SWEEP_INSTRUCTIONS).toContain("רק על הלקוח שלך");
  });
});
