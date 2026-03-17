import { describe, expect, it } from "vitest";
import { parseFormula } from "../parser.js";

describe("parser recursion depth", () => {
  it("rejects formulas nested beyond 100 levels", () => {
    const deep = "(".repeat(101) + "ret_1d" + ")".repeat(101);
    const result = parseFormula(deep);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.code === "MAX_DEPTH_EXCEEDED")).toBe(
      true,
    );
  });

  it("accepts formulas nested up to 100 levels", () => {
    const deep = "(".repeat(50) + "ret_1d" + ")".repeat(50);
    const result = parseFormula(deep);
    expect(result.errors.some((e) => e.code === "MAX_DEPTH_EXCEEDED")).toBe(
      false,
    );
  });
});
