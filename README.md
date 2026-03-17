```
     _                   _  __
 ___(_) __ _ _ __   __ _| |/ _| ___  _ __ __ _  ___
/ __| |/ _` | '_ \ / _` | | |_ / _ \| '__/ _` |/ _ \
\__ \ | (_| | | | | (_| | |  _| (_) | | | (_| |  __/
|___/_|\__, |_| |_|\__,_|_|_|  \___/|_|  \__, |\___|
       |___/                              |___/
              o p e n - c o r e   d s l
```

# SignalForge Open-Core DSL

The open-source formula compiler behind [SignalForge](https://signalforge.io) --- a public quant research portfolio platform where users build, backtest, and publish simulated equity investment strategies with full transparency.

This repository contains the **DSL compiler** that parses, typechecks, normalizes, and compiles quantitative strategy formulas into execution plans and set-based SQL. It is the scoring engine's brain: the part that turns `zscore_cs(ret_126d) * 0.6 + zscore_cs(vol_20d) * -0.4` into a deterministic, auditable computation.

**License:** AGPL-3.0-only. You can use, modify, and distribute this code freely under the AGPL. If you run a modified version as a service, you must release your changes.

---

## Packages

### `@signalforge/dsl-core`

The foundation. Zero runtime dependencies.

| Module | What it does |
|--------|-------------|
| **Lexer** | Tokenizes DSL formula strings |
| **Parser** | Pratt parser producing a discriminated-union AST |
| **Type checker** | Validates field references, function signatures, and type compatibility |
| **Normalizer** | Canonicalizes ASTs (commutativity, constant folding, operator fusion) |
| **Fingerprint** | SHA-256 structural hash for exact and near-duplicate detection |
| **Compile plan** | Emits a stack-based execution plan (JSON) from the normalized AST |
| **Compile CTE** | Generates set-based SQL (CTE chains) from the execution plan |

### `@signalforge/dsl-explainer`

Turns compiled formulas into human-readable artifacts.

| Module | What it does |
|--------|-------------|
| **Explain** | Plain-English explanation of what a formula computes |
| **Methodology card** | Structured transparency card (inputs, universe, rebalance, weighting) |
| **Tag inference** | Infers strategy style tags (momentum, value, volatility, multi-factor) |

---

## Quick Start

```bash
git clone https://github.com/mariourquia/signalforge-opencore.git
cd signalforge-opencore
pnpm install
pnpm build
pnpm test
```

## Usage

```typescript
import { parseFormula, typecheckFormula, compileExecutionPlan, compileScoringCte } from "@signalforge/dsl-core";
import { explainFormula } from "@signalforge/dsl-explainer";

// 1. Parse
const { ast, errors } = parseFormula("zscore_cs(ret_126d) * 0.6 + zscore_cs(vol_20d) * -0.4");

// 2. Typecheck
const typeResult = typecheckFormula(ast);

// 3. Compile to execution plan
const plan = await compileExecutionPlan(ast, {
  universe: "sp500",
  rebalanceFrequency: "monthly",
  weightingMethod: "equal_weight",
  maxHoldings: 50,
  minHoldings: 20,
  maxPositionWeight: 0.05,
  turnoverCapPct: 25,
  transactionCostBps: 10,
});

// 4. Generate set-based SQL
const { sql } = compileScoringCte({
  steps: plan.steps,
  requiredFields: plan.requiredFields,
  requiredFunctions: plan.requiredFunctions,
});

// 5. Explain in plain English
const explanation = explainFormula(ast);
```

## DSL Reference

### Fields

Factors extracted from daily market data:

| Field | Description |
|-------|------------|
| `ret_1d`, `ret_5d`, `ret_20d`, `ret_63d`, `ret_126d`, `ret_252d` | Lookback returns |
| `vol_20d`, `vol_60d`, `vol_126d` | Realized volatility |
| `dollar_volume_20d`, `dollar_volume_60d` | Liquidity |
| `beta_60d` | Market beta |
| `mom_12m` | 12-month momentum |

### Functions

| Function | Arity | Description |
|----------|-------|------------|
| `zscore_ts(field)` | 1 | Time-series z-score (how unusual is today vs history) |
| `zscore_xs(field)` | 1 | Cross-sectional z-score (how unusual vs peers today) |
| `rank(field)` | 1 | Cross-sectional rank |
| `abs(x)` | 1 | Absolute value |
| `log(x)` | 1 | Natural logarithm |
| `min(a, b)` | 2 | Minimum of two values |
| `max(a, b)` | 2 | Maximum of two values |
| `clamp(x, lo, hi)` | 3 | Clamp value to range |

### Operators

`+`, `-`, `*`, `/` with standard precedence. Parentheses for grouping.

### Example Formulas

```
ret_126d
```
Pure 6-month momentum.

```
zscore_cs(ret_126d) * 0.6 + zscore_cs(vol_20d) * -0.4
```
Cross-sectional momentum/low-vol combo with explicit weighting.

```
zscore_ts(ret_252d) + zscore_xs(dollar_volume_60d)
```
Time-series mean reversion + cross-sectional liquidity tilt.

---

## Architecture

```
Formula DSL string
    |
    v
  [Lexer] --> tokens
    |
    v
  [Parser] --> AST (discriminated union)
    |
    v
  [Type checker] --> validated AST + errors
    |
    v
  [Normalizer] --> canonical AST (commutative sort, constant fold)
    |
    v
  [Fingerprint] --> SHA-256 structural hash
    |
    v
  [Compile plan] --> execution plan (stack-based JSON)
    |
    v
  [Compile CTE] --> set-based SQL (CTE chain, parameterized)
    |
    v
  [Explainer] --> plain-English explanation + methodology card
```

The execution plan is a stack-based instruction sequence with 5 op types: `load_field`, `literal`, `binary`, `nary`, `call`. Each instruction maps deterministically to one SQL CTE --- no runtime branching, no interpreted loops.

---

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build both packages
pnpm test             # Run all tests (224 across 14 files)
pnpm typecheck        # TypeScript strict mode check
pnpm lint             # ESLint
```

### Project structure

```
packages/
  dsl-core/
    src/
      ast.ts              # AST type definitions
      lexer.ts            # Tokenizer
      parser.ts           # Pratt parser
      typecheck.ts        # Type checker + function signatures
      normalize.ts        # AST canonicalization
      fingerprint.ts      # Structural hashing
      compile-plan.ts     # Execution plan compiler
      compile-cte.ts      # Set-based SQL CTE generator
      allowed-fields.ts   # Field registry
      allowed-functions.ts # Function registry
      index.ts            # Public API
    __tests__/            # Vitest test suites
  dsl-explainer/
    src/
      explain.ts          # Plain-English explanations
      methodology-card.ts # Structured transparency cards
      summarize-tags.ts   # Strategy style tag inference
      index.ts            # Public API
    __tests__/
```

---

## Relationship to SignalForge

This repository contains the **open-core** components of the SignalForge platform. The full platform (web application, scoring pipeline, database, leaderboards) is closed-source. The DSL compiler is open because:

1. **Transparency.** Users publish strategies with formulas. The compiler that interprets those formulas should be auditable.
2. **Reproducibility.** Anyone can verify that a formula produces the claimed execution plan.
3. **Contribution.** The quant community can propose new fields, functions, and optimizations.

The compiler has **zero dependencies** on the closed platform. It takes a string in, produces an execution plan and SQL out. The platform consumes these outputs but the compiler knows nothing about the platform.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. By contributing, you agree to the [CLA](CLA.md).

## License

[AGPL-3.0-only](LICENSE) --- GNU Affero General Public License v3.0
