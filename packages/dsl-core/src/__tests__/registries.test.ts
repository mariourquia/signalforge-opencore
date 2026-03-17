import { describe, expect, it } from "vitest";
import { FUNCTION_REGISTRY } from "../allowed-functions.js";
import { ALLOWED_FIELDS } from "../allowed-fields.js";

describe("function registry", () => {
  it("has 9 registered functions", () => {
    expect(FUNCTION_REGISTRY.size).toBe(9);
  });

  it("arity matches paramNames length for every entry", () => {
    for (const [_key, entry] of FUNCTION_REGISTRY) {
      expect(entry.paramNames.length).toBe(entry.arity);
    }
  });

  it("map key matches entry name for every entry", () => {
    for (const [key, entry] of FUNCTION_REGISTRY) {
      expect(key).toBe(entry.name);
    }
  });

  it("all function names are lowercase snake_case or single word", () => {
    for (const name of FUNCTION_REGISTRY.keys()) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("contains expected functions", () => {
    const expected = [
      "zscore_ts",
      "zscore_xs",
      "rank",
      "lag",
      "abs",
      "log",
      "max",
      "min",
      "clamp",
    ];
    for (const name of expected) {
      expect(FUNCTION_REGISTRY.has(name)).toBe(true);
    }
  });

  it("has no duplicate entries (map naturally enforces this)", () => {
    const keys = Array.from(FUNCTION_REGISTRY.keys());
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});

describe("allowed fields", () => {
  it("has 13 fields", () => {
    expect(ALLOWED_FIELDS.size).toBe(13);
  });

  it("all field names match [a-z][a-z0-9_]* pattern", () => {
    for (const field of ALLOWED_FIELDS) {
      expect(field).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("contains expected field families", () => {
    // Return fields
    const retFields = Array.from(ALLOWED_FIELDS).filter((f) =>
      f.startsWith("ret_"),
    );
    expect(retFields.length).toBe(6);

    // Volatility fields
    const volFields = Array.from(ALLOWED_FIELDS).filter((f) =>
      f.startsWith("vol_"),
    );
    expect(volFields.length).toBe(3);

    // Dollar volume fields
    const dvFields = Array.from(ALLOWED_FIELDS).filter((f) =>
      f.startsWith("dollar_volume_"),
    );
    expect(dvFields.length).toBe(2);
  });

  it("contains beta_60d and mom_12m", () => {
    expect(ALLOWED_FIELDS.has("beta_60d")).toBe(true);
    expect(ALLOWED_FIELDS.has("mom_12m")).toBe(true);
  });

  it("has no duplicate entries (Set naturally enforces this)", () => {
    const arr = Array.from(ALLOWED_FIELDS);
    const unique = new Set(arr);
    expect(unique.size).toBe(arr.length);
  });
});
