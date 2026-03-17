// @signalforge/dsl-core -- Set-based CTE generator for scoring queries
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { ExecutionStep } from "./compile-plan.js";

const FIELD_NAME_RE = /^[a-z][a-z0-9_]*$/;

export interface ScoringCteOptions {
  readonly steps: readonly ExecutionStep[];
  readonly requiredFields: readonly string[];
  readonly requiredFunctions: readonly string[];
}

export interface ScoringCteResult {
  readonly sql: string;
  readonly projectedFields: readonly string[];
  readonly maxStackDepth: number;
}

// ---------------------------------------------------------------------------
// Internal types for step builder
// ---------------------------------------------------------------------------

interface StepState {
  readonly depth: number;
  readonly prevField: string | null;
}

interface StepCteResult {
  readonly sql: string;
  readonly newDepth: number;
  readonly prevField: string | null;
  readonly needsProjectedJoin: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function validateFieldName(name: string): void {
  if (!FIELD_NAME_RE.test(name)) {
    throw new Error(`Invalid field name: ${JSON.stringify(name)}`);
  }
}

/**
 * Build a comma-separated list of stack column references.
 * prefix="" => "s1, s2, ..." (for FROM without alias)
 * prefix="s" => "s.s1, s.s2, ..." (for FROM with alias "s" in JOIN cases)
 */
function carryColumns(depth: number, prefix: string = ""): string {
  if (depth <= 0) return "";
  const dot = prefix ? `${prefix}.` : "";
  return Array.from({ length: depth }, (_, i) => `${dot}s${i + 1}`).join(", ");
}

function formatLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Literal must be finite: ${value}`);
  }
  const s = String(value);
  return value < 0 ? `(${s})::numeric` : `${s}::numeric`;
}

function binaryExpr(left: string, op: string, right: string): string {
  if (op === "/") return `${left} / NULLIF(${right}, 0)`;
  return `${left} ${op} ${right}`;
}

export function buildProjectionCte(
  requiredFields: readonly string[],
  requiredFunctions: readonly string[],
): { sql: string; columns: string[] } {
  const columns: string[] = [];

  for (const field of requiredFields) {
    validateFieldName(field);
    columns.push(field);
    if (requiredFunctions.includes("zscore_ts")) {
      const col = `zscore_ts_${field}`;
      validateFieldName(col);
      columns.push(col);
    }
    if (
      requiredFunctions.includes("zscore_cs") ||
      requiredFunctions.includes("zscore_xs")
    ) {
      const col = `zscore_cs_${field}`;
      validateFieldName(col);
      columns.push(col);
    }
  }

  const colLines = columns
    .map((col) => `    (fd.payload->>'${col}')::numeric AS ${col}`)
    .join(",\n");

  const sql = `projected AS (
  SELECT
    fd.symbol,
${colLines}
  FROM factors_daily fd
  JOIN universe_membership_daily umd
    ON umd.symbol = fd.symbol
   AND umd.trade_date = fd.trade_date
   AND umd.universe_id = fd.universe_id
  WHERE fd.trade_date = $1
    AND fd.universe_id = $2
    AND umd.is_eligible = true
)`;

  return { sql, columns };
}

// ---------------------------------------------------------------------------
// Step CTE builder
// ---------------------------------------------------------------------------

export function buildStepCte(
  stepIndex: number,
  step: ExecutionStep,
  state: StepState,
): StepCteResult {
  const prevCte = stepIndex === 0 ? "projected" : `step_${stepIndex - 1}`;

  switch (step.op) {
    case "load_field": {
      const newDepth = state.depth + 1;
      let sql: string;
      if (stepIndex === 0) {
        sql = `SELECT symbol, ${step.field} AS s${newDepth} FROM projected`;
      } else {
        const carry = carryColumns(state.depth, "s");
        sql =
          `SELECT s.symbol, ${carry}, p.${step.field} AS s${newDepth}` +
          ` FROM ${prevCte} s JOIN projected p ON p.symbol = s.symbol`;
      }
      return { sql, newDepth, prevField: step.field, needsProjectedJoin: stepIndex > 0 };
    }

    case "literal": {
      const newDepth = state.depth + 1;
      const lit = formatLiteral(step.value);
      let sql: string;
      if (stepIndex === 0) {
        sql = `SELECT symbol, ${lit} AS s${newDepth} FROM projected`;
      } else {
        const carry = carryColumns(state.depth, "");
        sql = `SELECT symbol, ${carry}, ${lit} AS s${newDepth} FROM ${prevCte}`;
      }
      return { sql, newDepth, prevField: null, needsProjectedJoin: false };
    }

    case "binary": {
      if (!["+", "-", "*", "/"].includes(step.operator)) {
        throw new Error(`Invalid binary operator: ${step.operator}`);
      }
      const top = state.depth;
      const second = state.depth - 1;
      const expr = binaryExpr(`s${second}`, step.operator, `s${top}`);
      const newDepth = state.depth - 1;
      const carry = carryColumns(newDepth - 1, "");
      const selectCols = newDepth > 1 ? `${carry}, (${expr}) AS s${newDepth}` : `(${expr}) AS s${newDepth}`;
      const sql = `SELECT symbol, ${selectCols} FROM ${prevCte}`;
      return { sql, newDepth, prevField: null, needsProjectedJoin: false };
    }

    case "nary": {
      if (!["+", "*"].includes(step.operator)) {
        throw new Error(`Invalid nary operator: ${step.operator}`);
      }
      const bottom = state.depth - step.count + 1;
      const operands = Array.from({ length: step.count }, (_, i) => `s${bottom + i}`).join(` ${step.operator} `);
      const newDepth = state.depth - step.count + 1;
      const carry = carryColumns(newDepth - 1, "");
      const selectCols = newDepth > 1 ? `${carry}, (${operands}) AS s${newDepth}` : `(${operands}) AS s${newDepth}`;
      const sql = `SELECT symbol, ${selectCols} FROM ${prevCte}`;
      return { sql, newDepth, prevField: null, needsProjectedJoin: false };
    }

    case "call": {
      return buildCallStepCte(stepIndex, step.fn, step.arity, state, prevCte);
    }
  }
}

function buildCallStepCte(
  stepIndex: number,
  fn: string,
  arity: number,
  state: StepState,
  prevCte: string,
): StepCteResult {
  // zscore functions
  if (fn === "zscore_ts" || fn === "zscore_cs" || fn === "zscore_xs") {
    const prefix = fn === "zscore_ts" ? "zscore_ts" : "zscore_cs";
    const depth = state.depth;

    if (state.prevField === null) {
      // v1 compat: push NULL
      const carry = carryColumns(depth - 1, "");
      const selectCols = depth > 1 ? `${carry}, NULL::numeric AS s${depth}` : `NULL::numeric AS s${depth}`;
      const sql = `SELECT symbol, ${selectCols} FROM ${prevCte}`;
      return { sql, newDepth: depth, prevField: null, needsProjectedJoin: false };
    }

    const lookupCol = `${prefix}_${state.prevField}`;
    let sql: string;

    if (depth === 1 && stepIndex === 0) {
      sql = `SELECT symbol, ${lookupCol} AS s1 FROM projected`;
    } else if (depth === 1 && stepIndex > 0) {
      sql = `SELECT s.symbol, p.${lookupCol} AS s1 FROM ${prevCte} s JOIN projected p ON p.symbol = s.symbol`;
    } else {
      // depth > 1
      const carry = carryColumns(depth - 1, "s");
      sql =
        `SELECT s.symbol, ${carry}, p.${lookupCol} AS s${depth}` +
        ` FROM ${prevCte} s JOIN projected p ON p.symbol = s.symbol`;
    }

    return { sql, newDepth: depth, prevField: null, needsProjectedJoin: true };
  }

  // Pure math functions
  const mathResult = buildMathCallCte(fn, arity, state, prevCte);
  if (mathResult !== null) return mathResult;

  // rank: no-op (v1 compat — 022 had rank_{field} lookup, 026 dropped it. Restore in Phase 3.)
  if (fn === "rank") {
    const carry = carryColumns(state.depth, "");
    const sql = `SELECT symbol, ${carry} FROM ${prevCte}`;
    return { sql, newDepth: state.depth, prevField: null, needsProjectedJoin: false };
  }

  // lag: MVP stub — pop arity-1, replace top with NULL
  if (fn === "lag") {
    const newDepth = state.depth - arity + 1;
    const carry = carryColumns(newDepth - 1, "");
    const selectCols = newDepth > 1 ? `${carry}, NULL::numeric AS s${newDepth}` : `NULL::numeric AS s${newDepth}`;
    const sql = `SELECT symbol, ${selectCols} FROM ${prevCte}`;
    return { sql, newDepth, prevField: null, needsProjectedJoin: false };
  }

  // Unknown function: v1 compat — pop arity-1, leave top unchanged
  const newDepth = state.depth - arity + 1;
  const carry = carryColumns(newDepth, "");
  const sql = `SELECT symbol, ${carry} FROM ${prevCte}`;
  return { sql, newDepth, prevField: null, needsProjectedJoin: false };
}

function buildMathCallCte(
  fn: string,
  arity: number,
  state: StepState,
  prevCte: string,
): StepCteResult | null {
  const d = state.depth;

  let expr: string;
  let newDepth: number;

  switch (fn) {
    case "abs":
      expr = `ABS(s${d})`;
      newDepth = d - arity + 1;
      break;
    case "neg":
      expr = `(-s${d})`;
      newDepth = d - arity + 1;
      break;
    case "log":
      expr = `LN(NULLIF(s${d}, 0))`;
      newDepth = d - arity + 1;
      break;
    case "min":
    case "min2":
      expr = `LEAST(s${d - 1}, s${d})`;
      newDepth = d - arity + 1;
      break;
    case "max":
    case "max2":
      expr = `GREATEST(s${d - 1}, s${d})`;
      newDepth = d - arity + 1;
      break;
    case "clamp":
      // Stack order: value=s{d-2}, min=s{d-1}, max=s{d}
      expr = `GREATEST(s${d - 1}, LEAST(s${d}, s${d - 2}))`;
      newDepth = d - arity + 1;
      break;
    default:
      return null;
  }

  const carry = carryColumns(newDepth - 1, "");
  const selectCols = newDepth > 1 ? `${carry}, ${expr} AS s${newDepth}` : `${expr} AS s${newDepth}`;
  const sql = `SELECT symbol, ${selectCols} FROM ${prevCte}`;
  return { sql, newDepth, prevField: null, needsProjectedJoin: false };
}

// ---------------------------------------------------------------------------
// Full scoring CTE assembly
// ---------------------------------------------------------------------------

export function compileScoringCte(options: ScoringCteOptions): ScoringCteResult {
  const { steps, requiredFields, requiredFunctions } = options;

  if (steps.length === 0) {
    throw new Error("Execution plan must have at least one step");
  }

  const { sql: projCte, columns } = buildProjectionCte(requiredFields, requiredFunctions);

  const stepCtes: string[] = [];
  let state: StepState = { depth: 0, prevField: null };
  let maxDepth = 0;

  for (let i = 0; i < steps.length; i++) {
    const result = buildStepCte(i, steps[i]!, state);
    stepCtes.push(`step_${i} AS (\n  ${result.sql}\n)`);
    state = { depth: result.newDepth, prevField: result.prevField };
    if (state.depth > maxDepth) maxDepth = state.depth;
  }

  const lastStep = `step_${steps.length - 1}`;
  const finalSelect = [
    `SELECT symbol, s1 AS score, ROW_NUMBER() OVER (ORDER BY s1 DESC) AS rank`,
    `FROM ${lastStep}`,
    `WHERE s1 IS NOT NULL`,
    `ORDER BY s1 DESC`,
  ].join("\n");

  const sql = `WITH ${projCte},\n${stepCtes.join(",\n")}\n${finalSelect}`;

  return { sql, projectedFields: columns, maxStackDepth: maxDepth };
}
