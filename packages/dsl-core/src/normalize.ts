// @signalforge/dsl-core -- AST normalizer
// AGPL-3.0-only -- must NEVER import from closed packages.

import type {
  AstNode,
  FieldRef,
  NumberLiteral,
  Span,
  UnaryExpr,
} from "./ast.js";
import { computeHash, computeFingerprint } from "./fingerprint.js";

// ---------------------------------------------------------------------------
// Normalized AST types
// ---------------------------------------------------------------------------

export interface NormalizedFunctionCall {
  readonly kind: "FunctionCall";
  readonly name: string;
  readonly args: readonly NormalizedNode[];
  readonly span: Span;
}

export interface NaryExpr {
  readonly kind: "NaryExpr";
  readonly op: "+" | "*";
  readonly children: readonly NormalizedNode[];
  readonly span: Span;
}

export type NormalizedNode =
  | NumberLiteral
  | FieldRef
  | NaryExpr
  | UnaryExpr
  | NormalizedFunctionCall;

// ---------------------------------------------------------------------------
// Normalize result
// ---------------------------------------------------------------------------

export interface NormalizeResult {
  readonly normalizedAst: NormalizedNode;
  readonly normalizedDsl: string;
  readonly fingerprint: string;
  readonly nearDuplicateFingerprint: string;
}

// ---------------------------------------------------------------------------
// Printer for normalized AST
// ---------------------------------------------------------------------------

export function printNormalized(node: NormalizedNode): string {
  switch (node.kind) {
    case "NumberLiteral":
      return String(node.value);
    case "FieldRef":
      return node.name;
    case "NaryExpr": {
      const children = node.children.map(printNormalized).join(` ${node.op} `);
      return `(${children})`;
    }
    case "UnaryExpr": {
      const operand = printNormalized(node.operand as NormalizedNode);
      return `(-${operand})`;
    }
    case "FunctionCall": {
      const args = node.args.map(printNormalized).join(", ");
      return `${node.name}(${args})`;
    }
  }
}

// ---------------------------------------------------------------------------
// Structural hash for sorting (deterministic, fast, not crypto)
// ---------------------------------------------------------------------------

function structuralKey(node: NormalizedNode): string {
  switch (node.kind) {
    case "NumberLiteral":
      return `N:${node.value}`;
    case "FieldRef":
      return `F:${node.name}`;
    case "NaryExpr":
      return `NARY:${node.op}[${node.children.map(structuralKey).join(",")}]`;
    case "UnaryExpr":
      return `U:${structuralKey(node.operand as NormalizedNode)}`;
    case "FunctionCall":
      return `FN:${node.name}(${node.args.map(structuralKey).join(",")})`;
  }
}

// ---------------------------------------------------------------------------
// Normalization passes (applied bottom-up)
// ---------------------------------------------------------------------------

const ZERO_SPAN: Span = { start: 0, end: 0 };

function makeNumber(value: number, span: Span): NumberLiteral {
  return { kind: "NumberLiteral", value, span };
}

function isNumber(node: NormalizedNode, value?: number): node is NumberLiteral {
  if (node.kind !== "NumberLiteral") return false;
  if (value !== undefined) return node.value === value;
  return true;
}

/**
 * Apply all normalization rules bottom-up on a raw AstNode.
 */
function normalizeNode(node: AstNode): NormalizedNode {
  switch (node.kind) {
    case "NumberLiteral":
      return node;

    case "FieldRef":
      return node;

    case "UnaryExpr": {
      // Rule 2: -x -> (-1) * x
      const operand = normalizeNode(node.operand);
      const negOne = makeNumber(-1, ZERO_SPAN);
      return normalizeMultiply([negOne, operand], node.span);
    }

    case "BinaryExpr": {
      const left = normalizeNode(node.left);
      const right = normalizeNode(node.right);

      switch (node.op) {
        case "+":
          return normalizeAdd([left, right], node.span);

        case "-": {
          // Rule 1: a - b -> a + (-1 * b)
          const negOne = makeNumber(-1, ZERO_SPAN);
          const negRight = normalizeMultiply([negOne, right], node.span);
          return normalizeAdd([left, negRight], node.span);
        }

        case "*":
          return normalizeMultiply([left, right], node.span);

        case "/":
          return constantFoldBinary("/", left, right, node.span);
      }
      break;
    }

    case "FunctionCall": {
      // Rule 5: lowercase function names
      const args = node.args.map(normalizeNode);
      const name = node.name.toLowerCase();
      return { kind: "FunctionCall", name, args, span: node.span };
    }
  }

  return node as NormalizedNode;
}

/**
 * Rule 3 + 4 + 6 for addition.
 */
function normalizeAdd(
  children: NormalizedNode[],
  span: Span,
): NormalizedNode {
  // Rule 3: Flatten nested NaryExpr(+)
  const flat: NormalizedNode[] = [];
  for (const child of children) {
    if (child.kind === "NaryExpr" && child.op === "+") {
      flat.push(...child.children);
    } else {
      flat.push(child);
    }
  }

  // Rule 4: Constant fold -- combine numeric terms, remove zeros
  let numericSum = 0;
  const nonNumeric: NormalizedNode[] = [];
  for (const child of flat) {
    if (isNumber(child)) {
      numericSum += child.value;
    } else {
      nonNumeric.push(child);
    }
  }

  const result: NormalizedNode[] = [...nonNumeric];
  if (numericSum !== 0 || result.length === 0) {
    result.push(makeNumber(numericSum, ZERO_SPAN));
  }

  // Rule 4: x + 0 -> x (if we have non-numeric terms and sum is 0, skip 0)
  // Already handled above since we only push numeric if != 0 or no other terms

  if (result.length === 1) return result[0]!;

  // Rule 6: Sort by structural hash
  result.sort((a, b) => structuralKey(a).localeCompare(structuralKey(b)));

  return { kind: "NaryExpr", op: "+", children: result, span };
}

/**
 * Rule 3 + 4 + 6 for multiplication.
 */
function normalizeMultiply(
  children: NormalizedNode[],
  span: Span,
): NormalizedNode {
  // Rule 3: Flatten nested NaryExpr(*)
  const flat: NormalizedNode[] = [];
  for (const child of children) {
    if (child.kind === "NaryExpr" && child.op === "*") {
      flat.push(...child.children);
    } else {
      flat.push(child);
    }
  }

  // Rule 4: x * 0 -> 0
  if (flat.some((c) => isNumber(c, 0))) {
    return makeNumber(0, ZERO_SPAN);
  }

  // Rule 4: Constant fold -- combine numeric terms, remove ones
  let numericProduct = 1;
  const nonNumeric: NormalizedNode[] = [];
  for (const child of flat) {
    if (isNumber(child)) {
      numericProduct *= child.value;
    } else {
      nonNumeric.push(child);
    }
  }

  // If product folded to 0
  if (numericProduct === 0) {
    return makeNumber(0, ZERO_SPAN);
  }

  const result: NormalizedNode[] = [...nonNumeric];
  if (numericProduct !== 1 || result.length === 0) {
    result.push(makeNumber(numericProduct, ZERO_SPAN));
  }

  if (result.length === 1) return result[0]!;

  // Rule 6: Sort by structural hash
  result.sort((a, b) => structuralKey(a).localeCompare(structuralKey(b)));

  return { kind: "NaryExpr", op: "*", children: result, span };
}

/**
 * Constant fold for division (cannot flatten -- not associative).
 */
function constantFoldBinary(
  op: "/",
  left: NormalizedNode,
  right: NormalizedNode,
  span: Span,
): NormalizedNode {
  // n / m -> fold if both are constants
  if (isNumber(left) && isNumber(right) && right.value !== 0) {
    return makeNumber(left.value / right.value, span);
  }
  // 0 / x -> 0
  if (isNumber(left, 0)) {
    return makeNumber(0, span);
  }
  // x / 1 -> x
  if (isNumber(right, 1)) {
    return left;
  }

  // Division is not associative/commutative, so it stays as a binary op.
  // Represented as a FunctionCall with name "__div__" (internal sentinel).
  // The fingerprint module recognizes this and emits DIV:{left},{right}.
  return {
    kind: "FunctionCall",
    name: "__div__",
    args: [left, right],
    span,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function normalizeFormula(ast: AstNode): Promise<NormalizeResult> {
  const normalizedAst = normalizeNode(ast);
  const normalizedDsl = printNormalized(normalizedAst);
  const fingerprint = await computeHash(normalizedAst);
  const nearDuplicateFingerprint = await computeFingerprint(normalizedAst);

  return {
    normalizedAst,
    normalizedDsl,
    fingerprint,
    nearDuplicateFingerprint,
  };
}
