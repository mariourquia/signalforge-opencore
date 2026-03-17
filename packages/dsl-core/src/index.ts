// @signalforge/dsl-core -- DSL grammar, parser, and compiler
// AGPL-3.0-only -- must NEVER import from closed packages.

export { parseFormula } from "./parser.js";
export type { ParseResult } from "./parser.js";

export type {
  AstNode,
  NumberLiteral,
  FieldRef,
  BinaryExpr,
  UnaryExpr,
  FunctionCall,
  Span,
} from "./ast.js";
export { assertExhaustive } from "./ast.js";

export type { CompilerError, ErrorCode, Severity } from "./errors.js";

export { FUNCTION_REGISTRY } from "./allowed-functions.js";
export type { FunctionRegistryEntry } from "./allowed-functions.js";

export { ALLOWED_FIELDS } from "./allowed-fields.js";

export { printAst } from "./printer.js";

// Type checker
export { typecheckFormula, defaultTypeContext, didYouMean, FUNCTION_SIGNATURES } from "./typecheck.js";
export type {
  ValueType,
  ParamDef,
  FunctionSig,
  FieldSchema,
  TypeContext,
  TypecheckResult,
} from "./typecheck.js";

// Normalizer
export { normalizeFormula, printNormalized } from "./normalize.js";
export type {
  NormalizedNode,
  NormalizedFunctionCall,
  NaryExpr,
  NormalizeResult,
} from "./normalize.js";

// Fingerprint
export { computeHash, computeFingerprint } from "./fingerprint.js";

// Compile plan
export {
  compileExecutionPlan,
  MAX_EXECUTION_STEPS,
  FormulaTooComplexError,
} from "./compile-plan.js";
export type {
  CompileConfig,
  ExecutionStep,
  ExecutionPlan,
} from "./compile-plan.js";

// CTE generator (set-based scoring)
export { compileScoringCte, validateFieldName, buildProjectionCte, buildStepCte } from "./compile-cte.js";
export type { ScoringCteOptions, ScoringCteResult } from "./compile-cte.js";
