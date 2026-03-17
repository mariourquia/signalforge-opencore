// @signalforge/dsl-core -- Error model
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { Span } from "./ast.js";

export type Severity = "error" | "warning";

export type ErrorCode =
  | "UNEXPECTED_TOKEN"
  | "UNEXPECTED_EOF"
  | "EXPECTED_EXPRESSION"
  | "EXPECTED_CLOSING_PAREN"
  | "EXPECTED_COMMA_OR_PAREN"
  | "UNKNOWN_FUNCTION"
  | "UNKNOWN_FIELD"
  | "INVALID_NUMBER"
  | "EMPTY_INPUT"
  | "ARITY_MISMATCH"
  | "TYPE_MISMATCH"
  | "FORMULA_TOO_COMPLEX"
  | "MAX_DEPTH_EXCEEDED";

export interface CompilerError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly span: Span;
  readonly severity: Severity;
}

export function unexpectedToken(
  span: Span,
  got: string,
  expected?: string,
): CompilerError {
  const msg = expected
    ? `Unexpected token '${got}', expected ${expected}`
    : `Unexpected token '${got}'`;
  return { code: "UNEXPECTED_TOKEN", message: msg, span, severity: "error" };
}

export function unexpectedEof(span: Span, expected?: string): CompilerError {
  const msg = expected
    ? `Unexpected end of input, expected ${expected}`
    : `Unexpected end of input`;
  return { code: "UNEXPECTED_EOF", message: msg, span, severity: "error" };
}

export function expectedExpression(span: Span, got: string): CompilerError {
  return {
    code: "EXPECTED_EXPRESSION",
    message: `Expected expression, got '${got}'`,
    span,
    severity: "error",
  };
}

export function expectedClosingParen(span: Span): CompilerError {
  return {
    code: "EXPECTED_CLOSING_PAREN",
    message: "Expected closing ')'",
    span,
    severity: "error",
  };
}

export function expectedCommaOrParen(span: Span, got: string): CompilerError {
  return {
    code: "EXPECTED_COMMA_OR_PAREN",
    message: `Expected ',' or ')' in function arguments, got '${got}'`,
    span,
    severity: "error",
  };
}

export function unknownFunction(
  span: Span,
  name: string,
  suggestion?: string,
): CompilerError {
  const msg = suggestion
    ? `Unknown function '${name}'. Did you mean '${suggestion}'?`
    : `Unknown function '${name}'`;
  return { code: "UNKNOWN_FUNCTION", message: msg, span, severity: "warning" };
}

export function unknownField(span: Span, name: string): CompilerError {
  return {
    code: "UNKNOWN_FIELD",
    message: `Unknown field '${name}'`,
    span,
    severity: "warning",
  };
}

export function invalidNumber(span: Span, text: string): CompilerError {
  return {
    code: "INVALID_NUMBER",
    message: `Invalid number literal '${text}'`,
    span,
    severity: "error",
  };
}

export function emptyInput(span: Span): CompilerError {
  return {
    code: "EMPTY_INPUT",
    message: "Empty input",
    span,
    severity: "error",
  };
}

export function maxDepthExceeded(span: Span): CompilerError {
  return {
    code: "MAX_DEPTH_EXCEEDED",
    message: "Expression nesting exceeds maximum depth of 100",
    span,
    severity: "error",
  };
}
