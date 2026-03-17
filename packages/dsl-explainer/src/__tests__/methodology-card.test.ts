import { describe, expect, it } from "vitest";
import { parseFormula } from "@signalforge/dsl-core";
import type { CompileConfig } from "@signalforge/dsl-core";
import { buildMethodologyCard } from "../methodology-card.js";

const DEFAULT_CONFIG: CompileConfig = {
  universe: "sp500",
  rebalanceFrequency: "monthly",
  weightingMethod: "equal_weight",
  maxHoldings: 50,
  minHoldings: 20,
  maxPositionWeight: 0.05,
  turnoverCapPct: 25,
  transactionCostBps: 10,
};

function card(input: string, config?: CompileConfig) {
  const { ast } = parseFormula(input);
  if (!ast) throw new Error(`Parse failed for: ${input}`);
  return buildMethodologyCard(ast, config ?? DEFAULT_CONFIG);
}

describe("buildMethodologyCard", () => {
  describe("structure", () => {
    it("has all required fields", () => {
      const result = card("ret_252d");
      expect(result).toHaveProperty("signalSummary");
      expect(result).toHaveProperty("selectionRule");
      expect(result).toHaveProperty("portfolioConstruction");
      expect(result).toHaveProperty("riskControl");
      expect(result).toHaveProperty("tags");
    });
  });

  describe("signalSummary", () => {
    it("uses field labels", () => {
      const result = card("ret_252d + vol_20d");
      expect(result.signalSummary).toContain("12-month return");
      expect(result.signalSummary).toContain("20-day volatility");
    });
  });

  describe("selectionRule", () => {
    it("mentions universe", () => {
      const result = card("ret_1d");
      expect(result.selectionRule).toContain("sp500");
    });

    it("mentions rebalance frequency", () => {
      const result = card("ret_1d");
      expect(result.selectionRule).toContain("monthly");
    });

    it("mentions holdings limits", () => {
      const result = card("ret_1d");
      expect(result.selectionRule).toContain("50");
      expect(result.selectionRule).toContain("20");
    });
  });

  describe("portfolioConstruction", () => {
    it("mentions equal-weighted for equal_weight config", () => {
      const result = card("ret_1d");
      expect(result.portfolioConstruction).toContain("equal-weighted");
    });

    it("mentions score-weighted for score_weight config", () => {
      const result = card("ret_1d", {
        ...DEFAULT_CONFIG,
        weightingMethod: "score_weight",
      });
      expect(result.portfolioConstruction).toContain("score-weighted");
    });

    it("mentions max position weight", () => {
      const result = card("ret_1d");
      expect(result.portfolioConstruction).toContain("5%");
    });
  });

  describe("riskControl", () => {
    it("mentions turnover cap", () => {
      const result = card("ret_1d");
      expect(result.riskControl).toContain("25%");
    });

    it("mentions transaction costs", () => {
      const result = card("ret_1d");
      expect(result.riskControl).toContain("10 bps");
    });
  });

  describe("tags", () => {
    it("includes momentum tags for momentum formulas", () => {
      const result = card("ret_252d");
      expect(result.tags).toContain("momentum");
    });

    it("includes multi-factor for mixed formulas", () => {
      const result = card("ret_252d + vol_20d");
      expect(result.tags).toContain("multi-factor");
    });
  });
});
