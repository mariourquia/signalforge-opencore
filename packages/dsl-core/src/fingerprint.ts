// @signalforge/dsl-core -- AST fingerprinting
// AGPL-3.0-only -- must NEVER import from closed packages.

import { sha256Truncated } from "./utils/hash.js";
import type { NormalizedNode } from "./normalize.js";

// ---------------------------------------------------------------------------
// Structural hash string builders
// ---------------------------------------------------------------------------

function hashString(node: NormalizedNode): string {
  switch (node.kind) {
    case "NumberLiteral":
      return `NUM:${node.value}`;
    case "FieldRef":
      return `FIELD:${node.name}`;
    case "NaryExpr":
      return `NARY:${node.op}[${node.children.map(hashString).join(",")}]`;
    case "FunctionCall": {
      if (node.name === "__div__") {
        const [left, right] = node.args;
        return `DIV:${hashString(left!)},${hashString(right!)}`;
      }
      return `FN:${node.name}(${node.args.map(hashString).join(",")})`;
    }
    case "UnaryExpr":
      // After normalization, UnaryExpr should be rare (converted to *-1)
      // but handle it for completeness
      return `NEG:${hashString(node.operand as NormalizedNode)}`;
  }
}

function fingerprintString(node: NormalizedNode): string {
  switch (node.kind) {
    case "NumberLiteral":
      return "N";
    case "FieldRef":
      return "F";
    case "NaryExpr":
      return `NARY:${node.op}[${node.children.map(fingerprintString).join(",")}]`;
    case "FunctionCall": {
      if (node.name === "__div__") {
        const [left, right] = node.args;
        return `DIV:${fingerprintString(left!)},${fingerprintString(right!)}`;
      }
      return `FN:${node.name}(${node.args.map(fingerprintString).join(",")})`;
    }
    case "UnaryExpr":
      return `NEG:${fingerprintString(node.operand as NormalizedNode)}`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a content-aware hash of the normalized AST.
 * Includes field names and numeric values. SHA-256 truncated to 128 bits.
 */
export async function computeHash(node: NormalizedNode): Promise<string> {
  return sha256Truncated(hashString(node));
}

/**
 * Compute a near-duplicate fingerprint.
 * Field names are erased to "F" and numbers to "N", then the structural
 * string is hashed. Two formulas with the same structure but different
 * fields/constants will have the same fingerprint.
 */
export async function computeFingerprint(node: NormalizedNode): Promise<string> {
  return sha256Truncated(fingerprintString(node));
}
