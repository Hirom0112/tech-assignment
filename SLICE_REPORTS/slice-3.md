# Slice S3 — Milestone rewards — SLICE REPORT

**Status:** ✅ DONE (director re-verified host + live, incl. atomicity)
**Date:** 2026-06-05
**Dispatch:** 1 senior-engineer subagent (S3-1..S3-14, TDD). Director ran S3-15.

## What shipped
Atomic, once-per-instance milestone awards. Crossing an exact milestone (login or play) writes — in a **single `TransactWriteCommand`** — the player advance + the day's activity row + the `streaks-rewards` row (carrying the folded `pointTxnType:'streak_bonus'` + the FR-7 `notification` Map). `GET …/rewards` reads them newest-first.

## Definition of Done — evidence

| DoD check | Result | Evidence |
|---|---|---|
| `npm test` green incl. once-per-instance + re-award + integration | ✅ | `Test Suites: 11 / Tests: 69 passed` (+22 over S2) |
| `npm run typecheck` | ✅ | 0 errors |
| **Inv 4** — single `TransactWriteCommand`, 3 writes | ✅ | exactly `1` `new TransactWriteCommand` in repo; legs = player `Update` + activity write + reward `Put` (`attribute_not_exists(rewardId)`, `pointTxnType:'streak_bonus'`, `notification` Map) |
| **Inv 4 atomicity (proven live)** | ✅ | a re-reach attempt where today's activity row already existed left rewards at **count 1** — the activity leg's failed condition rolled back the reward Put too (no awarded-but-unrecorded reward) |
| Live award + exact notification | ✅ | seed 6@yesterday → check-in → `milestoneEarned {milestone:7,points:150}`, body `"You earned 150 bonus points for a 7-day login streak. 14 days unlocks 400!"`, `nextLoginMilestone {14,400,7}` |
| Re-award after reset (fresh day) | ✅ | reset to 6 + clear today's activity → 2nd check-in → rewards `count:2`, **2 unique rewardIds**, newest-first |
| Empty history → `[]` | ✅ | fresh player `GET …/rewards` → `[]` |
| Play vs login points | ✅ | unit: play 7 → 300, play 3 → 100 (§9 ladder) |
| No `Scan`; rewards = `Query` newest-first | ✅ | `QueryCommand` + `ScanIndexForward:false`; no `ScanCommand` in src (NFR-8) |
| No bare `ADD` (incl. txn player Update) / no `docClient` in handlers / no console.log | ✅ | greps clean |
| STND-5 dep budget | ✅ | `package.json` deps byte-unchanged since S2 — **no `ulid`** |

## rewardId scheme (ASSUMPTIONS A-7)
Zero-dep, lexicographically-sortable, time-ordered: `${String(epochMillis).padStart(15,'0')}-${rand}` (`epochMillis` added to `lib/utc.ts`). Ascending by time ⇒ `Query ScanIndexForward=false` = newest-first (pattern H). Chosen over `ulid` to hold STND-5 (5 backend installs) + minimal-deps house style; DATA_MODEL §4 wording to reconcile at S7.

## Notification copy
`title` = `"{milestone}-day {login|play} streak!"`; `body` = milestone-aware, login/play-distinct, `"You earned {points} bonus points for a {milestone}-day {axis} streak. {nextDays} days unlocks {nextReward}!"`; **top rung (90)** drops the second sentence ("…You've reached the top tier!"). `deepLink` always `hijackpoker://streaks`.

## Wire integration
`milestoneEarned` in §4.2 check-in / §4.6 hand-completed now carries the real §4.4 reward object on a crossing, else `null`. Non-milestone advances keep the cheap plain conditional writes; only crossings take the transaction path.

## Carried / notes
- Play-axis transaction activity leg reuses the `mergePlayed` create-or-merge `Update` (consistent with A-6) so a play milestone on a day with an existing login row merges rather than failing.
- Minor future refactor flagged by the engineer: `mergePlayed`'s create-or-merge expression is duplicated between the cheap path and the transaction leg — extract later (not touched mid-slice to keep S2 green).

## Commits
- `35c6aca` feat: reward.service — detect + points + notification (red→green) [+A-7]
- `e0688c4` feat: awardMilestone TransactWriteCommand + wire into check-in/hand-completed
- `5cbeb51` feat: rewards read handler (newest-first)
- `7d3ca37` test: integration milestone award flow
