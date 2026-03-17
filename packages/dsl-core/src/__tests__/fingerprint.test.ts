import { describe, expect, it } from "vitest";
import { parseFormula } from "../parser.js";
import { normalizeFormula } from "../normalize.js";


async function norm(input: string) {
  const { ast } = parseFormula(input);
  if (!ast) throw new Error(`Parse failed for: ${input}`);
  return normalizeFormula(ast);
}

describe("computeHash", () => {
  it("returns a 32-char hex string (128 bits)", async () => {
    const result = await norm("ret_1d + vol_20d");
    expect(result.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is stable across runs", async () => {
    const r1 = await norm("ret_1d + vol_20d");
    const r2 = await norm("ret_1d + vol_20d");
    expect(r1.fingerprint).toBe(r2.fingerprint);
  });

  it("differs for different formulas", async () => {
    const r1 = await norm("ret_1d + vol_20d");
    const r2 = await norm("ret_5d * beta_60d");
    expect(r1.fingerprint).not.toBe(r2.fingerprint);
  });

  it("is the same for commutative equivalents", async () => {
    const r1 = await norm("ret_1d + vol_20d");
    const r2 = await norm("vol_20d + ret_1d");
    expect(r1.fingerprint).toBe(r2.fingerprint);
  });
});

describe("computeFingerprint (near-duplicate)", () => {
  it("returns a 32-char hex string", async () => {
    const result = await norm("ret_1d + vol_20d");
    expect(result.nearDuplicateFingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is the same for structurally identical formulas with different fields", async () => {
    const r1 = await norm("ret_1d + vol_20d");
    const r2 = await norm("ret_5d + beta_60d");
    // Both are "F + F" structurally
    expect(r1.nearDuplicateFingerprint).toBe(r2.nearDuplicateFingerprint);
  });

  it("is the same for structurally identical formulas with different constants", async () => {
    const r1 = await norm("ret_1d * 2");
    const r2 = await norm("vol_20d * 5");
    // Both are "F * N" structurally
    expect(r1.nearDuplicateFingerprint).toBe(r2.nearDuplicateFingerprint);
  });

  it("differs for structurally different formulas", async () => {
    const r1 = await norm("ret_1d + vol_20d");
    const r2 = await norm("zscore_ts(ret_1d)");
    expect(r1.nearDuplicateFingerprint).not.toBe(r2.nearDuplicateFingerprint);
  });

  it("near-duplicate differs from exact hash for non-trivial formulas", async () => {
    const result = await norm("ret_1d + vol_20d");
    // The exact hash encodes field names, the fingerprint does not
    expect(result.fingerprint).not.toBe(result.nearDuplicateFingerprint);
  });
});

describe("format validation", () => {
  const formulas = [
    "ret_1d",
    "42",
    "ret_1d + vol_20d",
    "zscore_ts(ret_1d)",
    "ret_1d / vol_20d",
    "clamp(ret_1d, 0, 1)",
    "zscore_ts(ret_1d) + rank(vol_20d) * 0.5",
  ];

  for (const formula of formulas) {
    it(`fingerprint format: ${formula}`, async () => {
      const result = await norm(formula);
      expect(result.fingerprint).toMatch(/^[0-9a-f]{32}$/);
      expect(result.nearDuplicateFingerprint).toMatch(/^[0-9a-f]{32}$/);
    });
  }
});
