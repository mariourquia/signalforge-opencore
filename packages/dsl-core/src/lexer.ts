// @signalforge/dsl-core -- Lexer
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { Span } from "./ast.js";
import type { CompilerError } from "./errors.js";
import { unexpectedToken } from "./errors.js";

export type TokenKind =
  | "Number"
  | "Identifier"
  | "Plus"
  | "Minus"
  | "Star"
  | "Slash"
  | "LParen"
  | "RParen"
  | "Comma"
  | "EOF";

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly span: Span;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isAlpha(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isAlphaNum(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch);
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

export interface TokenizeResult {
  readonly tokens: readonly Token[];
  readonly errors: readonly CompilerError[];
}

export function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  const errors: CompilerError[] = [];
  let pos = 0;

  while (pos < input.length) {
    const ch = input[pos]!;

    // Skip whitespace
    if (isWhitespace(ch)) {
      pos++;
      continue;
    }

    // Number: integer and decimal (42, 0.5, .5)
    if (isDigit(ch) || (ch === "." && pos + 1 < input.length && isDigit(input[pos + 1]!))) {
      const start = pos;
      while (pos < input.length && isDigit(input[pos]!)) {
        pos++;
      }
      if (pos < input.length && input[pos] === ".") {
        pos++;
        while (pos < input.length && isDigit(input[pos]!)) {
          pos++;
        }
      }
      const text = input.slice(start, pos);
      tokens.push({ kind: "Number", text, span: { start, end: pos } });
      continue;
    }

    // Identifier: [a-zA-Z_][a-zA-Z0-9_]*
    if (isAlpha(ch)) {
      const start = pos;
      while (pos < input.length && isAlphaNum(input[pos]!)) {
        pos++;
      }
      const text = input.slice(start, pos);
      tokens.push({ kind: "Identifier", text, span: { start, end: pos } });
      continue;
    }

    // Single-character tokens
    const start = pos;
    pos++;
    const span: Span = { start, end: pos };

    switch (ch) {
      case "+":
        tokens.push({ kind: "Plus", text: "+", span });
        break;
      case "-":
        tokens.push({ kind: "Minus", text: "-", span });
        break;
      case "*":
        tokens.push({ kind: "Star", text: "*", span });
        break;
      case "/":
        tokens.push({ kind: "Slash", text: "/", span });
        break;
      case "(":
        tokens.push({ kind: "LParen", text: "(", span });
        break;
      case ")":
        tokens.push({ kind: "RParen", text: ")", span });
        break;
      case ",":
        tokens.push({ kind: "Comma", text: ",", span });
        break;
      default:
        errors.push(unexpectedToken(span, ch));
        break;
    }
  }

  // Always emit EOF
  tokens.push({ kind: "EOF", text: "", span: { start: pos, end: pos } });

  return { tokens, errors };
}
