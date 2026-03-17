// @signalforge/dsl-core -- Allowed-functions registry
// AGPL-3.0-only -- must NEVER import from closed packages.

export interface FunctionRegistryEntry {
  readonly name: string;
  readonly arity: number;
  readonly paramNames: readonly string[];
}

export const FUNCTION_REGISTRY: ReadonlyMap<string, FunctionRegistryEntry> =
  new Map([
    ["zscore_ts", { name: "zscore_ts", arity: 1, paramNames: ["field"] }],
    ["zscore_xs", { name: "zscore_xs", arity: 1, paramNames: ["field"] }],
    ["rank", { name: "rank", arity: 1, paramNames: ["field"] }],
    [
      "lag",
      { name: "lag", arity: 2, paramNames: ["field", "periods"] },
    ],
    ["abs", { name: "abs", arity: 1, paramNames: ["value"] }],
    ["log", { name: "log", arity: 1, paramNames: ["value"] }],
    ["max", { name: "max", arity: 2, paramNames: ["a", "b"] }],
    ["min", { name: "min", arity: 2, paramNames: ["a", "b"] }],
    [
      "clamp",
      { name: "clamp", arity: 3, paramNames: ["value", "low", "high"] },
    ],
  ]);
