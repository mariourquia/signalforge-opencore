import { describe, expect, it } from "vitest";
import { tokenize } from "../lexer.js";

describe("lexer", () => {
  it("tokenizes a number literal", () => {
    const { tokens, errors } = tokenize("42");
    expect(errors).toHaveLength(0);
    expect(tokens).toHaveLength(2); // Number + EOF
    expect(tokens[0]).toEqual({
      kind: "Number",
      text: "42",
      span: { start: 0, end: 2 },
    });
    expect(tokens[1]!.kind).toBe("EOF");
  });

  it("tokenizes a decimal number", () => {
    const { tokens, errors } = tokenize("0.5");
    expect(errors).toHaveLength(0);
    expect(tokens[0]).toEqual({
      kind: "Number",
      text: "0.5",
      span: { start: 0, end: 3 },
    });
  });

  it("tokenizes a leading-dot decimal", () => {
    const { tokens, errors } = tokenize(".5");
    expect(errors).toHaveLength(0);
    expect(tokens[0]).toEqual({
      kind: "Number",
      text: ".5",
      span: { start: 0, end: 2 },
    });
  });

  it("tokenizes an identifier", () => {
    const { tokens, errors } = tokenize("ret_126d");
    expect(errors).toHaveLength(0);
    expect(tokens[0]).toEqual({
      kind: "Identifier",
      text: "ret_126d",
      span: { start: 0, end: 8 },
    });
  });

  it("tokenizes all operator types", () => {
    const { tokens, errors } = tokenize("+ - * / ( ) ,");
    expect(errors).toHaveLength(0);
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual([
      "Plus",
      "Minus",
      "Star",
      "Slash",
      "LParen",
      "RParen",
      "Comma",
      "EOF",
    ]);
  });

  it("skips whitespace", () => {
    const { tokens, errors } = tokenize("  42  ");
    expect(errors).toHaveLength(0);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.kind).toBe("Number");
    expect(tokens[0]!.span).toEqual({ start: 2, end: 4 });
  });

  it("reports unknown characters and continues", () => {
    const { tokens, errors } = tokenize("42 @ 7");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("UNEXPECTED_TOKEN");
    expect(errors[0]!.span).toEqual({ start: 3, end: 4 });
    // Still produces tokens for 42 and 7
    expect(tokens.filter((t) => t.kind === "Number")).toHaveLength(2);
  });

  it("tokenizes a complete formula", () => {
    const { tokens, errors } = tokenize("zscore_ts(ret_126d) - 0.5 * zscore_ts(vol_20d)");
    expect(errors).toHaveLength(0);
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual([
      "Identifier", // zscore_ts
      "LParen",
      "Identifier", // ret_126d
      "RParen",
      "Minus",
      "Number", // 0.5
      "Star",
      "Identifier", // zscore_ts
      "LParen",
      "Identifier", // vol_20d
      "RParen",
      "EOF",
    ]);
  });

  it("correct spans across a full formula", () => {
    const { tokens } = tokenize("a + b");
    expect(tokens[0]!.span).toEqual({ start: 0, end: 1 });
    expect(tokens[1]!.span).toEqual({ start: 2, end: 3 });
    expect(tokens[2]!.span).toEqual({ start: 4, end: 5 });
    expect(tokens[3]!.span).toEqual({ start: 5, end: 5 }); // EOF
  });

  it("always emits EOF token for empty input", () => {
    const { tokens, errors } = tokenize("");
    expect(errors).toHaveLength(0);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.kind).toBe("EOF");
    expect(tokens[0]!.span).toEqual({ start: 0, end: 0 });
  });
});
