import { describe, it, expect } from "vitest";
import { parseFormula } from "../parser.js";
import { compileExecutionPlan, type ExecutionPlan } from "../compile-plan.js";
import type { CompileConfig } from "../compile-plan.js";

const DEFAULT_CONFIG: CompileConfig = {
  universe: "sp500",
  rebalanceFrequency: "weekly",
  weightingMethod: "equal_weight",
  maxHoldings: 30,
  minHoldings: 10,
  maxPositionWeight: 0.10,
  turnoverCapPct: 1.0,
  transactionCostBps: 10,
};

const VALID_OPS = ["load_field", "literal", "call", "binary", "nary"] as const;

function validatePlanStructure(plan: ExecutionPlan): void {
  expect(plan.version).toBe(1);
  expect(typeof plan.formulaDsl).toBe("string");
  expect(plan.formulaDsl.length).toBeGreaterThan(0);
  expect(typeof plan.normalizedDsl).toBe("string");
  expect(plan.normalizedDsl.length).toBeGreaterThan(0);
  expect(typeof plan.fingerprint).toBe("string");
  expect(plan.fingerprint).toHaveLength(32);
  expect(plan.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  expect(typeof plan.nearDuplicateFingerprint).toBe("string");
  expect(plan.nearDuplicateFingerprint).toHaveLength(32);
  expect(plan.nearDuplicateFingerprint).toMatch(/^[0-9a-f]{32}$/);
  expect(plan.ast).toBeDefined();
  expect(typeof plan.ast).toBe("object");
  expect(Array.isArray(plan.steps)).toBe(true);
  expect(Array.isArray(plan.requiredFields)).toBe(true);
  expect(Array.isArray(plan.requiredFunctions)).toBe(true);
  expect(plan.config).toEqual(DEFAULT_CONFIG);

  for (const step of plan.steps) {
    expect(VALID_OPS).toContain(step.op);
  }
}

describe("Execution Plan Contract", () => {
  const formulas = [
    "ret_1d",
    "ret_1d + ret_5d",
    "zscore_cs(ret_126d)",
    "0.5 * zscore_cs(ret_252d) + 0.3 * zscore_cs(mom_12m) + 0.2 * neg(zscore_cs(vol_20d))",
    "rank(ret_126d)",
  ];

  for (const formula of formulas) {
    it(`produces valid plan for: ${formula}`, async () => {
      const { ast } = parseFormula(formula);
      expect(ast).toBeDefined();
      const plan = await compileExecutionPlan(ast!, DEFAULT_CONFIG);
      validatePlanStructure(plan);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps.length).toBeLessThanOrEqual(50);
    });
  }

  it("schema contract: required fields are present on all plans", async () => {
    const requiredKeys: (keyof ExecutionPlan)[] = [
      "version",
      "formulaDsl",
      "normalizedDsl",
      "fingerprint",
      "nearDuplicateFingerprint",
      "ast",
      "steps",
      "requiredFields",
      "requiredFunctions",
      "config",
    ];

    const { ast } = parseFormula("zscore_cs(ret_126d) + rank(vol_20d)");
    expect(ast).toBeDefined();
    const plan = await compileExecutionPlan(ast!, DEFAULT_CONFIG);

    for (const key of requiredKeys) {
      expect(plan).toHaveProperty(key);
    }
  });

  it("schema contract: config shape matches CompileConfig", async () => {
    const { ast } = parseFormula("ret_1d");
    expect(ast).toBeDefined();
    const plan = await compileExecutionPlan(ast!, DEFAULT_CONFIG);

    const cfg = plan.config;
    expect(typeof cfg.universe).toBe("string");
    expect(["weekly", "monthly"]).toContain(cfg.rebalanceFrequency);
    expect(["equal_weight", "score_weight"]).toContain(cfg.weightingMethod);
    expect(typeof cfg.maxHoldings).toBe("number");
    expect(typeof cfg.minHoldings).toBe("number");
    expect(typeof cfg.maxPositionWeight).toBe("number");
    expect(typeof cfg.turnoverCapPct).toBe("number");
    expect(typeof cfg.transactionCostBps).toBe("number");
  });

  it("schema contract: step shapes are well-formed", async () => {
    const { ast } = parseFormula(
      "0.5 * zscore_cs(ret_252d) + 0.3 * zscore_cs(mom_12m)",
    );
    expect(ast).toBeDefined();
    const plan = await compileExecutionPlan(ast!, DEFAULT_CONFIG);

    for (const step of plan.steps) {
      switch (step.op) {
        case "load_field":
          expect(typeof step.field).toBe("string");
          expect(step.field.length).toBeGreaterThan(0);
          break;
        case "literal":
          expect(typeof step.value).toBe("number");
          break;
        case "call":
          expect(typeof step.fn).toBe("string");
          expect(step.fn.length).toBeGreaterThan(0);
          expect(typeof step.arity).toBe("number");
          expect(step.arity).toBeGreaterThanOrEqual(1);
          expect(step.arity).toBeLessThanOrEqual(3);
          break;
        case "binary":
          expect(["+", "-", "*", "/"]).toContain(step.operator);
          break;
        case "nary":
          expect(["+", "*"]).toContain(step.operator);
          expect(typeof step.count).toBe("number");
          expect(step.count).toBeGreaterThanOrEqual(2);
          break;
      }
    }
  });
});
