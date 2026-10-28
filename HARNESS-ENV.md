# signalforge-opencore harness env

Generated from `ventures/signalforge.json`. Secret values are not in this file.

## Cursor cloud

Single-repo agents read `.cursor/environment.json` when the saved environment points at it.
This repo's install command is `bash .cursor/venture-install.sh`.
Cursor environment name: `mario-signalforge`.
The multi-repo environment points its environment.json location at the
primary repo (`signalforge`).

Environment-scoped secret names for this repo:

- `SF_CLOUD_GH_TOKEN`

Paste values from 1Password into the Cursor dashboard. Leave production MCMC
credentials out of every cloud environment.

## Claude Code

The claude.ai family environment is rendered by `scripts/cloud_envs.py`, not by
this file. Do not add these names to a committed `environment.json` value.
Where a name is still required inside a Claude cloud session, type it into the
claude.ai environment UI. The fleet read tokens (`MARIO_CLOUD_READ_TOKEN`,
`MARIO_CLOUD_READ_TOKEN_CREINT`, `GH_TOKEN`) stay the read-only pair documented
in `docs/cloud-environments.md`.

## Codex

On a machine with the 1Password CLI signed in, inject a gitignored env file:

```bash
op inject -i .env.tpl -o .env
```

Codex has no separate committed env file in this repo. Use the same names.

## Evidence

Names-only inventory 2026-10-26 (sibling .env.example, package.json, Makefile, pyproject.toml, .npmrc, Vercel key names). Commands were not run. Sources: scripts/cloud_envs.py signalforge family

## Unknowns

- Test not encoded: pnpm test / typecheck as defined
- Stack details not fully re-read; family uses pnpm.

## Family drift

Extra versus `FAMILIES`: none.
In the Claude family but not this venture: none.
