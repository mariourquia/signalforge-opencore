import { describe, expect, it } from "vitest";
import {
  compileScoringCte,
  validateFieldName,
  buildProjectionCte,
  buildStepCte,
} from "../compile-cte.js";
import type { ExecutionStep } from "../compile-plan.js";

describe("validateFieldName", () => {
  it("accepts valid field names", () => {
    expect(() => validateFieldName("ret_126d")).not.toThrow();
    expect(() => validateFieldName("vol_20d")).not.toThrow();
    expect(() => validateFieldName("zscore_ts_ret_126d")).not.toThrow();
  });

  it("rejects names starting with uppercase", () => {
    expect(() => validateFieldName("Ret_126d")).toThrow("Invalid field name");
  });

  it("rejects names with special characters", () => {
    expect(() => validateFieldName("ret'; DROP TABLE")).toThrow("Invalid field name");
  });

  it("rejects names starting with digit", () => {
    expect(() => validateFieldName("1ret")).toThrow("Invalid field name");
  });

  it("rejects empty string", () => {
    expect(() => validateFieldName("")).toThrow("Invalid field name");
  });
});

describe("buildProjectionCte", () => {
  it("projects base fields from payload", () => {
    const result = buildProjectionCte(["ret_126d", "vol_20d"], []);
    expect(result.sql).toContain("(fd.payload->>'ret_126d')::numeric AS ret_126d");
    expect(result.sql).toContain("(fd.payload->>'vol_20d')::numeric AS vol_20d");
    expect(result.sql).toContain("fd.trade_date = $1");
    expect(result.sql).toContain("fd.universe_id = $2");
    expect(result.sql).toContain("umd.is_eligible = true");
    expect(result.columns).toEqual(["ret_126d", "vol_20d"]);
  });

  it("adds zscore_ts columns when zscore_ts is required", () => {
    const result = buildProjectionCte(["ret_126d"], ["zscore_ts"]);
    expect(result.sql).toContain("ret_126d");
    expect(result.sql).toContain("zscore_ts_ret_126d");
    expect(result.columns).toContain("zscore_ts_ret_126d");
  });

  it("adds zscore_cs columns when zscore_cs or zscore_xs is required", () => {
    const result = buildProjectionCte(["vol_20d"], ["zscore_cs"]);
    expect(result.columns).toContain("zscore_cs_vol_20d");

    const result2 = buildProjectionCte(["vol_20d"], ["zscore_xs"]);
    expect(result2.columns).toContain("zscore_cs_vol_20d");
  });

  it("rejects invalid field names in projection", () => {
    expect(() => buildProjectionCte(["bad'; DROP"], [])).toThrow("Invalid field name");
  });
});

describe("buildStepCte", () => {
  describe("load_field", () => {
    it("first step reads from projected", () => {
      const step: ExecutionStep = { op: "load_field", field: "ret_126d" };
      const result = buildStepCte(0, step, { depth: 0, prevField: null });
      expect(result.sql).toContain("FROM projected");
      expect(result.sql).toContain("ret_126d AS s1");
      expect(result.newDepth).toBe(1);
      expect(result.prevField).toBe("ret_126d");
    });

    it("subsequent step joins projected and carries stack", () => {
      const step: ExecutionStep = { op: "load_field", field: "vol_20d" };
      const result = buildStepCte(1, step, { depth: 1, prevField: null });
      expect(result.sql).toContain("JOIN projected p ON p.symbol = s.symbol");
      expect(result.sql).toContain("s.s1");
      expect(result.sql).toContain("p.vol_20d AS s2");
      expect(result.newDepth).toBe(2);
    });
  });

  describe("literal", () => {
    it("pushes constant value", () => {
      const step: ExecutionStep = { op: "literal", value: 0.6 };
      const result = buildStepCte(1, step, { depth: 1, prevField: null });
      expect(result.sql).toContain("0.6::numeric AS s2");
      expect(result.sql).toContain("s1");
      expect(result.newDepth).toBe(2);
      expect(result.prevField).toBeNull();
    });

    it("handles negative values", () => {
      const step: ExecutionStep = { op: "literal", value: -0.4 };
      const result = buildStepCte(1, step, { depth: 1, prevField: null });
      expect(result.sql).toContain("(-0.4)::numeric AS s2");
    });

    it("rejects NaN", () => {
      const step: ExecutionStep = { op: "literal", value: NaN };
      expect(() => buildStepCte(1, step, { depth: 1, prevField: null })).toThrow("Literal must be finite");
    });

    it("rejects Infinity", () => {
      const step: ExecutionStep = { op: "literal", value: Infinity };
      expect(() => buildStepCte(1, step, { depth: 1, prevField: null })).toThrow("Literal must be finite");
    });
  });

  describe("binary", () => {
    it("pops two, pushes result", () => {
      const step: ExecutionStep = { op: "binary", operator: "*" };
      const result = buildStepCte(2, step, { depth: 2, prevField: null });
      expect(result.sql).toContain("(s1 * s2) AS s1");
      expect(result.newDepth).toBe(1);
    });

    it("handles division with NULLIF", () => {
      const step: ExecutionStep = { op: "binary", operator: "/" };
      const result = buildStepCte(2, step, { depth: 2, prevField: null });
      expect(result.sql).toContain("s1 / NULLIF(s2, 0)");
    });

    it("preserves lower stack columns", () => {
      const step: ExecutionStep = { op: "binary", operator: "+" };
      const result = buildStepCte(3, step, { depth: 3, prevField: null });
      expect(result.sql).toContain("s1,");
      expect(result.sql).toContain("(s2 + s3) AS s2");
      expect(result.newDepth).toBe(2);
    });
  });

  describe("nary", () => {
    it("reduces N stack items with operator", () => {
      const step: ExecutionStep = { op: "nary", operator: "+", count: 3 };
      const result = buildStepCte(4, step, { depth: 3, prevField: null });
      expect(result.sql).toContain("(s1 + s2 + s3) AS s1");
      expect(result.newDepth).toBe(1);
    });

    it("preserves lower stack items", () => {
      const step: ExecutionStep = { op: "nary", operator: "*", count: 2 };
      const result = buildStepCte(4, step, { depth: 4, prevField: null });
      expect(result.sql).toContain("s1, s2,");
      expect(result.sql).toContain("(s3 * s4) AS s3");
      expect(result.newDepth).toBe(3);
    });
  });

  describe("call", () => {
    describe("zscore functions", () => {
      it("zscore_cs replaces top of stack with pre-materialized value", () => {
        const step: ExecutionStep = { op: "call", fn: "zscore_cs", arity: 1 };
        const result = buildStepCte(1, step, { depth: 1, prevField: "ret_126d" });
        expect(result.sql).toContain("zscore_cs_ret_126d AS s1");
        expect(result.newDepth).toBe(1);
        expect(result.prevField).toBeNull();
      });

      it("zscore_ts uses zscore_ts_ prefix", () => {
        const step: ExecutionStep = { op: "call", fn: "zscore_ts", arity: 1 };
        const result = buildStepCte(1, step, { depth: 1, prevField: "vol_20d" });
        expect(result.sql).toContain("zscore_ts_vol_20d AS s1");
      });

      it("zscore_xs maps to zscore_cs_ prefix", () => {
        const step: ExecutionStep = { op: "call", fn: "zscore_xs", arity: 1 };
        const result = buildStepCte(1, step, { depth: 1, prevField: "ret_126d" });
        expect(result.sql).toContain("zscore_cs_ret_126d AS s1");
      });

      it("returns NULL when prevField is null (v1 compat)", () => {
        const step: ExecutionStep = { op: "call", fn: "zscore_cs", arity: 1 };
        const result = buildStepCte(2, step, { depth: 1, prevField: null });
        expect(result.sql).toContain("NULL::numeric AS s1");
      });

      it("carries lower stack columns with JOIN", () => {
        const step: ExecutionStep = { op: "call", fn: "zscore_cs", arity: 1 };
        const result = buildStepCte(5, step, { depth: 2, prevField: "vol_20d" });
        expect(result.sql).toContain("s.s1");
        expect(result.sql).toContain("p.zscore_cs_vol_20d AS s2");
        expect(result.sql).toContain("JOIN projected p");
      });
    });

    describe("pure math functions", () => {
      it("abs transforms top of stack", () => {
        const step: ExecutionStep = { op: "call", fn: "abs", arity: 1 };
        const result = buildStepCte(2, step, { depth: 1, prevField: null });
        expect(result.sql).toContain("ABS(s1)");
        expect(result.newDepth).toBe(1);
      });

      it("neg negates top of stack", () => {
        const step: ExecutionStep = { op: "call", fn: "neg", arity: 1 };
        const result = buildStepCte(2, step, { depth: 1, prevField: null });
        expect(result.sql).toContain("(-s1)");
      });

      it("log applies LN with NULLIF", () => {
        const step: ExecutionStep = { op: "call", fn: "log", arity: 1 };
        const result = buildStepCte(2, step, { depth: 1, prevField: null });
        expect(result.sql).toContain("LN(NULLIF(s1, 0))");
      });

      it("min pops 2 pushes LEAST", () => {
        const step: ExecutionStep = { op: "call", fn: "min", arity: 2 };
        const result = buildStepCte(3, step, { depth: 2, prevField: null });
        expect(result.sql).toContain("LEAST(s1, s2)");
        expect(result.newDepth).toBe(1);
      });

      it("max pops 2 pushes GREATEST", () => {
        const step: ExecutionStep = { op: "call", fn: "max", arity: 2 };
        const result = buildStepCte(3, step, { depth: 2, prevField: null });
        expect(result.sql).toContain("GREATEST(s1, s2)");
      });

      it("clamp pops 3 pushes clamped value", () => {
        const step: ExecutionStep = { op: "call", fn: "clamp", arity: 3 };
        const result = buildStepCte(4, step, { depth: 3, prevField: null });
        expect(result.sql).toContain("GREATEST(s2, LEAST(s3, s1))");
        expect(result.newDepth).toBe(1);
      });
    });

    describe("special functions", () => {
      it("rank is a no-op (v1 compat)", () => {
        const step: ExecutionStep = { op: "call", fn: "rank", arity: 1 };
        const result = buildStepCte(2, step, { depth: 1, prevField: null });
        expect(result.sql).toContain("s1");
        expect(result.newDepth).toBe(1);
      });

      it("lag returns NULL (MVP stub)", () => {
        const step: ExecutionStep = { op: "call", fn: "lag", arity: 2 };
        const result = buildStepCte(3, step, { depth: 2, prevField: null });
        expect(result.sql).toContain("NULL::numeric AS s1");
        expect(result.newDepth).toBe(1);
      });

      it("unknown function is no-op (v1 compat)", () => {
        const step: ExecutionStep = { op: "call", fn: "future_fn", arity: 1 };
        const result = buildStepCte(2, step, { depth: 1, prevField: null });
        expect(result.newDepth).toBe(1);
      });
    });
  });
});

// Integration tests for compileScoringCte
import { parseFormula } from "../parser.js";
import { compileExecutionPlan } from "../compile-plan.js";
import type { CompileConfig } from "../compile-plan.js";

const COMPILE_CONFIG: CompileConfig = {
  universe: "sp500",
  rebalanceFrequency: "monthly",
  weightingMethod: "equal_weight",
  maxHoldings: 50,
  minHoldings: 20,
  maxPositionWeight: 0.05,
  turnoverCapPct: 25,
  transactionCostBps: 10,
};

describe("compileScoringCte", () => {
  it("generates valid SQL for simple field", () => {
    const result = compileScoringCte({
      steps: [{ op: "load_field", field: "ret_126d" }],
      requiredFields: ["ret_126d"],
      requiredFunctions: [],
    });
    expect(result.sql).toContain("WITH projected AS");
    expect(result.sql).toContain("step_0 AS");
    expect(result.sql).toContain("s1 AS score");
    expect(result.sql).toContain("ROW_NUMBER() OVER (ORDER BY s1 DESC)");
    expect(result.sql).toContain("WHERE s1 IS NOT NULL");
    expect(result.maxStackDepth).toBe(1);
  });

  it("generates correct SQL for design doc example", async () => {
    const { ast } = parseFormula("zscore_cs(ret_126d) * 0.6 + zscore_cs(vol_20d) * (-0.4)");
    if (!ast) throw new Error("Parse failed");
    const plan = await compileExecutionPlan(ast, COMPILE_CONFIG);

    const result = compileScoringCte({
      steps: plan.steps,
      requiredFields: plan.requiredFields,
      requiredFunctions: plan.requiredFunctions,
    });

    expect(result.sql).toContain("WITH projected AS");
    expect(result.sql).toContain("zscore_cs_ret_126d");
    expect(result.sql).toContain("zscore_cs_vol_20d");
    expect(result.sql).toContain("s1 AS score");
    expect(result.maxStackDepth).toBeGreaterThanOrEqual(2);
    expect(result.sql).toContain("$1");
    expect(result.sql).toContain("$2");
    expect(result.sql).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("tracks max stack depth correctly", () => {
    const result = compileScoringCte({
      steps: [
        { op: "load_field", field: "ret_126d" },
        { op: "load_field", field: "vol_20d" },
        { op: "binary", operator: "+" },
      ],
      requiredFields: ["ret_126d", "vol_20d"],
      requiredFunctions: [],
    });
    expect(result.maxStackDepth).toBe(2);
  });

  it("rejects empty steps", () => {
    expect(() =>
      compileScoringCte({
        steps: [],
        requiredFields: [],
        requiredFunctions: [],
      }),
    ).toThrow();
  });
});
