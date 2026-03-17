import { describe, expect, it } from "vitest";
import { parseFormula } from "../parser.js";
import type { AstNode } from "../ast.js";

/** Strip spans recursively for structural comparison */
function stripSpans(node: AstNode): unknown {
  switch (node.kind) {
    case "NumberLiteral":
      return { kind: node.kind, value: node.value };
    case "FieldRef":
      return { kind: node.kind, name: node.name };
    case "BinaryExpr":
      return {
        kind: node.kind,
        op: node.op,
        left: stripSpans(node.left),
        right: stripSpans(node.right),
      };
    case "UnaryExpr":
      return {
        kind: node.kind,
        op: node.op,
        operand: stripSpans(node.operand),
      };
    case "FunctionCall":
      return {
        kind: node.kind,
        name: node.name,
        args: node.args.map(stripSpans),
      };
  }
}

describe("parser", () => {
  it("parses a number literal", () => {
    const { ast, errors } = parseFormula("42");
    expect(errors).toHaveLength(0);
    expect(ast).toEqual({
      kind: "NumberLiteral",
      value: 42,
      span: { start: 0, end: 2 },
    });
  });

  it("parses a decimal number literal", () => {
    const { ast, errors } = parseFormula("0.5");
    expect(errors).toHaveLength(0);
    expect(ast).not.toBeNull();
    expect(ast!.kind).toBe("NumberLiteral");
    if (ast !== null && ast.kind === "NumberLiteral") {
      expect(ast.value).toBe(0.5);
    }
  });

  it("parses a field ref", () => {
    const { ast, errors } = parseFormula("ret_126d");
    expect(errors).toHaveLength(0);
    expect(ast).toEqual({
      kind: "FieldRef",
      name: "ret_126d",
      span: { start: 0, end: 8 },
    });
  });

  it("parses binary addition", () => {
    const { ast, errors } = parseFormula("a + b");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "+",
      left: { kind: "FieldRef", name: "a" },
      right: { kind: "FieldRef", name: "b" },
    });
  });

  it("parses binary subtraction", () => {
    const { ast, errors } = parseFormula("a - b");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "-",
      left: { kind: "FieldRef", name: "a" },
      right: { kind: "FieldRef", name: "b" },
    });
  });

  it("parses binary multiplication", () => {
    const { ast, errors } = parseFormula("a * b");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "*",
      left: { kind: "FieldRef", name: "a" },
      right: { kind: "FieldRef", name: "b" },
    });
  });

  it("parses binary division", () => {
    const { ast, errors } = parseFormula("a / b");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "/",
      left: { kind: "FieldRef", name: "a" },
      right: { kind: "FieldRef", name: "b" },
    });
  });

  it("respects precedence: a + b * c", () => {
    const { ast, errors } = parseFormula("a + b * c");
    expect(errors).toHaveLength(0);
    // b * c should be grouped first
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "+",
      left: { kind: "FieldRef", name: "a" },
      right: {
        kind: "BinaryExpr",
        op: "*",
        left: { kind: "FieldRef", name: "b" },
        right: { kind: "FieldRef", name: "c" },
      },
    });
  });

  it("respects precedence: a * b + c", () => {
    const { ast, errors } = parseFormula("a * b + c");
    expect(errors).toHaveLength(0);
    // a * b should be grouped first
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "+",
      left: {
        kind: "BinaryExpr",
        op: "*",
        left: { kind: "FieldRef", name: "a" },
        right: { kind: "FieldRef", name: "b" },
      },
      right: { kind: "FieldRef", name: "c" },
    });
  });

  it("left-associativity: a + b + c", () => {
    const { ast, errors } = parseFormula("a + b + c");
    expect(errors).toHaveLength(0);
    // (a + b) + c
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "+",
      left: {
        kind: "BinaryExpr",
        op: "+",
        left: { kind: "FieldRef", name: "a" },
        right: { kind: "FieldRef", name: "b" },
      },
      right: { kind: "FieldRef", name: "c" },
    });
  });

  it("left-associativity: a * b * c", () => {
    const { ast, errors } = parseFormula("a * b * c");
    expect(errors).toHaveLength(0);
    // (a * b) * c
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "*",
      left: {
        kind: "BinaryExpr",
        op: "*",
        left: { kind: "FieldRef", name: "a" },
        right: { kind: "FieldRef", name: "b" },
      },
      right: { kind: "FieldRef", name: "c" },
    });
  });

  it("parentheses override precedence: (a + b) * c", () => {
    const { ast, errors } = parseFormula("(a + b) * c");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "*",
      left: {
        kind: "BinaryExpr",
        op: "+",
        left: { kind: "FieldRef", name: "a" },
        right: { kind: "FieldRef", name: "b" },
      },
      right: { kind: "FieldRef", name: "c" },
    });
  });

  it("parses unary minus", () => {
    const { ast, errors } = parseFormula("-ret_126d");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "UnaryExpr",
      op: "-",
      operand: { kind: "FieldRef", name: "ret_126d" },
    });
  });

  it("unary minus has higher precedence than binary ops", () => {
    const { ast, errors } = parseFormula("-a + b");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "+",
      left: {
        kind: "UnaryExpr",
        op: "-",
        operand: { kind: "FieldRef", name: "a" },
      },
      right: { kind: "FieldRef", name: "b" },
    });
  });

  it("parses a function call with one arg", () => {
    const { ast, errors } = parseFormula("zscore_ts(ret_126d)");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "FunctionCall",
      name: "zscore_ts",
      args: [{ kind: "FieldRef", name: "ret_126d" }],
    });
  });

  it("parses a function call with two args", () => {
    const { ast, errors } = parseFormula("lag(ret_126d, 5)");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "FunctionCall",
      name: "lag",
      args: [
        { kind: "FieldRef", name: "ret_126d" },
        { kind: "NumberLiteral", value: 5 },
      ],
    });
  });

  it("parses nested function calls", () => {
    const { ast, errors } = parseFormula("rank(zscore_ts(ret_126d))");
    expect(errors).toHaveLength(0);
    expect(stripSpans(ast!)).toEqual({
      kind: "FunctionCall",
      name: "rank",
      args: [
        {
          kind: "FunctionCall",
          name: "zscore_ts",
          args: [{ kind: "FieldRef", name: "ret_126d" }],
        },
      ],
    });
  });

  it("parses complex formula with multiple ops and functions", () => {
    const { ast, errors } = parseFormula(
      "zscore_ts(ret_126d) - 0.5 * zscore_ts(vol_20d)",
    );
    expect(errors).toHaveLength(0);
    // zscore_ts(ret_126d) - (0.5 * zscore_ts(vol_20d))
    expect(stripSpans(ast!)).toEqual({
      kind: "BinaryExpr",
      op: "-",
      left: {
        kind: "FunctionCall",
        name: "zscore_ts",
        args: [{ kind: "FieldRef", name: "ret_126d" }],
      },
      right: {
        kind: "BinaryExpr",
        op: "*",
        left: { kind: "NumberLiteral", value: 0.5 },
        right: {
          kind: "FunctionCall",
          name: "zscore_ts",
          args: [{ kind: "FieldRef", name: "vol_20d" }],
        },
      },
    });
  });

  it("parses deeply nested expression", () => {
    const { ast, errors } = parseFormula(
      "rank(zscore_ts(ret_126d) - 0.5 * zscore_ts(vol_20d))",
    );
    expect(errors).toHaveLength(0);
    expect(ast).not.toBeNull();
    expect(ast!.kind).toBe("FunctionCall");
    if (ast !== null && ast.kind === "FunctionCall") {
      expect(ast.name).toBe("rank");
      expect(ast.args).toHaveLength(1);
    }
  });

  it("parses multi-term formula", () => {
    const input =
      "zscore_ts(ret_126d) + 0.25 * zscore_ts(dollar_volume_20d) - 0.5 * zscore_ts(vol_20d)";
    const { ast, errors } = parseFormula(input);
    expect(errors).toHaveLength(0);
    expect(ast).not.toBeNull();
    // Top-level should be (... + ...) - (...)
    expect(ast!.kind).toBe("BinaryExpr");
  });

  describe("FORMULA_CORPUS snapshot tests", () => {
    const FORMULA_CORPUS = [
      "42",
      "ret_126d",
      "-ret_126d",
      "a + b",
      "a + b * c",
      "a * b + c",
      "(a + b) * c",
      "zscore_ts(ret_126d)",
      "zscore_ts(ret_126d) - 0.5 * zscore_ts(vol_20d)",
      "rank(zscore_ts(ret_126d) - 0.5 * zscore_ts(vol_20d))",
      "lag(ret_126d, 5)",
      "zscore_ts(ret_126d) + 0.25 * zscore_ts(dollar_volume_20d) - 0.5 * zscore_ts(vol_20d)",
    ];

    for (const formula of FORMULA_CORPUS) {
      it(`parses without errors: ${formula}`, () => {
        const { ast, errors } = parseFormula(formula);
        expect(ast).not.toBeNull();
        // The corpus uses both known and unknown identifiers, so filter to only hard errors
        const hardErrors = errors.filter((e) => e.severity === "error");
        expect(hardErrors).toHaveLength(0);
      });
    }

    for (const formula of FORMULA_CORPUS) {
      it(`snapshot: ${formula}`, () => {
        const { ast } = parseFormula(formula);
        expect(stripSpans(ast!)).toMatchSnapshot();
      });
    }
  });

  it("has correct span on binary expression", () => {
    const { ast } = parseFormula("a + b");
    expect(ast!.span).toEqual({ start: 0, end: 5 });
  });

  it("has correct span on function call", () => {
    const { ast } = parseFormula("zscore_ts(ret_126d)");
    expect(ast!.span).toEqual({ start: 0, end: 19 });
  });

  it("has correct span on unary expression", () => {
    const { ast } = parseFormula("-a");
    expect(ast!.span).toEqual({ start: 0, end: 2 });
  });
});
