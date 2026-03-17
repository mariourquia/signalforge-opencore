// @signalforge/dsl-explainer -- Methodology tag inference
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { AstNode } from "@signalforge/dsl-core";

// ---------------------------------------------------------------------------
// Tag types
// ---------------------------------------------------------------------------

export type MethodologyTag =
  | "momentum"
  | "value"
  | "volatility"
  | "quality"
  | "liquidity"
  | "size"
  | "multi-factor"
  | "mean-reversion"
  | "trend";

// ---------------------------------------------------------------------------
// Field family detection
// ---------------------------------------------------------------------------

function collectFieldNames(node: AstNode): Set<string> {
  const fields = new Set<string>();
  function walk(n: AstNode): void {
    switch (n.kind) {
      case "FieldRef":
        fields.add(n.name);
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

type FieldFamily = "momentum" | "mean-reversion" | "volatility" | "liquidity";

function classifyFieldFamily(fieldName: string): FieldFamily | null {
  // Momentum fields: longer-horizon returns and explicit momentum
  if (
    fieldName === "ret_126d" ||
    fieldName === "ret_252d" ||
    fieldName === "mom_12m" ||
    fieldName === "ret_63d"
  ) {
    return "momentum";
  }

  // Mean-reversion fields: short-horizon returns
  if (
    fieldName === "ret_1d" ||
    fieldName === "ret_5d" ||
    fieldName === "ret_20d"
  ) {
    return "mean-reversion";
  }

  // Volatility fields
  if (
    fieldName.startsWith("vol_") ||
    fieldName.startsWith("beta_")
  ) {
    return "volatility";
  }

  // Liquidity fields
  if (fieldName.startsWith("dollar_volume_")) {
    return "liquidity";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tag inference
// ---------------------------------------------------------------------------

export function inferMethodologyTags(
  ast: AstNode,
): readonly MethodologyTag[] {
  const fields = collectFieldNames(ast);
  const tags = new Set<MethodologyTag>();
  const families = new Set<FieldFamily>();

  for (const field of fields) {
    const family = classifyFieldFamily(field);
    if (family !== null) {
      families.add(family);
      tags.add(family);
    }
  }

  // Multi-factor: 2+ distinct field families
  if (families.size >= 2) {
    tags.add("multi-factor");
  }

  // Sort for deterministic output
  const ordered: MethodologyTag[] = [
    "momentum",
    "value",
    "volatility",
    "quality",
    "liquidity",
    "size",
    "multi-factor",
    "mean-reversion",
    "trend",
  ];

  return ordered.filter((t) => tags.has(t));
}
