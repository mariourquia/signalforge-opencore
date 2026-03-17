import { describe, expect, it } from "vitest";
import { parseFormula } from "@signalforge/dsl-core";
import { explainFormula } from "../explain.js";

function explain(input: string) {
  const { ast } = parseFormula(input);
  if (!ast) throw new Error(`Parse failed for: ${input}`);
  return explainFormula(ast);
}

describe("explainFormula", () => {
  describe("summary", () => {
    it("mentions field labels in summary", () => {
      const result = explain("ret_1d + vol_20d");
      expect(result.summary).toContain("previous-day return");
      expect(result.summary).toContain("20-day volatility");
    });

    it("mentions functions in summary", () => {
      const result = explain("zscore_ts(ret_1d)");
      expect(result.summary).toContain("zscore_ts");
    });

    it("handles momentum formula", () => {
      const result = explain("ret_252d");
      expect(result.summary).toContain("12-month return");
    });

    it("handles complex formula", () => {
      const result = explain("zscore_ts(ret_1d) + rank(vol_20d) * 0.5");
      expect(result.summary).toContain("previous-day return");
      expect(result.summary).toContain("20-day volatility");
    });
  });

  describe("steps", () => {
    it("produces steps for a binary expression", () => {
      const result = explain("ret_1d + vol_20d");
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps.some((s) => s.toLowerCase().includes("plus"))).toBe(
        true,
      );
    });

    it("produces steps for function calls", () => {
      const result = explain("zscore_ts(ret_1d)");
      expect(result.steps.length).toBeGreaterThan(0);
      expect(
        result.steps.some((s) => s.toLowerCase().includes("z-score")),
      ).toBe(true);
    });

    it("produces a step for leaf nodes", () => {
      const result = explain("ret_1d");
      expect(result.steps.length).toBe(1);
      expect(result.steps[0]).toContain("previous-day return");
    });

    it("handles negation", () => {
      const result = explain("-ret_1d");
      expect(result.steps.some((s) => s.toLowerCase().includes("negate"))).toBe(
        true,
      );
    });

    it("handles division", () => {
      const result = explain("ret_1d / vol_20d");
      expect(
        result.steps.some((s) => s.toLowerCase().includes("divided by")),
      ).toBe(true);
    });

    it("handles lag", () => {
      const result = explain("lag(ret_1d, 5)");
      expect(
        result.steps.some((s) => s.toLowerCase().includes("lagged")),
      ).toBe(true);
    });

    it("handles clamp", () => {
      const result = explain("clamp(ret_1d, 0, 1)");
      expect(
        result.steps.some((s) => s.toLowerCase().includes("clamped")),
      ).toBe(true);
    });
  });

  describe("field label lookup", () => {
    const labelMap: [string, string][] = [
      ["ret_1d", "previous-day return"],
      ["ret_5d", "5-day return"],
      ["ret_20d", "20-day return"],
      ["ret_63d", "quarterly return"],
      ["ret_126d", "6-month return"],
      ["ret_252d", "12-month return"],
      ["vol_20d", "20-day volatility"],
      ["vol_60d", "60-day volatility"],
      ["vol_126d", "6-month volatility"],
      ["dollar_volume_20d", "20-day average dollar volume"],
      ["dollar_volume_60d", "60-day average dollar volume"],
      ["beta_60d", "60-day beta"],
      ["mom_12m", "12-month momentum"],
    ];

    for (const [field, label] of labelMap) {
      it(`maps ${field} to "${label}"`, () => {
        const result = explain(field);
        expect(result.summary).toContain(label);
      });
    }
  });
});
