import { describe, expect, it } from "vitest";
import { GUIDED_QA_STEPS, renderGuidedQaAuditHtml } from "./GuidedQaPanel";

describe("Guided Phase G QA contract", () => {
  it("defines exactly 18 ordered steps across the six review categories", () => {
    expect(GUIDED_QA_STEPS).toHaveLength(18);
    expect(new Set(GUIDED_QA_STEPS.map((step) => step.id)).size).toBe(18);
    expect(new Set(GUIDED_QA_STEPS.map((step) => step.category))).toEqual(new Set([
      "Setup",
      "Contact sequence",
      "Relay",
      "Flare",
      "Audio test",
      "Results",
    ]));
    expect(GUIDED_QA_STEPS.find((step) => step.id === "contact-withdraw")?.label)
      .toBe("Withdraw allied support");
  });

  it("exports a self-contained HTML readback without trusting readback markup", () => {
    const html = renderGuidedQaAuditHtml({
      schemaVersion: "lowpass-guided-phase-g-audit-1.0.0",
      generatedAtIso: "2026-07-28T00:00:00.000Z",
      scenarioId: "phase-g-guided-qa-18-step-v1",
      fixedSeed: "phase-g-guided-audit-v1",
      results: [{
        index: 0,
        ...GUIDED_QA_STEPS[0]!,
        startedAtIso: "2026-07-28T00:00:00.000Z",
        completedAtIso: "2026-07-28T00:00:01.000Z",
        status: "PASS",
        message: "ok",
        readback: { unsafe: "<script>alert(1)</script>" },
      }],
    });
    expect(html).toContain("LOWPASS Guided Phase G Audit");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });
});
