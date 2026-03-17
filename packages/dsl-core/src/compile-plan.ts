// @signalforge/dsl-core -- Execution plan compiler
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { AstNode } from "./ast.js";
import { normalizeFormula } from "./normalize.js";
import type { NormalizedNode } from "./normalize.js";
import { printAst } from "./printer.js";

// ---------------------------------------------------------------------------
// Config and plan types
// ---------------------------------------------------------------------------

export interface CompileConfig {
  readonly universe: string;
  readonly rebalanceFrequency: "weekly" | "monthly";
  readonly weightingMethod: "equal_weight" | "score_weight";
  readonly maxHoldings: number;
  readonly minHoldings: number;
  readonly maxPositionWeight: number;
  readonly turnoverCapPct: number;
  readonly transactionCostBps: number;
}

export type ExecutionStep =
  | { readonly op: "load_field"; readonly field: string }
  | { readonly op: "literal"; readonly value: number }
  | { readonly op: "call"; readonly fn: string; readonly arity: number }
  | { readonly op: "binary"; readonly operator: "+" | "-" | "*" | "/" }
  | { readonly op: "nary"; readonly operator: "+" | "*"; readonly count: number };

export interface ExecutionPlan {
  readonly version: 1;
  readonly formulaDsl: string;
  readonly normalizedDsl: string;
  readonly fingerprint: string;
  readonly nearDuplicateFingerprint: string;
  readonly ast: object;
  readonly steps: readonly ExecutionStep[];
  readonly requiredFields: readonly string[];
  readonly requiredFunctions: readonly string[];
  readonly config: CompileConfig;
}

export const MAX_EXECUTION_STEPS = 50;

// ---------------------------------------------------------------------------
// Error for complexity ceiling
// ---------------------------------------------------------------------------

export class FormulaTooComplexError extends Error {
  constructor(stepCount: number) {
    super(
      `Formula too complex: ${stepCount} steps exceeds maximum of ${MAX_EXECUTION_STEPS}`,
    );
    this.name = "FormulaTooComplexError";
  }
}

// ---------------------------------------------------------------------------
// Post-order walk to emit stack-based steps
// ---------------------------------------------------------------------------

function emitSteps(node: NormalizedNode, steps: ExecutionStep[]): void {
  switch (node.kind) {
    case "NumberLiteral":
      steps.push({ op: "literal", value: node.value });
      break;

    case "FieldRef":
      steps.push({ op: "load_field", field: node.name });
      break;

    case "NaryExpr":
      for (const child of node.children) {
        emitSteps(child, steps);
      }
      steps.push({ op: "nary", operator: node.op, count: node.children.length });
      break;

    case "UnaryExpr":
      // After normalization this should be rare, but handle it
      emitSteps(node.operand as NormalizedNode, steps);
      steps.push({ op: "literal", value: -1 });
      steps.push({ op: "binary", operator: "*" });
      break;

    case "FunctionCall": {
      if (node.name === "__div__") {
        // Internal division representation
        emitSteps(node.args[0]!, steps);
        emitSteps(node.args[1]!, steps);
        steps.push({ op: "binary", operator: "/" });
      } else {
        for (const arg of node.args) {
          emitSteps(arg, steps);
        }
        steps.push({ op: "call", fn: node.name, arity: node.args.length });
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Collect required fields and functions
// ---------------------------------------------------------------------------

function collectFields(node: NormalizedNode, fields: Set<string>): void {
  switch (node.kind) {
    case "NumberLiteral":
      break;
    case "FieldRef":
      fields.add(node.name);
      break;
    case "NaryExpr":
      for (const child of node.children) {
        collectFields(child, fields);
      }
      break;
    case "UnaryExpr":
      collectFields(node.operand as NormalizedNode, fields);
      break;
    case "FunctionCall":
      for (const arg of node.args) {
        collectFields(arg, fields);
      }
      break;
  }
}

function collectFunctions(node: NormalizedNode, fns: Set<string>): void {
  switch (node.kind) {
    case "NumberLiteral":
    case "FieldRef":
      break;
    case "NaryExpr":
      for (const child of node.children) {
        collectFunctions(child, fns);
      }
      break;
    case "UnaryExpr":
      collectFunctions(node.operand as NormalizedNode, fns);
      break;
    case "FunctionCall":
      if (node.name !== "__div__") {
        fns.add(node.name);
      }
      for (const arg of node.args) {
        collectFunctions(arg, fns);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function compileExecutionPlan(
  ast: AstNode,
  config: CompileConfig,
): Promise<ExecutionPlan> {
  const formulaDsl = printAst(ast);
  const {
    normalizedAst,
    normalizedDsl,
    fingerprint,
    nearDuplicateFingerprint,
  } = await normalizeFormula(ast);

  const steps: ExecutionStep[] = [];
  emitSteps(normalizedAst, steps);

  if (steps.length > MAX_EXECUTION_STEPS) {
    throw new FormulaTooComplexError(steps.length);
  }

  const fields = new Set<string>();
  collectFields(normalizedAst, fields);

  const fns = new Set<string>();
  collectFunctions(normalizedAst, fns);

  return {
    version: 1,
    formulaDsl,
    normalizedDsl,
    fingerprint,
    nearDuplicateFingerprint,
    ast: JSON.parse(JSON.stringify(normalizedAst)) as object,
    steps,
    requiredFields: Array.from(fields).sort(),
    requiredFunctions: Array.from(fns).sort(),
    config,
  };
}
