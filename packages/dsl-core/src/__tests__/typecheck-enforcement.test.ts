import { describe, it, expect } from "vitest";
import { parseFormula } from "../parser.js";
import { typecheckFormula, defaultTypeContext } from "../typecheck.js";

describe("type checker enforcement", () => {
  const ctx = defaultTypeContext();

  function check(input: string) {
    const { ast } = parseFormula(input);
    if (!ast) throw new Error(`Parse failed for: ${input}`);
    return typecheckFormula(ast, ctx);
  }

  it("accepts abs(scalar)", () => {
    const result = check("abs(1.5)");
    expect(result.ok).toBe(true);
    expect(result.type).toBe("scalar");
  });

  it("accepts abs(timeseries) -- polymorphic", () => {
    const result = check("abs(ret_1d)");
    expect(result.ok).toBe(true);
    expect(result.type).toBe("timeseries");
  });

  it("accepts log(timeseries) -- polymorphic", () => {
    const result = check("log(ret_1d)");
    expect(result.ok).toBe(true);
    expect(result.type).toBe("timeseries");
  });

  it("rejects lag with swapped arg types", () => {
    // lag expects (timeseries, scalar), giving (scalar, timeseries) should error
    const result = check("lag(5, ret_1d)");
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "TYPE_MISMATCH")).toBe(true);
  });

  it("reports correct TYPE_MISMATCH detail for lag arg 2", () => {
    // lag(5, ret_1d): arg 1 is scalar->timeseries (scalar promotes, ok).
    // arg 2 is timeseries->scalar (no promotion, TYPE_MISMATCH on 'periods').
    const result = check("lag(5, ret_1d)");
    const mismatch = result.errors.find((e) => e.code === "TYPE_MISMATCH");
    expect(mismatch).toBeDefined();
    expect(mismatch!.message).toContain("periods");
    expect(mismatch!.message).toContain("scalar");
    expect(mismatch!.message).toContain("timeseries");
  });

  it("reports exactly one TYPE_MISMATCH for lag with swapped args", () => {
    // Only arg 2 fails: timeseries cannot promote to scalar.
    // Arg 1 (scalar) promotes to timeseries, so it passes.
    const result = check("lag(5, ret_1d)");
    const mismatches = result.errors.filter((e) => e.code === "TYPE_MISMATCH");
    expect(mismatches.length).toBe(1);
  });

  it("accepts lag with correct arg types", () => {
    const result = check("lag(ret_1d, 5)");
    expect(result.ok).toBe(true);
  });

  it("accepts clamp with all scalars", () => {
    const result = check("clamp(1.5, 0, 3)");
    expect(result.ok).toBe(true);
  });

  it("accepts clamp with timeseries first arg (polymorphic)", () => {
    const result = check("clamp(ret_1d, 0, 1)");
    expect(result.ok).toBe(true);
    expect(result.type).toBe("timeseries");
  });

  it("accepts max with timeseries args (polymorphic)", () => {
    const result = check("max(ret_1d, vol_20d)");
    expect(result.ok).toBe(true);
    expect(result.type).toBe("timeseries");
  });

  it("accepts min with scalar args", () => {
    const result = check("min(1, 2)");
    expect(result.ok).toBe(true);
    expect(result.type).toBe("scalar");
  });

  it("accepts zscore_ts with scalar arg (scalar promotes to timeseries)", () => {
    // scalar promotes to any type, so zscore_ts(5) is valid
    const result = check("zscore_ts(5)");
    expect(result.ok).toBe(true);
  });

  it("scalar promotes to timeseries for lag first arg", () => {
    // lag(5, 3) -- scalar promotes to timeseries for arg 1
    const result = check("lag(5, 3)");
    expect(result.ok).toBe(true);
  });

  it("rejects rank with timeseries arg (no promotion to cross_section)", () => {
    // rank expects cross_section, timeseries does NOT promote to cross_section
    const result = check("rank(ret_1d)");
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "TYPE_MISMATCH")).toBe(true);
  });
});
