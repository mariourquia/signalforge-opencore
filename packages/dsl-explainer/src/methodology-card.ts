// @signalforge/dsl-explainer -- Methodology card builder
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { AstNode, CompileConfig } from "@signalforge/dsl-core";
import { explainFormula } from "./explain.js";
import { inferMethodologyTags } from "./summarize-tags.js";
import type { MethodologyTag } from "./summarize-tags.js";

// ---------------------------------------------------------------------------
// Methodology card
// ---------------------------------------------------------------------------

export interface MethodologyCard {
  readonly signalSummary: string;
  readonly selectionRule: string;
  readonly portfolioConstruction: string;
  readonly riskControl: string;
  readonly tags: readonly MethodologyTag[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function buildSelectionRule(config: CompileConfig): string {
  return (
    `Select the top ${config.maxHoldings} and bottom ${config.minHoldings} ` +
    `scoring assets from the ${config.universe} universe, ` +
    `rebalanced ${config.rebalanceFrequency}.`
  );
}

function buildPortfolioConstruction(config: CompileConfig): string {
  const method =
    config.weightingMethod === "equal_weight"
      ? "equal-weighted"
      : "score-weighted";
  return (
    `${method} portfolio with a maximum position weight of ` +
    `${(config.maxPositionWeight * 100).toFixed(0)}%.`
  );
}

function buildRiskControl(config: CompileConfig): string {
  const parts: string[] = [];
  parts.push(
    `Turnover capped at ${config.turnoverCapPct}% per rebalance period`,
  );
  parts.push(
    `transaction costs modeled at ${config.transactionCostBps} bps`,
  );
  return parts.join("; ") + ".";
}

export function buildMethodologyCard(
  ast: AstNode,
  config: CompileConfig,
): MethodologyCard {
  const { summary } = explainFormula(ast);
  const tags = inferMethodologyTags(ast);

  return {
    signalSummary: summary,
    selectionRule: buildSelectionRule(config),
    portfolioConstruction: buildPortfolioConstruction(config),
    riskControl: buildRiskControl(config),
    tags,
  };
}
