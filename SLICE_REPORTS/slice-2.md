# Slice S2 — Play streak + internal event — SLICE REPORT

**Status:** ✅ DONE (director re-verified host + live)
**Date:** 2026-06-05
**Dispatch:** 1 senior-engineer subagent (S2-1..S2-13, TDD). Director ran S2-14.

## What shipped
Independent play-streak axis driven by `POST /internal/streaks/hand-completed`, idempotent once-per-UTC-day, guarded by the internal shared secret only (never player auth). Credits the hand's `completedAt` day, not receipt time.

## Definition of Done — evidence

| DoD check | Result | Evidence |
|---|---|---|
| `npm test` green incl. independence + multiple-hands | ✅ | `Test Suites: 9 passed / Tests: 47 passed` (+17 over S1) |
| `npm run typecheck` | ✅ | 0 errors |
| Live double-post `true` then `false` | ✅ | player `dirS2-…`: 1st `playStreakUpdated:true playStreak:1`; 2nd `false` |
| `date` from `completedAt` not now (Edge 1) | ✅ | `date:"2026-06-05"` derived via `utcDay(completedAt)` |
| Missing secret → 403 | ✅ | live `403` |
| **Inv 10** — `X-Player-Id` alone does NOT authorize internal | ✅ | live `403`; route mounted with `internalAuthMiddleware` only, outside the player-auth group (`handler.ts:42`); explicit integration assertion |
| Missing `completedAt` → 400 | ✅ | live `400 BadRequest` |
| Independence (FR-1.3) | ✅ | after a hand: `GET` shows `playStreak:1, loginStreak:0, lastLoginDate:null, lastPlayDate:"2026-06-05"` |
| New player first hand → 1 (not 404) | ✅ | created, `playStreak:1` |
| Inv 3 no `ADD` / Inv 6 no `docClient` in handlers / Inv 1 single UTC / STND-3 no console.log | ✅ | all greps clean |

## §4.6 wire conformance
Response is exactly `{playerId, date, playStreakUpdated, playStreak, milestoneEarned}`. `milestoneEarned` is `null` placeholder (play-milestone awarding is S3). Body validation: all 4 fields required, non-ISO `completedAt` → 400 (ISO check via new `lib/utc.ts:isIsoInstant`, keeping day-math single-sourced).

## Repository additions (mocked-docClient unit tests)
- `mergePlayed` — pattern E **conditional** create-or-merge `attribute_not_exists(#date) OR #played <> :true`; merges `played:true`+`playStreakAtDay` onto an existing same-day login row via `if_not_exists(...)`, or creates a complete play-first row. This is the once-per-day idempotency gate. (See **ASSUMPTIONS A-6** — reconciles loose DATA_MODEL §7 pattern-E prose; consistent with §8.)
- `advancePlayStreak` — `ConditionExpression: lastPlayDate = :yesterday`, `SET` (no `ADD`). `resetPlayStreak` — `SET`, guarded `lastPlayDate <> :day`.

## Activity-row sharing (login + play, same day)
One `(playerId, date)` row, "create-once narrowly-updatable" (DATA_MODEL §3): login `putActivity` creates it; play `mergePlayed` flips `played`/`playStreakAtDay` while preserving `loggedIn`/`loginStreakAtDay`/`streakBroken` via `if_not_exists`. Play-first days seed `loggedIn` from whether `lastLoginDate===day`.

## Carried into later slices
- `milestoneEarned` (S3), play-axis freeze protection (S4 — currently gap≥2 always resets).
- Test-infra: supertest `.send(obj)` needs an explicit `Content-Type` header (mime@1.6.0 quirk, A-6 sub-note).

## Commits
- `8f44ffe` feat: play-streak service — advance/idempotent/independent (red→green)
- `8169bde` feat: repository played-merge + play-advance conditional writes
- `5d9b542` feat: internal hand-completed handler with shared-secret guard
- `9ecfa5a` test: integration hand-completed idempotency + independence
