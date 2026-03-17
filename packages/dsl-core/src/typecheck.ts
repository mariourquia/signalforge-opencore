// @signalforge/dsl-core -- Type checker
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { AstNode, Span } from "./ast.js";
import type { CompilerError } from "./errors.js";
import { ALLOWED_FIELDS } from "./allowed-fields.js";
import { levenshtein } from "./utils/levenshtein.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValueType = "scalar" | "timeseries" | "cross_section";

export interface ParamDef {
  readonly name: string;
  readonly type: ValueType;
}

export interface FunctionSig {
  readonly name: string;
  readonly params: readonly ParamDef[];
  readonly returnType: ValueType;
  readonly polymorphic?: boolean; // if true, accepts any type and returns same type as first arg
}

export interface FieldSchema {
  readonly name: string;
  readonly type: ValueType;
}

export interface TypeContext {
  readonly fields: ReadonlyMap<string, FieldSchema>;
}

export interface TypecheckResult {
  readonly ok: boolean;
  readonly type: ValueType;
  readonly errors: readonly CompilerError[];
}

// ---------------------------------------------------------------------------
// Function signature registry (must match FUNCTION_REGISTRY keys exactly)
// ---------------------------------------------------------------------------

export const FUNCTION_SIGNATURES: ReadonlyMap<string, FunctionSig> = new Map([
  [
    "zscore_ts",
    {
      name: "zscore_ts",
      params: [{ name: "field", type: "timeseries" }],
      returnType: "timeseries",
    },
  ],
  [
    "zscore_xs",
    {
      name: "zscore_xs",
      params: [{ name: "field", type: "cross_section" }],
      returnType: "cross_section",
    },
  ],
  [
    "rank",
    {
      name: "rank",
      params: [{ name: "field", type: "cross_section" }],
      returnType: "cross_section",
    },
  ],
  [
    "lag",
    {
      name: "lag",
      params: [
        { name: "field", type: "timeseries" },
        { name: "periods", type: "scalar" },
      ],
      returnType: "timeseries",
    },
  ],
  [
    "abs",
    {
      name: "abs",
      params: [{ name: "value", type: "scalar" }],
      returnType: "scalar",
      polymorphic: true,
    },
  ],
  [
    "log",
    {
      name: "log",
      params: [{ name: "value", type: "scalar" }],
      returnType: "scalar",
      polymorphic: true,
    },
  ],
  [
    "max",
    {
      name: "max",
      params: [
        { name: "a", type: "scalar" },
        { name: "b", type: "scalar" },
      ],
      returnType: "scalar",
      polymorphic: true,
    },
  ],
  [
    "min",
    {
      name: "min",
      params: [
        { name: "a", type: "scalar" },
        { name: "b", type: "scalar" },
      ],
      returnType: "scalar",
      polymorphic: true,
    },
  ],
  [
    "clamp",
    {
      name: "clamp",
      params: [
        { name: "value", type: "scalar" },
        { name: "low", type: "scalar" },
        { name: "high", type: "scalar" },
      ],
      returnType: "scalar",
      polymorphic: true,
    },
  ],
]);

// ---------------------------------------------------------------------------
// Default TypeContext (all ALLOWED_FIELDS as timeseries)
// ---------------------------------------------------------------------------

export function defaultTypeContext(): TypeContext {
  const fields = new Map<string, FieldSchema>();
  for (const name of ALLOWED_FIELDS) {
    fields.set(name, { name, type: "timeseries" });
  }
  return { fields };
}

// ---------------------------------------------------------------------------
// Type promotion
// ---------------------------------------------------------------------------

function promote(a: ValueType, b: ValueType): ValueType {
  if (a === b) return a;
  if (a === "scalar") return b;
  if (b === "scalar") return a;
  // timeseries op cross_section -> cross_section
  return "cross_section";
}

// ---------------------------------------------------------------------------
// Did-you-mean helper (using shared Levenshtein distance)
// ---------------------------------------------------------------------------

export function didYouMean(
  name: string,
  candidates: Iterable<string>,
): string | undefined {
  let bestName: string | undefined;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(name, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      bestName = candidate;
    }
  }

  if (bestName !== undefined && bestDist <= Math.floor(bestName.length / 2) + 1) {
    return bestName;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function unknownFunctionError(
  span: Span,
  name: string,
  suggestion?: string,
): CompilerError {
  const msg = suggestion
    ? `Unknown function '${name}'. Did you mean '${suggestion}'?`
    : `Unknown function '${name}'`;
  return { code: "UNKNOWN_FUNCTION", message: msg, span, severity: "error" };
}

function unknownFieldError(
  span: Span,
  name: string,
  suggestion?: string,
): CompilerError {
  const msg = suggestion
    ? `Unknown field '${name}'. Did you mean '${suggestion}'?`
    : `Unknown field '${name}'`;
  return { code: "UNKNOWN_FIELD", message: msg, span, severity: "error" };
}

function arityMismatchError(
  span: Span,
  name: string,
  expected: number,
  got: number,
): CompilerError {
  return {
    code: "ARITY_MISMATCH",
    message: `Function '${name}' expects ${expected} argument(s), got ${got}`,
    span,
    severity: "error",
  };
}

function typeMismatchError(
  span: Span,
  fnName: string,
  paramName: string,
  expected: ValueType,
  got: ValueType,
): CompilerError {
  return {
    code: "TYPE_MISMATCH",
    message: `Argument '${paramName}' of '${fnName}' expects ${expected}, got ${got}`,
    span,
    severity: "error",
  };
}

function isAssignable(
  actual: ValueType,
  expected: ValueType,
  polymorphic: boolean,
): boolean {
  if (polymorphic) return true;
  if (actual === expected) return true;
  if (actual === "scalar") return true; // scalar promotes to any type
  return false;
}

// ---------------------------------------------------------------------------
// Type checker
// ---------------------------------------------------------------------------

function typecheckNode(
  node: AstNode,
  ctx: TypeContext,
  errors: CompilerError[],
): ValueType {
  switch (node.kind) {
    case "NumberLiteral":
      return "scalar";

    case "FieldRef": {
      const schema = ctx.fields.get(node.name);
      if (schema === undefined) {
        const suggestion = didYouMean(node.name, ctx.fields.keys());
        errors.push(unknownFieldError(node.span, node.name, suggestion));
        return "timeseries"; // assume timeseries to continue checking
      }
      return schema.type;
    }

    case "BinaryExpr": {
      const leftType = typecheckNode(node.left, ctx, errors);
      const rightType = typecheckNode(node.right, ctx, errors);
      return promote(leftType, rightType);
    }

    case "UnaryExpr": {
      return typecheckNode(node.operand, ctx, errors);
    }

    case "FunctionCall": {
      const sig = FUNCTION_SIGNATURES.get(node.name);
      if (sig === undefined) {
        const suggestion = didYouMean(node.name, FUNCTION_SIGNATURES.keys());
        errors.push(unknownFunctionError(node.span, node.name, suggestion));
        // Still typecheck arguments
        for (const arg of node.args) {
          typecheckNode(arg, ctx, errors);
        }
        return "scalar"; // default
      }

      // Check arity
      if (node.args.length !== sig.params.length) {
        errors.push(
          arityMismatchError(
            node.span,
            node.name,
            sig.params.length,
            node.args.length,
          ),
        );
      }

      // Typecheck each arg and check type compatibility
      let inferredReturn = sig.returnType;
      const argCount = Math.min(node.args.length, sig.params.length);
      for (let i = 0; i < argCount; i++) {
        const argType = typecheckNode(node.args[i]!, ctx, errors);
        const paramDef = sig.params[i]!;

        if (
          !isAssignable(argType, paramDef.type, sig.polymorphic === true)
        ) {
          errors.push(
            typeMismatchError(
              node.args[i]!.span,
              sig.name,
              paramDef.name,
              paramDef.type,
              argType,
            ),
          );
        }

        // For polymorphic functions, infer return type from first arg
        if (sig.polymorphic && i === 0) {
          inferredReturn = argType;
        }
      }

      // Still typecheck any extra args (beyond arity) to collect their errors
      for (let i = argCount; i < node.args.length; i++) {
        typecheckNode(node.args[i]!, ctx, errors);
      }

      return inferredReturn;
    }
  }
}

export function typecheckFormula(
  ast: AstNode,
  ctx: TypeContext,
): TypecheckResult {
  const errors: CompilerError[] = [];
  const type = typecheckNode(ast, ctx, errors);

  return {
    ok: errors.length === 0,
    type,
    errors,
  };
}
