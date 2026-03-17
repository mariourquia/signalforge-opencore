// @signalforge/dsl-core -- AST type definitions
// AGPL-3.0-only -- must NEVER import from closed packages.

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface NumberLiteral {
  readonly kind: "NumberLiteral";
  readonly value: number;
  readonly span: Span;
}

export interface FieldRef {
  readonly kind: "FieldRef";
  readonly name: string;
  readonly span: Span;
}

export interface BinaryExpr {
  readonly kind: "BinaryExpr";
  readonly op: "+" | "-" | "*" | "/";
  readonly left: AstNode;
  readonly right: AstNode;
  readonly span: Span;
}

export interface UnaryExpr {
  readonly kind: "UnaryExpr";
  readonly op: "-";
  readonly operand: AstNode;
  readonly span: Span;
}

export interface FunctionCall {
  readonly kind: "FunctionCall";
  readonly name: string;
  readonly args: readonly AstNode[];
  readonly span: Span;
}

export type AstNode =
  | NumberLiteral
  | FieldRef
  | BinaryExpr
  | UnaryExpr
  | FunctionCall;

export function assertExhaustive(node: never): never {
  throw new Error(`Unhandled node kind: ${(node as AstNode).kind}`);
}
