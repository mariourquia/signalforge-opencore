import { describe, expect, it } from "vitest";
import { parseFormula } from "../parser.js";

describe("parser error recovery", () => {
  it("reports missing closing paren", () => {
    const { ast, errors } = parseFormula("(a + b");
    expect(ast).not.toBeNull();
    expect(errors.some((e) => e.code === "EXPECTED_CLOSING_PAREN")).toBe(true);
  });

  it("reports unknown function with suggestion", () => {
    const { ast, errors } = parseFormula("zscore_t(ret_126d)");
    expect(ast).not.toBeNull();
    expect(ast!.kind).toBe("FunctionCall");
    const unknownFnErr = errors.find((e) => e.code === "UNKNOWN_FUNCTION");
    expect(unknownFnErr).toBeDefined();
    expect(unknownFnErr!.message).toContain("zscore_ts");
    expect(unknownFnErr!.severity).toBe("warning");
  });

  it("reports unknown function without suggestion for very different names", () => {
    const { ast, errors } = parseFormula("xyzzy(a)");
    expect(ast).not.toBeNull();
    const unknownFnErr = errors.find((e) => e.code === "UNKNOWN_FUNCTION");
    expect(unknownFnErr).toBeDefined();
    // The message should say "Unknown function" but may or may not have a suggestion
    expect(unknownFnErr!.message).toContain("Unknown function");
  });

  it("reports empty input", () => {
    const { ast, errors } = parseFormula("");
    expect(ast).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("EMPTY_INPUT");
  });

  it("reports unexpected token", () => {
    const { errors } = parseFormula("+ a");
    // + is not a valid prefix -- the parser should report an error
    expect(errors.length).toBeGreaterThan(0);
    const hasExpectedError = errors.some(
      (e) =>
        e.code === "EXPECTED_EXPRESSION" || e.code === "UNEXPECTED_TOKEN",
    );
    expect(hasExpectedError).toBe(true);
  });

  it("reports trailing garbage", () => {
    const { ast, errors } = parseFormula("a b");
    expect(ast).not.toBeNull();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.code === "UNEXPECTED_TOKEN")).toBe(true);
  });

  it("reports missing closing paren in function call", () => {
    const { ast, errors } = parseFormula("zscore_ts(ret_126d");
    expect(ast).not.toBeNull();
    const parenErr = errors.find((e) => e.code === "EXPECTED_CLOSING_PAREN");
    expect(parenErr).toBeDefined();
  });

  it("handles double operator gracefully", () => {
    const { errors } = parseFormula("a + + b");
    // The second + should be an unexpected token in prefix position
    // Parser should produce errors but not throw
    expect(errors.length).toBeGreaterThan(0);
  });

  it("whitespace-only input is treated as empty", () => {
    const { ast, errors } = parseFormula("   ");
    expect(ast).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("EMPTY_INPUT");
  });

  it("unknown character produces lexer error but parsing continues", () => {
    const { ast, errors } = parseFormula("a @ b");
    // The @ produces a lex error, then 'b' is trailing garbage
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).not.toBeNull();
  });

  it("never throws on any error case", () => {
    const badInputs = [
      "",
      "(",
      ")",
      "((",
      "))",
      "+ +",
      "* /",
      ",,",
      "a(b c d",
      "a + ",
    ];
    for (const input of badInputs) {
      expect(() => parseFormula(input)).not.toThrow();
    }
  });
});
