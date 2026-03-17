# Contributing to SignalForge Open-Core DSL

## Reporting Bugs

Open a GitHub Issue with:
- A clear title and description
- Steps to reproduce
- Expected vs. actual behavior
- Environment details (OS, Node version, pnpm version)

## Submitting Pull Requests

1. Fork the repository and create a branch from `main` (e.g., `feature/my-change` or `fix/my-bug`).
2. Make your changes following the code standards below.
3. Run `pnpm test && pnpm typecheck && pnpm lint` and ensure all pass.
4. Open a PR against `main` with a clear description of the change and why it is needed.
5. A maintainer will review and request changes or approve.

**Never commit directly to `main`.** All changes go through PRs.

## Contributor License Agreement (CLA)

Before your first PR is merged, you must sign the CLA. To sign:

1. Read [CLA.md](./CLA.md).
2. Add the following comment to your first PR:

   ```
   I have read and agree to the SignalForge CLA. GitHub: @<your-username>, Date: YYYY-MM-DD
   ```

PRs without a CLA signature will not be merged.

## Code Standards

- **TypeScript strict mode**: all new code must compile under `strict: true`. No `any` types.
- **Dependency versions**: pin all versions exactly in `package.json`. No `^` or `~` prefixes.
- **Formatting and linting**: follow the existing ESLint configuration. Run `pnpm test && pnpm typecheck && pnpm lint` before submitting.
- **Tests**: add or update tests for any logic changes. PRs that reduce coverage will be asked to add tests before merging.
- **Commits**: use conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`, etc.).

## Zero-Dependency Rule

`@signalforge/dsl-core` has **zero runtime dependencies**. Do not add any. `@signalforge/dsl-explainer` may only depend on `@signalforge/dsl-core`.

Neither package may import from, or depend on, any closed-source SignalForge components.

## Proposing New Fields or Functions

The DSL field registry (`allowed-fields.ts`) and function registry (`allowed-functions.ts`) are intentionally conservative. To propose a new field or function:

1. Open an issue describing the factor, its data source, and a concrete formula use case.
2. A maintainer will assess data availability in the SignalForge scoring pipeline before accepting.
3. Once approved, submit a PR adding the registry entry, type signature, and tests.

## License

Contributions to this repository are licensed under AGPL-3.0. By submitting a PR you agree that your contribution is governed by this license, as described in [CLA.md](./CLA.md).
