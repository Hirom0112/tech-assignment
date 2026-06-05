# Slice S8 — Bonus: backend extras — SLICE REPORT

**Status:** ✅ DONE (director re-verified host + live admin matrix)
**Date:** 2026-06-05
**Dispatch:** 1 senior engineer (S8-1..S8-5). Director ran S8-6. First bonus slice — core (S0–S7) already shipped.

## What shipped
FR-7 notification-payload audit (no change needed), FR-8 admin composite history endpoint, FR-10 scheduled-freeze cron reusing the live consume path.

## Definition of Done — evidence

| DoD check | Result | Evidence |
|---|---|---|
| `npm test` green incl. admin-history + cron-idempotency | ✅ | `Test Suites: 18 / Tests: 152` (+11 over S7), clean exit |
| `npm run typecheck` | ✅ | 0 errors |
| Live admin history `200` composite | ✅ | `streak-001`: keys `{player, activity, rewards, freezes}`; 54 activity, 12 rewards, notification 5-field |
| Admin auth matrix | ✅ | no secret → **403**; unknown player → **404**; `X-Player-Id`-only → **403** (Inv 10) |
| FR-7 notification audit | ✅ | `…/rewards` carries `{title,body,deepLink:'hijackpoker://streaks',milestone,type}` (content-only) |
| Cron reuses `freeze.service` consume (ADR-2) | ✅ | `scheduled-freeze.ts` calls the SAME `evaluateFreeze`+`consumeFreeze` — no parallel impl |
| Cron idempotent | ✅ | `serverless invoke local -f scheduledFreeze`: run1 consumed 21 / run2 consumed **0** (per-day `attribute_not_exists(date)` guard) |
| **Scan exception** contained (Inv 8) | ✅ | only `ScanCommand` in `src/` is `scheduled-freeze.ts` (commented NFR-8 exception); player/internal/calendar paths Scan-free |
| Cron off by default (FR-10) | ✅ | `serverless.yml` `scheduledFreeze` `schedule` `enabled: ${env:FREEZE_CRON_ENABLED,'false'}`, `cron(5 1 * * ? *)` (01:05 UTC) |
| STND-3/5, Inv 6/9 | ✅ | no console.log, deps unchanged, handlers thin, strict TS |

## Admin history composition
`getPlayerHistoryHandler` (thin, internal-only): `getPlayer`→404 if absent; then `queryActivityRange` (new bounded `BETWEEN` Query, today−60d..today — NOT a Scan), `queryRewards`, `queryFreezeHistory`; composed by `presenter.toAdminHistoryResponse` reusing §4.1/§4.3/§4.4/§4.5 shapes. New `lib/utc.ts:daysAgo` helper.

## Cron
`scheduled-freeze.ts:settleFreeze` runs the live per-player sequence (`evaluateFreeze` → `grantMonthlyFreeze`/`consumeFreeze`). The one sanctioned paginated `Scan` of `streaks-players` (`Limit:100`), commented as the Inv-8 exception. Idempotent via the existing per-day freeze-history guard.

## Notes
- The live cron sweep consumed 21 freezes for **leftover S4 integration-test players** (`test-s4-*`) with gaps — harmless DynamoDB-Local residue; seed players `streak-001..010` untouched (no gap). Could purge `test-*` rows for a pristine local DB; no test/fixture impact.
- S8-1 needed no code change → folded into the admin-history commit.

## Commits
- `936902c` feat: admin player-history composite endpoint (red→green) [+FR-7 audit]
- `a686f1e` feat: scheduled-freeze cron reusing freeze.service consume (red→green)
