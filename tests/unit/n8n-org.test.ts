import { describe, it, expect } from "vitest";
import { businessOrgLabel, businessWorkflowName } from "../../lib/n8n-org";

// The "folder per business" onboarding rule: every bot's workflow is named and
// grouped from the business name. These pure helpers pin that convention.
describe("n8n-org — business naming convention", () => {
  it("normalizes whitespace in the business label", () => {
    expect(businessOrgLabel("  T  center ")).toBe("T center");
    expect(businessOrgLabel("Shift Digital")).toBe("Shift Digital");
  });

  it("builds a '<Business> — <Bot>' workflow name", () => {
    expect(businessWorkflowName("T center", "Sales bot")).toBe("T center — Sales bot");
    expect(businessWorkflowName("  BRJewelry ", " Orders ")).toBe("BRJewelry — Orders");
  });

  it("is deterministic for the same inputs", () => {
    expect(businessWorkflowName("Acme", "Bot")).toBe(businessWorkflowName("Acme", "Bot"));
  });
});
