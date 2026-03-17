// @signalforge/dsl-core -- Allowed-fields registry
// AGPL-3.0-only -- must NEVER import from closed packages.

export const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  "ret_1d",
  "ret_5d",
  "ret_20d",
  "ret_63d",
  "ret_126d",
  "ret_252d",
  "vol_20d",
  "vol_60d",
  "vol_126d",
  "dollar_volume_20d",
  "dollar_volume_60d",
  "beta_60d",
  "mom_12m",
]);
