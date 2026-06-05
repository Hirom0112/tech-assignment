# Slice S0 — TypeScript foundation — SLICE REPORT

**Status:** ✅ DONE (all DoD items verified by the director, not assumed)
**Date:** 2026-06-05
**Owner dispatch:** 1 senior-engineer subagent (S0-1..S0-11); director ran the S0-12 gate.

## What shipped
`streaks-api` converted from CommonJS to strict, layered TypeScript, test-runnable, with the 4-table env + internal-secret + cron flag wired through compose / `.env.example` / serverless config. Establishes the green baseline every later slice builds on.

## Definition of Done — item-by-item evidence

| DoD check | Result | Evidence |
|---|---|---|
| `npm run typecheck` → 0 errors | ✅ | `tsc --noEmit` exit 0, no output |
| `npm test` green | ✅ | `Test Suites: 4 passed, 4 total` / `Tests: 12 passed` (utc, health, internalAuth, milestones) |
| Live `GET /api/v1/health` | ✅ | `docker compose --profile streaks up` → `curl localhost:5001/api/v1/health` → `{"service":"streaks-api","status":"ok","timestamp":"2026-06-05T18:48:19Z"}`. **Proves esbuild transpiles `handler.ts` under serverless-offline** (PLAN S0 top risk #2 cleared). |
| Env grep (4 vars) | ✅ | `STREAKS_REWARDS_TABLE`, `STREAKS_FREEZE_HISTORY_TABLE`, `INTERNAL_API_SECRET=dev-internal-secret`, `FREEZE_CRON_ENABLED=false` present in **both** `docker-compose.yml` and `.env.example` |
| STND-3 (no `console.log` in src) | ✅ | `grep -rn 'console.log' src` → none |
| TDD discipline (utc.ts) | ✅ | commit `fe795ae` contains both `utc.test.ts` + `utc.ts` together (red→green) |

## Layered skeleton established (Inv 6)
`src/{handlers,services,repositories,domain,config,lib,middleware,routes,types}` — empty layers hold `.gitkeep`; `lib/utc.ts` (single UTC helper, Inv 1), `middleware/{auth,internalAuth}.ts`, `config/{milestones,constants}.ts` (single-source ladder), ported `routes/health.ts`, typed `handler.ts` (mounts health only; S1 adds player routes).

## Invariants spot-checked
- Inv 1: single `utcDay()` in `lib/utc.ts`; only stray `new Date(` is the health-route server timestamp (not day-math) + the legacy un-imported `dynamo.service.js` stub (removed in S1).
- Inv 9: `strict:true`, typecheck clean, no `any` (shared `dynamo.d.ts` is the sanctioned interop point).
- Inv 11: no table names/keys changed; only the 2 new table-name env vars added.

## Deviations from the written plan (all logged, none silent)
- **ASSUMPTIONS A-4:** TODO/TECH_STACK pinned `serverless-esbuild ^0.8.0`, which does not exist on npm and cannot transpile `.ts`. Resolved to `^1.55.0` (verified by the live health curl). Doc fix deferred to S7 per A-4.
- Dev-only `@types/jest`, `@types/express` added — excluded from the dep budget by TECH_STACK §2/§3; STND-5 intact.

## Carried into S1
- Delete legacy stubs `src/routes/{check-in,streaks}.js` + `src/services/dynamo.service.js` when S1 lands the typed handlers/repository (the second `new Date(` hit lives there).

## Commits
- `3a8b68d` build: TS + ts-jest + esbuild toolchain and tsconfig
- `fe795ae` test: utc unit tests (red→green, test+impl together)
- `5cf6e7b` refactor: port handler/auth/health to TS; layered dirs
- `17676b2` feat: internalAuth + rewards/freeze-history table env
- `59720b2` chore: pre-push hook (typecheck + tests)
- `9d7d395` docs: tick S0-1..S0-11
