import { describe, expect, it } from "vitest";
import { parseFormula } from "../parser.js";
import {
  typecheckFormula,
  defaultTypeContext,
  didYouMean,
  FUNCTION_SIGNATURES,
} from "../typecheck.js";
import type { TypeContext, FieldSchema } from "../typecheck.js";
import { FUNCTION_REGISTRY } from "../allowed-functions.js";

function check(input: string, ctx?: TypeContext) {
  const { ast } = parseFormula(input);
  if (!ast) throw new Error(`Parse failed for: ${input}`);
  return typecheckFormula(ast, ctx ?? defaultTypeContext());
}

describe("typecheckFormula", () => {
  describe("valid formulas", () => {
    it("typechecks a simple field ref", () => {
      const result = check("ret_1d");
      expect(result.ok).toBe(true);
      expect(result.type).toBe("timeseries");
      expect(result.errors).toHaveLength(0);
    });

    it("typechecks a number literal as scalar", () => {
      const result = check("42");
      expect(result.ok).toBe(true);
      expect(result.type).toBe("scalar");
    });

    it("typechecks a binary expr with two fields", () => {
      const result = check("ret_1d + vol_20d");
      expect(result.ok).toBe(true);
      expect(result.type).toBe("timeseries");
    });

    it("typechecks scalar op timeseries -> timeseries", () => {
      const result = check("2 * ret_1d");
      expect(result.ok).toBe(true);
      expect(result.type).toBe("timeseries");
    });

    it("typechecks a function call", () => {
      const result = check("zscore_ts(ret_1d)");
      expect(result.ok).toBe(true);
      expect(result.type).toBe("timeseries");
    });

    it("typechecks nested expressions with matching types", () => {
      // zscore_ts expects timeseries (ok), zscore_ts returns timeseries
      // lag expects (timeseries, scalar) (ok)
      const result = check("zscore_ts(ret_1d) + lag(vol_20d, 1)");
      expect(result.ok).toBe(true);
    });

    it("reports type mismatch in nested expressions", () => {
      // rank expects cross_section but vol_20d is timeseries
      const result = check("zscore_ts(ret_1d) + rank(vol_20d)");
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "TYPE_MISMATCH")).toBe(true);
    });

    it("typechecks unary minus", () => {
      const result = check("-ret_1d");
      expect(result.ok).toBe(true);
      expect(result.type).toBe("timeseries");
    });

    it("typechecks clamp with 3 args", () => {
      const result = check("clamp(ret_1d, 0, 1)");
      expect(result.ok).toBe(true);
      expect(result.type).toBe("timeseries"); // polymorphic: infers return from first arg
    });

    it("typechecks lag with scalar second arg", () => {
      const result = check("lag(ret_1d, 5)");
      expect(result.ok).toBe(true);
      expect(result.type).toBe("timeseries");
    });
  });

  describe("unknown functions", () => {
    it("reports unknown function", () => {
      const result = check("foo(ret_1d)");
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.code).toBe("UNKNOWN_FUNCTION");
    });

    it("suggests a similar function name", () => {
      const result = check("zscorr_ts(ret_1d)");
      expect(result.ok).toBe(false);
      expect(result.errors[0]!.message).toContain("Did you mean");
      expect(result.errors[0]!.message).toContain("zscore_ts");
    });
  });

  describe("unknown fields", () => {
    it("reports unknown field", () => {
      const result = check("foobar");
      expect(result.ok).toBe(false);
      expect(result.errors[0]!.code).toBe("UNKNOWN_FIELD");
    });

    it("suggests a similar field name", () => {
      const result = check("ret_1");
      expect(result.ok).toBe(false);
      expect(result.errors[0]!.message).toContain("Did you mean");
    });
  });

  describe("arity mismatches", () => {
    it("reports too few args", () => {
      const result = check("lag(ret_1d)");
      expect(result.ok).toBe(false);
      expect(result.errors[0]!.message).toContain("expects 2 argument(s), got 1");
    });

    it("reports too many args", () => {
      const result = check("abs(ret_1d, vol_20d)");
      expect(result.ok).toBe(false);
      expect(result.errors[0]!.message).toContain("expects 1 argument(s), got 2");
    });
  });

  describe("type promotion", () => {
    it("promotes scalar + timeseries to timeseries", () => {
      const result = check("1 + ret_1d");
      expect(result.type).toBe("timeseries");
    });

    it("promotes timeseries op timeseries to timeseries", () => {
      const result = check("ret_1d * vol_20d");
      expect(result.type).toBe("timeseries");
    });

    it("promotes scalar op cross_section to cross_section", () => {
      const fields = new Map<string, FieldSchema>([
        ["xs_field", { name: "xs_field", type: "cross_section" }],
      ]);
      const ctx: TypeContext = { fields };
      const { ast } = parseFormula("2 * xs_field");
      if (!ast) throw new Error("Parse failed");
      const result = typecheckFormula(ast, ctx);
      expect(result.type).toBe("cross_section");
    });

    it("promotes timeseries op cross_section to cross_section", () => {
      const fields = new Map<string, FieldSchema>([
        ["ts_field", { name: "ts_field", type: "timeseries" }],
        ["xs_field", { name: "xs_field", type: "cross_section" }],
      ]);
      const ctx: TypeContext = { fields };
      const { ast } = parseFormula("ts_field + xs_field");
      if (!ast) throw new Error("Parse failed");
      const result = typecheckFormula(ast, ctx);
      expect(result.type).toBe("cross_section");
    });
  });

  describe("multiple errors", () => {
    it("reports multiple errors in one formula", () => {
      const result = check("foo(bar)");
      expect(result.ok).toBe(false);
      // unknown function and unknown field
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("didYouMean", () => {
  it("suggests closest match", () => {
    const candidates = ["zscore_ts", "zscore_xs", "rank", "lag"];
    expect(didYouMean("zscroe_ts", candidates)).toBe("zscore_ts");
  });

  it("returns undefined for completely different input", () => {
    const candidates = ["zscore_ts", "zscore_xs"];
    expect(didYouMean("xxxxxxxxxxxxxxxxx", candidates)).toBeUndefined();
  });
});

describe("FUNCTION_SIGNATURES consistency", () => {
  it("every FUNCTION_SIGNATURES key exists in FUNCTION_REGISTRY", () => {
    for (const key of FUNCTION_SIGNATURES.keys()) {
      expect(FUNCTION_REGISTRY.has(key)).toBe(true);
    }
  });

  it("arities match between FUNCTION_SIGNATURES and FUNCTION_REGISTRY", () => {
    for (const [key, sig] of FUNCTION_SIGNATURES) {
      const entry = FUNCTION_REGISTRY.get(key);
      expect(entry).toBeDefined();
      expect(sig.params.length).toBe(entry!.arity);
    }
  });

  it("every FUNCTION_REGISTRY key has a FUNCTION_SIGNATURES entry", () => {
    for (const key of FUNCTION_REGISTRY.keys()) {
      expect(FUNCTION_SIGNATURES.has(key)).toBe(true);
    }
  });
});
