import { describe, expect, it } from "vitest";
import { parseFormula } from "../parser.js";
import {
  compileExecutionPlan,
  MAX_EXECUTION_STEPS,
  FormulaTooComplexError,
} from "../compile-plan.js";
import type { CompileConfig } from "../compile-plan.js";

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

async function compile(input: string, config?: CompileConfig) {
  const { ast } = parseFormula(input);
  if (!ast) throw new Error(`Parse failed for: ${input}`);
  return compileExecutionPlan(ast, config ?? DEFAULT_CONFIG);
}

describe("compileExecutionPlan", () => {
  describe("snapshots", () => {
    it("snapshot: simple field", async () => {
      const plan = await compile("ret_1d");
      expect(plan.steps).toMatchSnapshot();
    });

    it("snapshot: addition", async () => {
      const plan = await compile("ret_1d + vol_20d");
      expect(plan.steps).toMatchSnapshot();
    });

    it("snapshot: complex expression", async () => {
      const plan = await compile("zscore_ts(ret_1d) + rank(vol_20d) * 0.5");
      expect(plan.steps).toMatchSnapshot();
    });

    it("snapshot: division", async () => {
      const plan = await compile("ret_1d / vol_20d");
      expect(plan.steps).toMatchSnapshot();
    });
  });

  describe("requiredFields", () => {
    it("collects fields from simple expression", async () => {
      const plan = await compile("ret_1d + vol_20d");
      expect(plan.requiredFields).toEqual(["ret_1d", "vol_20d"]);
    });

    it("collects fields from nested function calls", async () => {
      const plan = await compile("zscore_ts(ret_1d) + rank(vol_20d)");
      expect(plan.requiredFields).toEqual(["ret_1d", "vol_20d"]);
    });

    it("deduplicates fields", async () => {
      const plan = await compile("ret_1d + ret_1d");
      expect(plan.requiredFields).toEqual(["ret_1d"]);
    });

    it("sorts fields alphabetically", async () => {
      const plan = await compile("vol_20d + beta_60d + ret_1d");
      expect(plan.requiredFields).toEqual(["beta_60d", "ret_1d", "vol_20d"]);
    });
  });

  describe("requiredFunctions", () => {
    it("collects function names", async () => {
      const plan = await compile("zscore_ts(ret_1d) + rank(vol_20d)");
      expect(plan.requiredFunctions).toEqual(["rank", "zscore_ts"]);
    });

    it("returns empty for pure arithmetic", async () => {
      const plan = await compile("ret_1d + vol_20d * 2");
      expect(plan.requiredFunctions).toEqual([]);
    });

    it("deduplicates function names", async () => {
      const plan = await compile("zscore_ts(ret_1d) + zscore_ts(vol_20d)");
      expect(plan.requiredFunctions).toEqual(["zscore_ts"]);
    });
  });

  describe("determinism", () => {
    it("produces the same plan for the same input", async () => {
      const p1 = await compile("zscore_ts(ret_1d) + rank(vol_20d) * 0.5");
      const p2 = await compile("zscore_ts(ret_1d) + rank(vol_20d) * 0.5");
      expect(p1.fingerprint).toBe(p2.fingerprint);
      expect(p1.steps).toEqual(p2.steps);
      expect(p1.normalizedDsl).toBe(p2.normalizedDsl);
    });
  });

  describe("version field", () => {
    it("always has version 1", async () => {
      const plan = await compile("ret_1d");
      expect(plan.version).toBe(1);
    });
  });

  describe("config passthrough", () => {
    it("includes the config in the plan", async () => {
      const plan = await compile("ret_1d");
      expect(plan.config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe("complexity ceiling", () => {
    it("MAX_EXECUTION_STEPS is 50", () => {
      expect(MAX_EXECUTION_STEPS).toBe(50);
    });

    it("rejects overly complex formulas", async () => {
      // Build a formula that will generate > 50 steps
      // Each additional term adds ~2 steps (load + nary/binary)
      // With 30 terms in a sum and nesting, we should exceed 50
      const terms: string[] = [];
      for (let i = 0; i < 30; i++) {
        terms.push(`zscore_ts(ret_1d)`);
      }
      const formula = terms.join(" + ");
      await expect(compile(formula)).rejects.toThrow(FormulaTooComplexError);
    });

    it("accepts formulas under the limit", async () => {
      const plan = await compile("ret_1d + vol_20d + beta_60d");
      expect(plan.steps.length).toBeLessThanOrEqual(MAX_EXECUTION_STEPS);
    });
  });

  describe("plan shape", () => {
    it("has all required top-level fields", async () => {
      const plan = await compile("ret_1d + vol_20d");
      expect(plan).toHaveProperty("version");
      expect(plan).toHaveProperty("formulaDsl");
      expect(plan).toHaveProperty("normalizedDsl");
      expect(plan).toHaveProperty("fingerprint");
      expect(plan).toHaveProperty("nearDuplicateFingerprint");
      expect(plan).toHaveProperty("ast");
      expect(plan).toHaveProperty("steps");
      expect(plan).toHaveProperty("requiredFields");
      expect(plan).toHaveProperty("requiredFunctions");
      expect(plan).toHaveProperty("config");
    });
  });
});
