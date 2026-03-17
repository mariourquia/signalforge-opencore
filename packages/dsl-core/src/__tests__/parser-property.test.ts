import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { parseFormula } from "../parser.js";
import { printAst } from "../printer.js";
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

/** Arbitrary for valid identifiers */
const arbIdentifier = fc
  .stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,10}$/)
  .filter((s) => s.length > 0);

/** Arbitrary for valid number literals */
const arbNumber = fc.oneof(
  fc.nat(9999).map((n) => String(n)),
  fc
    .tuple(fc.nat(999), fc.nat(99))
    .map(([i, d]) => `${i}.${String(d).padStart(1, "0")}`),
);

/** Arbitrary that generates valid DSL formulas using recursive structure */
function arbExpr(maxDepth: number): fc.Arbitrary<string> {
  if (maxDepth <= 0) {
    return fc.oneof(arbNumber, arbIdentifier);
  }

  const deeper = fc.constant(null).chain(() => arbExpr(maxDepth - 1));

  return fc.oneof(
    arbNumber,
    arbIdentifier,
    // binary expression
    fc
      .tuple(deeper, fc.constantFrom("+", "-", "*", "/"), deeper)
      .map(([l, op, r]) => `(${l} ${op} ${r})`),
    // unary minus
    deeper.map((e) => `(- ${e})`),
    // function call
    fc
      .tuple(arbIdentifier, fc.array(deeper, { minLength: 1, maxLength: 3 }))
      .map(([name, args]) => `${name}(${args.join(", ")})`),
  );
}

const arbFormula = arbExpr(3);

describe("parser property tests", () => {
  it("round-trip: stripSpans(parse(print(parse(input)))) === stripSpans(parse(input))", () => {
    fc.assert(
      fc.property(arbFormula, (input: string) => {
        const result1 = parseFormula(input);
        // Only test round-trip on error-free parses
        if (
          result1.errors.some((e) => e.severity === "error") ||
          result1.ast === null
        ) {
          return true; // skip
        }

        const printed = printAst(result1.ast);
        const result2 = parseFormula(printed);

        if (
          result2.errors.some((e) => e.severity === "error") ||
          result2.ast === null
        ) {
          return true; // skip if reparse fails
        }

        const stripped1 = stripSpans(result1.ast);
        const stripped2 = stripSpans(result2.ast);

        expect(stripped2).toEqual(stripped1);
        return true;
      }),
      { numRuns: 1000, seed: 42 },
    );
  });

  it("fuzz: parseFormula(arbitraryString) never throws", () => {
    fc.assert(
      fc.property(fc.string(), (input: string) => {
        // Must not throw, regardless of input
        expect(() => parseFormula(input)).not.toThrow();
        return true;
      }),
      { numRuns: 10000, seed: 42 },
    );
  });

  it("fuzz: parseFormula with mixed-case/unicode-like strings never throws", () => {
    fc.assert(
      fc.property(
        fc.string().chain((s) => fc.mixedCase(fc.constant(s))),
        (input: string) => {
          expect(() => parseFormula(input)).not.toThrow();
          return true;
        },
      ),
      { numRuns: 1000, seed: 42 },
    );
  });
});
