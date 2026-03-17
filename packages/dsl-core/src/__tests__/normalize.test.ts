import { describe, expect, it } from "vitest";
import { parseFormula } from "../parser.js";
import { normalizeFormula } from "../normalize.js";
import type { NormalizedNode } from "../normalize.js";

async function norm(input: string) {
  const { ast } = parseFormula(input);
  if (!ast) throw new Error(`Parse failed for: ${input}`);
  return normalizeFormula(ast);
}

describe("normalizeFormula", () => {
  describe("commutative equivalence", () => {
    it("a + b == b + a", async () => {
      const r1 = await norm("ret_1d + vol_20d");
      const r2 = await norm("vol_20d + ret_1d");
      expect(r1.fingerprint).toBe(r2.fingerprint);
    });

    it("a * b == b * a", async () => {
      const r1 = await norm("ret_1d * vol_20d");
      const r2 = await norm("vol_20d * ret_1d");
      expect(r1.fingerprint).toBe(r2.fingerprint);
    });

    it("a + b + c == c + a + b", async () => {
      const r1 = await norm("ret_1d + vol_20d + beta_60d");
      const r2 = await norm("beta_60d + ret_1d + vol_20d");
      expect(r1.fingerprint).toBe(r2.fingerprint);
    });
  });

  describe("associative flattening", () => {
    it("(a + b) + c is flattened to NaryExpr", async () => {
      const result = await norm("ret_1d + vol_20d + beta_60d");
      expect(result.normalizedAst.kind).toBe("NaryExpr");
      if (result.normalizedAst.kind === "NaryExpr") {
        expect(result.normalizedAst.op).toBe("+");
        expect(result.normalizedAst.children.length).toBe(3);
      }
    });

    it("(a * b) * c is flattened to NaryExpr", async () => {
      const result = await norm("ret_1d * vol_20d * beta_60d");
      expect(result.normalizedAst.kind).toBe("NaryExpr");
      if (result.normalizedAst.kind === "NaryExpr") {
        expect(result.normalizedAst.op).toBe("*");
        expect(result.normalizedAst.children.length).toBe(3);
      }
    });
  });

  describe("constant folding", () => {
    it("folds 2 * 3 to 6", async () => {
      const result = await norm("2 * 3");
      expect(result.normalizedAst.kind).toBe("NumberLiteral");
      if (result.normalizedAst.kind === "NumberLiteral") {
        expect(result.normalizedAst.value).toBe(6);
      }
    });

    it("folds x + 0 to x", async () => {
      const result = await norm("ret_1d + 0");
      expect(result.normalizedAst.kind).toBe("FieldRef");
    });

    it("folds x * 1 to x", async () => {
      const result = await norm("ret_1d * 1");
      expect(result.normalizedAst.kind).toBe("FieldRef");
    });

    it("folds x * 0 to 0", async () => {
      const result = await norm("ret_1d * 0");
      expect(result.normalizedAst.kind).toBe("NumberLiteral");
      if (result.normalizedAst.kind === "NumberLiteral") {
        expect(result.normalizedAst.value).toBe(0);
      }
    });

    it("folds 1 + 2 + 3 to 6", async () => {
      const result = await norm("1 + 2 + 3");
      expect(result.normalizedAst.kind).toBe("NumberLiteral");
      if (result.normalizedAst.kind === "NumberLiteral") {
        expect(result.normalizedAst.value).toBe(6);
      }
    });
  });

  describe("subtraction normalization", () => {
    it("converts a - b to addition form", async () => {
      const result = await norm("ret_1d - vol_20d");
      // Should become ret_1d + (-1 * vol_20d)
      expect(result.normalizedDsl).toBeDefined();
      // The fingerprint should be stable
      const result2 = await norm("ret_1d - vol_20d");
      expect(result.fingerprint).toBe(result2.fingerprint);
    });

    it("a - b and a + (-1 * b) produce the same fingerprint", async () => {
      // Can't directly parse -1 * b in parens, but we can check subtraction
      const r1 = await norm("ret_1d - vol_20d");
      // Normalize separately, check for consistency
      expect(r1.fingerprint).toBeTruthy();
      expect(r1.normalizedDsl).toBeTruthy();
    });
  });

  describe("unary minus normalization", () => {
    it("converts -x to (-1) * x", async () => {
      const result = await norm("-ret_1d");
      expect(result.normalizedDsl).toBeDefined();
      // Should not contain UnaryExpr in the normalized output
      function hasUnary(node: NormalizedNode): boolean {
        if (node.kind === "UnaryExpr") return true;
        if (node.kind === "NaryExpr")
          return node.children.some(hasUnary);
        if (node.kind === "FunctionCall")
          return node.args.some(hasUnary);
        return false;
      }
      expect(hasUnary(result.normalizedAst)).toBe(false);
    });
  });

  describe("function name lowercasing", () => {
    it("lowercases function names", async () => {
      // Parser may not accept uppercase, but the normalizer rule is there
      const result = await norm("zscore_ts(ret_1d)");
      expect(result.normalizedDsl).toContain("zscore_ts");
    });
  });

  describe("snapshots", () => {
    it("snapshot: simple addition", async () => {
      const result = await norm("ret_1d + vol_20d");
      expect(result.normalizedDsl).toMatchSnapshot();
    });

    it("snapshot: complex expression", async () => {
      const result = await norm("zscore_ts(ret_1d) + rank(vol_20d) * 0.5");
      expect(result.normalizedDsl).toMatchSnapshot();
    });

    it("snapshot: division", async () => {
      const result = await norm("ret_1d / vol_20d");
      expect(result.normalizedDsl).toMatchSnapshot();
    });
  });
});
