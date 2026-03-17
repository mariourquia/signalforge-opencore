// @signalforge/dsl-explainer -- Human-readable formula explainer
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { AstNode } from "@signalforge/dsl-core";

// ---------------------------------------------------------------------------
// Field name lookup table
// ---------------------------------------------------------------------------

const FIELD_LABELS: ReadonlyMap<string, string> = new Map([
  ["ret_1d", "previous-day return"],
  ["ret_5d", "5-day return"],
  ["ret_20d", "20-day return"],
  ["ret_63d", "quarterly return"],
  ["ret_126d", "6-month return"],
  ["ret_252d", "12-month return"],
  ["vol_20d", "20-day volatility"],
  ["vol_60d", "60-day volatility"],
  ["vol_126d", "6-month volatility"],
  ["dollar_volume_20d", "20-day average dollar volume"],
  ["dollar_volume_60d", "60-day average dollar volume"],
  ["beta_60d", "60-day beta"],
  ["mom_12m", "12-month momentum"],
]);

function fieldLabel(name: string): string {
  return FIELD_LABELS.get(name) ?? name;
}

// ---------------------------------------------------------------------------
// Explain result
// ---------------------------------------------------------------------------

export interface ExplainResult {
  readonly summary: string;
  readonly steps: readonly string[];
}

// ---------------------------------------------------------------------------
// Step-by-step explanation builder
// ---------------------------------------------------------------------------

function describeNode(node: AstNode): string {
  switch (node.kind) {
    case "NumberLiteral":
      return String(node.value);
    case "FieldRef":
      return fieldLabel(node.name);
    case "BinaryExpr": {
      const left = describeNode(node.left);
      const right = describeNode(node.right);
      const opWord = opToWord(node.op);
      return `${left} ${opWord} ${right}`;
    }
    case "UnaryExpr":
      return `the negative of ${describeNode(node.operand)}`;
    case "FunctionCall": {
      const fnDesc = describeFunctionCall(node.name, node.args);
      return fnDesc;
    }
  }
}

function opToWord(op: "+" | "-" | "*" | "/"): string {
  switch (op) {
    case "+":
      return "plus";
    case "-":
      return "minus";
    case "*":
      return "times";
    case "/":
      return "divided by";
  }
}

function describeFunctionCall(name: string, args: readonly AstNode[]): string {
  const lowerName = name.toLowerCase();
  switch (lowerName) {
    case "zscore_ts":
      return `the time-series z-score of ${describeNode(args[0]!)}`;
    case "zscore_xs":
      return `the cross-sectional z-score of ${describeNode(args[0]!)}`;
    case "rank":
      return `the cross-sectional rank of ${describeNode(args[0]!)}`;
    case "lag":
      return `${describeNode(args[0]!)} lagged by ${describeNode(args[1]!)} periods`;
    case "abs":
      return `the absolute value of ${describeNode(args[0]!)}`;
    case "log":
      return `the natural log of ${describeNode(args[0]!)}`;
    case "max":
      return `the maximum of ${describeNode(args[0]!)} and ${describeNode(args[1]!)}`;
    case "min":
      return `the minimum of ${describeNode(args[0]!)} and ${describeNode(args[1]!)}`;
    case "clamp":
      return `${describeNode(args[0]!)} clamped between ${describeNode(args[1]!)} and ${describeNode(args[2]!)}`;
    default:
      return `${name}(${args.map(describeNode).join(", ")})`;
  }
}

function buildSteps(node: AstNode, steps: string[]): void {
  switch (node.kind) {
    case "NumberLiteral":
    case "FieldRef":
      // Leaf nodes don't need their own step
      break;
    case "BinaryExpr":
      buildSteps(node.left, steps);
      buildSteps(node.right, steps);
      steps.push(
        `Compute ${describeNode(node.left)} ${opToWord(node.op)} ${describeNode(node.right)}`,
      );
      break;
    case "UnaryExpr":
      buildSteps(node.operand, steps);
      steps.push(`Negate ${describeNode(node.operand)}`);
      break;
    case "FunctionCall":
      for (const arg of node.args) {
        buildSteps(arg, steps);
      }
      steps.push(`Apply ${describeFunctionCall(node.name, node.args)}`);
      break;
  }
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function collectFields(node: AstNode): string[] {
  const fields: string[] = [];
  function walk(n: AstNode): void {
    switch (n.kind) {
      case "FieldRef":
        if (!fields.includes(n.name)) fields.push(n.name);
        break;
      case "BinaryExpr":
        walk(n.left);
        walk(n.right);
        break;
      case "UnaryExpr":
        walk(n.operand);
        break;
      case "FunctionCall":
        for (const arg of n.args) walk(arg);
        break;
      case "NumberLiteral":
        break;
    }
  }
  walk(node);
  return fields;
}

function collectFunctions(node: AstNode): string[] {
  const fns: string[] = [];
  function walk(n: AstNode): void {
    switch (n.kind) {
      case "FunctionCall":
        if (!fns.includes(n.name)) fns.push(n.name);
        for (const arg of n.args) walk(arg);
        break;
      case "BinaryExpr":
        walk(n.left);
        walk(n.right);
        break;
      case "UnaryExpr":
        walk(n.operand);
        break;
      case "FieldRef":
      case "NumberLiteral":
        break;
    }
  }
  walk(node);
  return fns;
}

function buildSummary(node: AstNode): string {
  const fields = collectFields(node);
  const fns = collectFunctions(node);

  const fieldDescs = fields.map(fieldLabel);

  let summary = `This signal uses ${fieldDescs.join(", ")}`;

  if (fns.length > 0) {
    const fnDescs = fns.map((f) => f.toLowerCase());
    summary += ` with ${fnDescs.join(", ")}`;
  }

  summary += ".";
  return summary;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function explainFormula(ast: AstNode): ExplainResult {
  const summary = buildSummary(ast);
  const steps: string[] = [];
  buildSteps(ast, steps);

  // If the formula is just a leaf, add a single step
  if (steps.length === 0) {
    steps.push(`Load ${describeNode(ast)}`);
  }

  return { summary, steps };
}
