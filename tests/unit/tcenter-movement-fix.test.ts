import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { patchWorkflow, PROMPT_RULE, GUARD_START } from "../../scripts/tcenter/fix-movement-shirts.mjs";

// The committed template is a snapshot of the live T-CENTER workflow — the same
// node names and the same "Parse Order" code the patch has to find its way into.
const template = () =>
  JSON.parse(readFileSync(join(process.cwd(), "templates/tcenter-sales/workflow.template.json"), "utf8"));

type Node = { name: string; type: string; parameters: Record<string, any> };
const node = (wf: { nodes: Node[] }, name: string) => wf.nodes.find((n) => n.name === name)!;

/** Run a Code node's body the way n8n does: $json + $() in scope, returns items. */
function runParseOrder(wf: { nodes: Node[] }, { output, mergedText }: { output: string; mergedText: string }) {
  const code = node(wf, "Parse Order").parameters.jsCode as string;
  const botAllowed = { chatId: "972555519953@s.whatsapp.net", senderName: "לקוחה", mergedText, businessOpen: false };
  const $ = (name: string) => {
    if (name !== "Bot Allowed?") throw new Error("unexpected node ref " + name);
    return { item: { json: botAllowed } };
  };
  return new Function("$json", "$", code)({ output }, $)[0].json;
}

const FALSE_YES = "כן, אנחנו מדפיסים על חולצות תנועה של בני עקיבא. אנחנו מספקים את החולצות ועליהן מדפיסים את הסמל או העיצוב שלכם.\nכמה חולצות תרצה?";
const ASK = "אני לא רוצה חולצה רגילה, אני רוצה חולצות של צוות בני עקיבא\nאתם מייצרים כאלה?";

describe("patchWorkflow — Parse Order guard", () => {
  it("replaces the false yes from the real conversation", () => {
    const out = runParseOrder(patchWorkflow(template()), { output: FALSE_YES, mergedText: ASK });
    expect(out.summary).toMatch(/אין לנו חולצות תנועה/);
    expect(out.summary).not.toMatch(/^כן/);
  });

  it("never releases a payment link with the override", () => {
    const output = FALSE_YES + '\n[ORDER: {"total": 700, "product": "חולצות תנועה", "quantity": 35}]';
    const out = runParseOrder(patchWorkflow(template()), { output, mergedText: "כן" });
    expect(out.isOrder).toBe(false);
    expect(out.total).toBe(0);
  });

  it("leaves a normal quote byte-identical to the unpatched node", () => {
    const args = { output: "35 חולצות טריקו כותנה שרוול קצר — 20 ₪ ליחידה, סה\"כ 700 ₪.\nרוצה שנתקדם להזמנה?", mergedText: "35" };
    expect(runParseOrder(patchWorkflow(template()), args)).toEqual(runParseOrder(template(), args));
  });

  it("is idempotent — a second run changes nothing", () => {
    const once = patchWorkflow(template());
    const twice = patchWorkflow(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(node(twice, "Parse Order").parameters.jsCode.split(GUARD_START).length).toBe(2);
  });

  it("does not touch connections or any other node", () => {
    const before = template();
    const after = patchWorkflow(template());
    expect(after.connections).toEqual(before.connections);
    const untouched = (wf: { nodes: Node[] }) =>
      wf.nodes.filter((n) => n.name !== "Parse Order" && n.name !== "T-CENTER Sales Agent");
    expect(untouched(after)).toEqual(untouched(before));
  });

  it("refuses to guess when the anchor is gone", () => {
    const wf = template();
    node(wf, "Parse Order").parameters.jsCode = "return [];";
    expect(() => patchWorkflow(wf)).toThrow(/anchor/);
  });
});

describe("patchWorkflow — system prompt rule", () => {
  it("appends the rule once, and keeps the existing prompt intact", () => {
    const wf = template();
    const before = node(wf, "T-CENTER Sales Agent").parameters.options.systemMessage as string;
    const after = node(patchWorkflow(wf), "T-CENTER Sales Agent").parameters.options.systemMessage as string;
    expect(after.startsWith(before)).toBe(true);
    expect(after).toContain(PROMPT_RULE);
    const again = node(patchWorkflow(JSON.parse(JSON.stringify(patchWorkflow(template())))), "T-CENTER Sales Agent")
      .parameters.options.systemMessage as string;
    expect(again).toBe(after);
  });

  it("states plainly that there are no movement shirts", () => {
    expect(PROMPT_RULE).toMatch(/אין לנו חולצות תנועה/);
    expect(PROMPT_RULE).toMatch(/בני עקיבא/);
  });
});
