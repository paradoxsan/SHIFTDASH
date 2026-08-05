import { describe, it, expect } from "vitest";
import {
  excerpt,
  inspectBotMessage,
  isReportable,
  issueLabel,
  scanBotOutput,
  summarizeOutput,
  type BotMessage,
} from "@/lib/monitor/output-quality";
import { detectEvents, rollupHealth, type BotSignals } from "@/lib/monitor/detectors";
import { describeEvent } from "@/lib/alerts";

function msg(text: string | null, over: Partial<BotMessage> = {}): BotMessage {
  return { id: "1", chatId: "972501234567@s.whatsapp.net", text, at: "2026-08-05T10:00:00Z", ...over };
}

describe("inspectBotMessage — real Hebrew replies stay clean", () => {
  const good = [
    "ההזמנה שלך התקבלה ונשלחה לייצור! נעדכן ברגע שתהיה מוכנה 😊",
    "היי! בטח, המחיר לסט הוא 1,990 ₪ כולל משלוח.",
    "קיבלנו גם את הקובץ, תודה. אני בודק ומעדכן אותך תוך כמה דקות.",
    "אפשר לשלם כאן: https://pay.example.com/abc-123",
    "שעות הפעילות שלנו הן א׳-ה׳ 9:00-17:00",
    "מצטער, לא הבנתי — תוכל לנסח מחדש?",
    "המחיר הוא 2,990 ₪ (כולל מע״מ).",
  ];
  it.each(good)("clean: %s", (t) => {
    expect(inspectBotMessage(t)).toBeNull();
  });
});

describe("inspectBotMessage — the T-CENTER failure", () => {
  it("catches a whole reply that is a JSON object", () => {
    expect(
      inspectBotMessage('{"output":"ההזמנה התקבלה","order_id":42,"status":"open"}')
    ).toBe("raw_json");
  });

  it("catches a JSON array reply", () => {
    expect(inspectBotMessage('[{"role":"assistant","content":"שלום"}]')).toBe("raw_json");
  });

  it("catches TRUNCATED JSON — a leak cut off mid-object is still a leak", () => {
    expect(inspectBotMessage('{"output":"ההזמנה התקבלה","items":[{"sku":"A1","qty":')).toBe(
      "raw_json"
    );
  });

  it("catches an agent payload embedded after prose", () => {
    expect(
      inspectBotMessage('בסדר גמור! {"tool_use":{"name":"create_order"},"content":"..."}')
    ).toBe("raw_json");
  });

  it("catches a pretty-printed object", () => {
    expect(inspectBotMessage('{\n  "status": "ok",\n  "total": 2990\n}')).toBe("raw_json");
  });
});

describe("inspectBotMessage — other ways a reply goes wrong", () => {
  it("catches an unrendered n8n expression", () => {
    expect(inspectBotMessage("שלום {{ $json.name }}, ההזמנה מוכנה")).toBe("template_leak");
    expect(inspectBotMessage("סה״כ: ${total} ₪")).toBe("template_leak");
    expect(inspectBotMessage("ראה $json.body")).toBe("template_leak");
  });

  it("catches an internal control marker that reached the customer", () => {
    expect(inspectBotMessage("תודה! [ORDER] 2 יחידות")).toBe("marker_leak");
    expect(inspectBotMessage("[ORDER_END]")).toBe("marker_leak");
    expect(inspectBotMessage("סיימנו [HANDOFF] מעביר לנציג")).toBe("marker_leak");
  });

  it("catches a stack trace or error string sent as the reply", () => {
    expect(inspectBotMessage("TypeError: Cannot read properties of undefined")).toBe("error_text");
    expect(inspectBotMessage("Error: connect ECONNREFUSED 127.0.0.1:5678")).toBe("error_text");
    expect(inspectBotMessage("    at Object.<anonymous> (/app/index.js:12:5)")).toBe("error_text");
  });

  it("catches empty-variable output", () => {
    expect(inspectBotMessage("שלום undefined, מה שלומך?")).toBe("placeholder_leak");
    expect(inspectBotMessage("הפריט: [object Object]")).toBe("placeholder_leak");
    expect(inspectBotMessage("סה״כ NaN ₪")).toBe("placeholder_leak");
    expect(inspectBotMessage("null")).toBe("placeholder_leak");
  });

  it("treats a blank reply as empty", () => {
    expect(inspectBotMessage("")).toBe("empty");
    expect(inspectBotMessage("   \n ")).toBe("empty");
    expect(inspectBotMessage(null)).toBe("empty");
  });

  it("reports the most alarming symptom when a message has several", () => {
    // A stack trace wrapped in JSON is reported as JSON, not as an error string.
    expect(inspectBotMessage('{"error":"TypeError: boom","stack":"at Object.x"}')).toBe("raw_json");
  });

  it("does not flag ordinary punctuation or currency braces", () => {
    expect(inspectBotMessage("מחיר: 1,990 ₪ (מבצע!)")).toBeNull();
    expect(inspectBotMessage("שלח לי את המידע בבקשה 🙏")).toBeNull();
  });
});

describe("scanBotOutput + summarizeOutput", () => {
  const findings = scanBotOutput([
    msg("היי, איך אפשר לעזור?", { id: "a", chatId: "c1" }),
    msg('{"output":"x"}', { id: "b", chatId: "c1" }),
    msg('{"content":"y"}', { id: "c", chatId: "c2" }),
    msg("שלום {{ $json.name }}", { id: "d", chatId: "c3" }),
    msg("", { id: "e", chatId: "c4" }),
  ]);

  it("returns one finding per bad message and ignores clean ones", () => {
    expect(findings.map((f) => f.id)).toEqual(["b", "c", "d", "e"]);
  });

  it("counts distinct affected conversations", () => {
    const s = summarizeOutput(findings);
    expect(s.total).toBe(4);
    expect(s.chats).toBe(4);
  });

  it("ranks the worst issue first and picks a matching example", () => {
    const s = summarizeOutput(findings);
    expect(s.worst).toBe("raw_json");
    expect(s.byIssue[0]).toEqual({ issue: "raw_json", count: 2 });
    expect(s.example?.id).toBe("b");
  });

  it("empty replies alone are NOT worth an alert", () => {
    const onlyEmpty = summarizeOutput(scanBotOutput([msg(""), msg(null, { id: "2" })]));
    expect(onlyEmpty.total).toBe(2);
    expect(isReportable(onlyEmpty)).toBe(false);
  });

  it("anything a customer can read as garbage IS worth an alert", () => {
    expect(isReportable(summarizeOutput(scanBotOutput([msg('{"a":1}')])))).toBe(true);
  });

  it("a clean batch reports nothing", () => {
    expect(isReportable(summarizeOutput(scanBotOutput([msg("הכל בסדר!")])))).toBe(false);
  });
});

describe("excerpt", () => {
  it("collapses whitespace and truncates", () => {
    expect(excerpt('{\n  "a":   1\n}')).toBe('{ "a": 1 }');
    expect(excerpt("x".repeat(200))).toHaveLength(161); // 160 + ellipsis
  });
  it("handles nothing", () => {
    expect(excerpt(null)).toBe("");
  });
});

describe("BAD_BOT_OUTPUT event", () => {
  const base: BotSignals = {
    botId: "bot-1",
    ref: "abc",
    workflowActive: true,
    queueFailed: 0,
    oldestNewAgeMin: null,
    n8nErrorRate24h: 0,
  };

  it("raises a critical event while every infra signal reads healthy", () => {
    const events = detectEvents({
      ...base,
      outputFindings: scanBotOutput([msg('{"output":"x"}', { chatId: "c1" })]),
    });
    const bad = events.find((e) => e.type === "BAD_BOT_OUTPUT");
    expect(bad).toBeDefined();
    expect(bad?.severity).toBe("critical");
    expect(bad?.dedupKey).toBe("BAD_BOT_OUTPUT:bot-1");
    expect(bad?.payload.worst).toBe("raw_json");
    expect(bad?.payload.chats).toBe(1);
  });

  it("does not fire when output could not be read (undefined ≠ clean)", () => {
    expect(detectEvents({ ...base, outputFindings: undefined })).toEqual([]);
  });

  it("does not fire for a clean batch", () => {
    expect(detectEvents({ ...base, outputFindings: scanBotOutput([msg("הכל טוב")]) })).toEqual([]);
  });

  it("does not fire for empty replies alone", () => {
    expect(detectEvents({ ...base, outputFindings: scanBotOutput([msg("")]) })).toEqual([]);
  });

  it("drags health down to degraded even with n8n green", () => {
    expect(rollupHealth(base)).toBe("healthy");
    expect(
      rollupHealth({ ...base, outputFindings: scanBotOutput([msg('{"output":"x"}')]) })
    ).toBe("degraded");
  });

  it("reads as a Hebrew sentence naming the client and showing the text", () => {
    const { title, detail } = describeEvent(
      "BAD_BOT_OUTPUT",
      { total: 12, chats: 5, worst: "raw_json", example: '{"output":"x"}' },
      "T center"
    );
    expect(title).toContain("T center");
    expect(title).toContain("JSON גולמי");
    expect(detail).toContain("12");
    expect(detail).toContain("5");
    expect(detail).toContain('{"output":"x"}');
  });
});

describe("issueLabel", () => {
  it("labels known issues and degrades gracefully", () => {
    expect(issueLabel("raw_json")).toBe("JSON גולמי");
    expect(issueLabel("something_new")).toBe("פלט לא תקין");
  });
});
