# Slice S4 — Freeze protection — SLICE REPORT

**Status:** ✅ DONE (director re-verified host + full live error matrix)
**Date:** 2026-06-05
**Dispatch:** 1 senior-engineer subagent (S4-1..S4-15, TDD). Director ran S4-16.

## What shipped
Lazy freeze evaluation on check-in / hand-completed (grant → consume → transition), the `consumeFreeze` transaction, the monthly free grant, the freezes read, and the admin grant endpoint with the 99 soft cap.

## Definition of Done — evidence

| DoD check | Result | Evidence |
|---|---|---|
| `npm test` green incl. one-day-protected, two-day-reset, both-axes, monthly-grant | ✅ | `Test Suites: 13 / Tests: 93 passed` (+24 over S3; freeze.service 9, repo 22, freeze int 8) |
| `npm run typecheck` | ✅ | 0 errors |
| Live: freeze consume preserves streak | ✅ | seed `loginStreak=9, gap 2, freezes=1` → check-in ⇒ `freezeConsumed:true loginStreak:10 freezesAvailable:0` |
| Live: freezes read | ✅ | `{freezesAvailable:0, freezesUsedThisMonth:1, lastFreezeGrantDate:"2026-06", history:[{date:"2026-06-04", source:"purchased"}]}` |
| Admin grant | ✅ | count 3 → `200 {granted:3, freezesAvailable:3, source:"purchased"}` |
| Admin error matrix | ✅ | count 0 → **400**; no secret → **403** (Inv 10); unknown player → **404**; grant past 99 → **409** `Conflict "exceeds the maximum balance of 99"` |
| **Inv 5** order grant→consume→transition | ✅ | both handlers: `grantMonthlyFreeze` if due → `consumeFreeze` if protecting → transition on protected state; pure `evaluateFreeze` grants first so a fresh freeze can cover the gap |
| gap semantics | ✅ | gap===2+freeze ⇒ protect; gap≥3 (2 missed) ⇒ reset even with a freeze; both axes covered by one consume |
| Inv 3 / STND-4 | ✅ | no `ADD` on streak counters; the only `ADD` is `ADD freezesAvailable :n` (pattern J — allowed on the freeze balance) |
| No `Scan`; freeze history = `Query` | ✅ | no `ScanCommand` in src (NFR-8) |
| No `docClient` in handlers / no console.log / deps unchanged | ✅ | greps clean; STND-5 intact |

## consumeFreeze transaction (Inv 5, one `TransactWriteCommand`, 3 legs)
1. player `Update` — `SET freezesAvailable=:avail, freezesUsedThisMonth=:used` (computed), condition `freezesAvailable > :zero`.
2. `streaks-freeze-history` `Put` — `attribute_not_exists(#date)` (per-missed-day idempotent; lazy path and the future S8 cron can never double-consume).
3. missed-day activity `Update` — `SET freezeUsed=:true, streakBroken=:false`.

## Admin cap mechanism
`grantFreezeAdmin` = `UpdateCommand` `ADD freezesAvailable :n SET updatedAt=:now` with `ConditionExpression: attribute_not_exists(freezesAvailable) OR freezesAvailable <= :capMinusN` (`:capMinusN = 99 - count`). Over-cap ⇒ `ConditionalCheckFailedException` ⇒ handler maps to **409**.

## Source accounting (§4.7 assumption)
A consumed freeze is `source:"free_monthly"` only when the monthly grant landed in the same pass; otherwise `purchased`. (Seed's pre-existing balance consumed → `purchased`, as observed.)

## Notable deviations (logged)
- `advanceLoginStreak`/`advancePlayStreak` gained an optional `expectedLast…Date` (defaults to `yesterday`) so a freeze-protected advance conditions on the real prior date while keeping the existing `:yesterday` tests green. Same override threaded into the milestone-award leg.
- Now **2** `TransactWriteCommand`s in the repo (awardMilestone + consumeFreeze) — both atomic.

## Carried
- S8 scheduled-freeze cron will reuse `consumeFreeze`'s per-day `attribute_not_exists` guard (no parallel impl).

## Commits
- `95d033d` feat: freeze.service — consume/two-day-reset/both-axes/monthly-grant (red→green)
- `8c9287c` feat: repository consumeFreeze transaction + admin grant (cap)
- `e886d81` feat: wire freeze lazy-eval + freezes read + admin grant handlers
- `5e9286e` test: integration freeze protection + admin grant
