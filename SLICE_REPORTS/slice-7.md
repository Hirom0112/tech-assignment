# Slice S7 — Hardening + docs — SLICE REPORT — ⭐ CORE-SHIPPABLE CHECKPOINT

**Status:** ✅ DONE — **the core (S0–S7) is complete and shippable.**
**Date:** 2026-06-05
**Dispatch:** 2 senior engineers (backend hardening S7-1/2/3/6/8; docs S7-4/5). Director ran S7-7 + the live error matrix.

## What shipped
Production hardening — canonical error contract, request-correlated logging, clean test lifecycle, machine-checkable invariant tests — plus a feature-accurate README, polished API_CONTRACT, and all 7 assumptions reconciled into their docs.

## Definition of Done — evidence

| DoD check | Result | Evidence |
|---|---|---|
| `npm test` green, both packages | ✅ | backend **141**, frontend **18** (159 total) |
| Backend test exits clean (no `--forceExit`) | ✅ | S7-8: `closeDb()` in teardown; no "Force exiting"/open-handle line; `--forceExit` removed |
| **§3 error contract canonical + live** | ✅ | `404 NotFound · 401 Unauthorized · 403 Forbidden · 400 BadRequest · 409 Conflict` all `{error:"<Label>",message}`; unknown route → 404 NotFound (the High review finding — fixed) |
| Error normalizer + test-per-code-path | ✅ | `src/middleware/error.ts`, `error.test.ts` (6 codes + non-leaking 500), `error-routing.int.test.ts` |
| Logging (NFR-6) | ✅ | `correlationId` via `crypto.randomUUID()` (zero-dep); `{playerId,correlationId}` on every write path |
| **SM-5 invariants** tagged tests | ✅ | `grep SM-5` → (a) dup same-day no double-increment, (b) 2-day-gap+1-freeze resets, (c) milestone once-per-instance, (d) calendar = one Query |
| STND-3 / STND-4 greps | ✅ | no `console.log`; no streak-counter `ADD`; no `Scan`; only `new Date` is the health timestamp (not day-math) |
| README runs to a seeded dashboard | ✅ | curl examples verified live; `docker compose --profile streaks up` + `node scripts/seed-streaks.js` + `localhost:4001`; screenshot embedded |
| ASSUMPTIONS A-1..A-7 reconciled | ✅ | each marked `✅ Reconciled (S7)`; target docs edited (table below) |
| ≥4 ADRs | ✅ | ARCHITECTURE §11 = 11 ADRs (added ADR-10 zero-dep rewardId, ADR-11 error-contract 500-not-503) |

## Assumptions reconciled (STND-1 closed)
A-1→TECH_STACK §4 (`dev-internal-secret`); A-2→API_CONTRACT note (examples illustrative, seed `streak-NNN`); A-3→ARCHITECTURE §7 (500 not 503); A-4→TECH_STACK §2 + TODO (`serverless-esbuild ^1.55.0`); A-5→TECH_STACK §3 (offline winston-external + DynamoDB-Local creds); A-6→DATA_MODEL §7 pattern E (conditional merge); A-7→DATA_MODEL §4 (zero-dep rewardId).

## Open items flagged for post-core docs polish (NOT blocking core)
1. **`RESEARCH.md` is absent from the skeleton repo** (it lives in the parent dir, a separate git root), so the many `RESEARCH.md Q*` citations across the doc suite are dangling within this repo. The README's "Hot Streak" framing is grounded in PROJECT.md, but a docs-align pass should either vendor RESEARCH.md into the repo or sweep the citations.
2. **API_CONTRACT §4.8 (admin history, FR-8) / §4.9 (share-card, FR-9) are spec-locked but not mounted** — they return 404 (S8/S9 bonus). Annotated as deferred in the contract + README.

## Core status
**S0–S7 complete.** All FR-1..FR-6 + the FR-7 notification payload (content) shipped, tested (159), live-verified, documented. Remaining work is bonus only: **S8** (FR-7 audit / FR-8 admin history / FR-10 scheduled-freeze cron), **S9** (FR-9 share-card), **S10** (NFR-10 CI), plus the user-requested **BL-1/2/3** (intro→login flow, 3 dashboard themes). The over-scope rule is satisfied: core ships complete before any bonus.

## Commits
- `2470f03` feat: error-normalizing middleware + canonical 404, correlationId
- `f4a8354` test: SM-5 invariant assertions (greppable)
- `b28c464` chore: close DB handle in teardown, drop jest --forceExit
- `18f7c8b` docs: feature-accurate README
- `3dac9b1` docs: polish API_CONTRACT + reconcile ASSUMPTIONS A-1..A-7 + ADRs
