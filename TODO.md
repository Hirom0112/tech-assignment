# TODO.md — Hijack Poker Daily Streaks (Option C)

**The build-session contract.** Execute top-to-bottom in slice order. Each item is sized for one subagent dispatch, names its file paths, and ends in a check that proves it. **TDD-scope items come in `RED:` (failing test) → `GREEN:` (implementation) pairs; refactors are their own item.** Written for an engineer with zero project context — if it could be done wrong, the item names the exact expected value or command.

**Status legend:** `[ ]` open · `[~]` dispatched (in progress) · `[x]` verified-complete. **Only the director marks `[x]`, and only after the verification check actually runs green** (CLAUDE.md §5).

**Gate rule:** do not start a slice until the previous slice's "Slice N DoD" item is `[x]`. Never start a bonus slice (S8–S10) while any core item (S0–S7) is open (PROJECT.md §7).

**Paths** are relative to repo root. Backend = `serverless-v2/services/streaks-api/`, frontend = `serverless-v2/services/streaks-frontend/`, seed = `scripts/`.

---

## Standing items (keep true throughout)

- [x] STND-1: `ASSUMPTIONS.md` kept current — any new doc-precedence resolution recorded with citation; the 3 seeded entries (A-1/A-2/A-3) reconciled into their docs by S7. *(check: each S7 doc edit references an A-n entry)*
- [ ] STND-2: every new env var added to **all three** of `docker-compose.yml`, `.env.example`, `TECH_STACK.md §4` in the same commit. *(check: `grep` finds the var in all three)*
- [ ] STND-3: no `console.log` in committed backend `src/`; write paths use `winston` with `playerId`+`correlationId`. *(check: `grep -rn 'console.log' serverless-v2/services/streaks-api/src` → none)*
- [ ] STND-4: no `new Date(` day-math outside `src/lib/utc.ts`; no bare `ADD` on a streak counter; no `Scan` on player/internal/calendar paths. *(check: 3 greps clean)*
- [ ] STND-5: dependency budget ≤ 11 required top-level installs (5 backend + 6 frontend); any optional dep gets a one-line PR justification. *(check: diff of the two package.json files)*

---

## Slice S0 — TypeScript foundation  *(NFR-1, NFR-9; pipeline)*

- [x] S0-1: Add backend TS toolchain to `streaks-api/package.json` — `typescript ^5.4.0`, `ts-jest ^29.1.0`, `serverless-esbuild ^1.55.0` (dev; reconciled per ASSUMPTIONS A-4 — `^0.8.0` was unsatisfiable), `luxon ^3.4.0` (prod), `@types/luxon ^3.4.0` (dev); add `"typecheck": "tsc --noEmit"`; switch `test` to ts-jest; set `jest.testMatch` to `**/__tests__/**/*.test.ts`. *(check: `npm install` succeeds; exactly 5 new installs)*
- [x] S0-2: Add `streaks-api/tsconfig.json` — `strict:true, esModuleInterop:true, skipLibCheck:true, forceConsistentCasingInFileNames:true, module:"CommonJS", target:"ES2022"`; add `serverless-esbuild` config block so `serverless offline` runs `.ts`. *(check: `npm run typecheck` runs, 0 errors on empty tree)*
- [x] S0-3: Hand-write `serverless-v2/shared/config/dynamo.d.ts` exporting `{ docClient, ddbClient }` typed `DynamoDBDocumentClient`/`DynamoDBClient` (TECH_STACK.md §3 option 1). *(check: a TS file can `import { docClient }` with no `any`)*
- [x] S0-4 RED: `streaks-api/__tests__/lib/utc.test.ts` → `utc › derivations` asserts `utcDay('2026-02-20T00:00:00Z')==='2026-02-20'`, `yesterday('2026-03-01')==='2026-02-28'`, `daysBetween('2026-02-18','2026-02-20')===2`, `yearMonth('2026-06-05')==='2026-06'`. *(check: `npm test` red — module missing)*
- [x] S0-5 GREEN: `streaks-api/src/lib/utc.ts` — `utcDay/yesterday/daysBetween/yearMonth` via Luxon `DateTime.utc()` (NFR-1, CLAUDE.md Inv 1). *(check: `npm test` green for utc)*
- [x] S0-6: Port `handler.js`→`handler.ts` keeping `module.exports.api = serverless(app)` (esModuleInterop default import); port `src/middleware/auth.js`→`auth.ts` (unchanged 401 `{error:'Unauthorized',...}`); port `src/routes/health.js`→`src/routes/health.ts`. *(check: `npm run typecheck` clean)*
- [x] S0-7: Add `src/middleware/internalAuth.ts` — compares `X-Internal-Secret` to `INTERNAL_API_SECRET`, returns **403 `Forbidden`** on miss (API_CONTRACT.md §2.2/§3; ASSUMPTIONS A-1/A-3). *(check: unit test — wrong secret → 403, right secret → next())*
- [x] S0-8: Replace brittle `__tests__/health.test.js` with `__tests__/health.test.ts` asserting `service:'streaks-api'`, `status:'ok'`, `timestamp` defined (no `route.stack` reach-in). *(check: `npm test` green)*
- [x] S0-9: Create layered dirs `src/handlers/ src/services/ src/repositories/ src/domain/ src/config/`; port `src/config/constants.js`→`constants.ts` + `milestones.ts` with the **identical** `MILESTONES` ladder (3→50/100, 7→150/300, 14→400/800, 30→1000/2000, 60→2500/5000, 90→5000/10000) and `getMilestone`/`getAchievedMilestones`. *(check: a unit test asserts `getMilestone(7).loginReward===150`)*
- [x] S0-10: Wire env in `docker-compose.yml` `streaks-api` + `.env.example` + `serverless.offline.yml`: `STREAKS_REWARDS_TABLE=streaks-rewards`, `STREAKS_FREEZE_HISTORY_TABLE=streaks-freeze-history`, `INTERNAL_API_SECRET=dev-internal-secret`, `FREEZE_CRON_ENABLED=false` (STND-2). Do **not** change table names/keys (CLAUDE.md Inv 11). *(check: `grep -E 'STREAKS_REWARDS_TABLE|STREAKS_FREEZE_HISTORY_TABLE|INTERNAL_API_SECRET|FREEZE_CRON_ENABLED' docker-compose.yml .env.example` finds all 4)*
- [x] S0-11: Add `.githooks/pre-push` running `tsc --noEmit` + `npm test` for changed packages; document `git config core.hooksPath .githooks` in README setup (CLAUDE.md §4). *(check: hook is executable; a deliberate type error blocks push without `--no-verify`)*
- [x] S0-12 GATE: **Slice S0 DoD** — `npm run typecheck` 0 errors; `npm test` green; `docker compose --profile streaks up` then `curl localhost:5001/api/v1/health` → `{service:'streaks-api',status:'ok'}`; env grep passes. Write `SLICE_REPORTS/slice-0.md`.

---

## Slice S1 — Login streak core  *(FR-1.1/1.4–1.7, FR-5.1–5.2, NFR-2)*

- [x] S1-1: `src/domain/types.ts` — `PlayerStreak`, `ActivityDay`, `NextMilestone`, `StreaksResponse` (9 fields, API_CONTRACT.md §4.1), `CheckInResponse` (§4.2) mirroring DATA_MODEL.md appendix. *(check: `tsc` clean; fields match §4.1 exactly)*
- [x] S1-2 RED: `__tests__/services/streak.service.test.ts › first check-in (new player)` → no `lastLoginDate` ⇒ `loginStreak=1, bestLoginStreak=1`, activity `{loggedIn:true, loginStreakAtDay:1, streakBroken:false}` (spec §Edge 6). *(check: red)*
- [x] S1-3 GREEN: `src/services/streak.service.ts` new-player branch. *(check: that test green)*
- [x] S1-4 RED: `streak.service.test.ts › consecutive day` → `lastLoginDate=yesterday, loginStreak=4` ⇒ `loginStreak=5`. *(check: red)*
- [x] S1-5 GREEN: consecutive-increment branch. *(check: green)*
- [x] S1-6 RED: `streak.service.test.ts › idempotent same-day` → 2nd same-day check-in ⇒ `loginStreak` unchanged, `streakAdvanced:false`, one activity row, both `200` (NFR-2). *(check: red)*
- [x] S1-7 GREEN: activity-row `attribute_not_exists(#date)` short-circuit drives idempotency (DATA_MODEL.md §7 pattern D). *(check: green)*
- [x] S1-8 RED: `streak.service.test.ts › missed day, no freeze` → `lastLoginDate=2 days ago, freezesAvailable=0, loginStreak=9` ⇒ `loginStreak=1`, activity `streakBroken:true` (FR-1.5). *(check: red)*
- [x] S1-9 GREEN: reset branch (no freeze logic yet — that's S4). *(check: green)*
- [x] S1-10 RED: `streak.service.test.ts › nextLoginMilestone` → `loginStreak=12` ⇒ `{days:14,reward:400,daysRemaining:2}`; `>=90` ⇒ `null` (API_CONTRACT.md §4.1/§5.5). *(check: red)*
- [x] S1-11 GREEN: next-milestone helper from `config/milestones.ts`. *(check: green)*
- [x] S1-12 RED: `__tests__/repositories/dynamo.repository.test.ts › conditional login writes` (mocked `docClient`) → `createPlayer` uses `attribute_not_exists(playerId)`; `putActivity` uses `attribute_not_exists(#date)`; `advanceLoginStreak` uses `ConditionExpression: lastLoginDate = :yesterday` and **no** `ADD` on `loginStreak` (CLAUDE.md Inv 3). *(check: red)*
- [x] S1-13 GREEN: `src/repositories/dynamo.repository.ts` — `getPlayer`, `createPlayer`, `putActivity`, `advanceLoginStreak` (patterns B/D/C). *(check: green; `grep 'ADD ' repository` finds no streak-counter ADD)*
- [x] S1-14: `src/handlers/check-in.ts` (FR-5.2) + `src/handlers/streaks.ts` (FR-5.1) — thin; compute `today/yesterday` once at the edge (NFR-1); map to §4.1/§4.2 shapes. *(check: typecheck clean; handlers contain no `docClient` call — CLAUDE.md Inv 6)*
- [x] S1-15: Mount canonical `/api/v1/player/streaks` + `/api/v1/player/streaks/check-in` **and** the `/api/v1/streaks…` alias (ADR-6) behind `authMiddleware` in `handler.ts`. *(check: both paths route to the same handler)*
- [x] S1-16 RED: `__tests__/integration/check-in.int.test.ts` (supertest + DynamoDB Local) → new player POST check-in ⇒ `200 streakAdvanced:true loginStreak:1`; repeat ⇒ `200 streakAdvanced:false`; `GET /player/streaks` ⇒ `loginStreak:1`; unseen-player GET ⇒ `200` all-zeros (ASSUMPTIONS zero-state). *(check: red then green)*
- [x] S1-17 GREEN: make the integration test pass end-to-end. *(check: `npm test` green)*
- [x] S1-18 GATE: **Slice S1 DoD** — `npm test` green incl. 5 worked targets + integration; live double-check-in shows `true` then `false` both `200`; `GET …/player/streaks` correct; no bare `ADD`. Write `SLICE_REPORTS/slice-1.md`.

---

## Slice S2 — Play streak + internal event  *(FR-1.2/1.3, FR-6)*

- [x] S2-1 RED: `__tests__/services/play.service.test.ts › first hand of day` → advances `playStreak`, activity `played:true, playStreakAtDay:n`, day = `utcDay(completedAt)` not now (spec §Edge 1, ARCHITECTURE.md §5b). *(check: red)*
- [x] S2-2 GREEN: `src/services/play.service.ts` advance branch. *(check: green)*
- [x] S2-3 RED: `play.service.test.ts › multiple hands same day` → 2nd hand same UTC day ⇒ no-op `playStreakUpdated:false` (FR-6.2, spec §Edge 2). *(check: red)*
- [x] S2-4 GREEN: conditional upsert `attribute_not_exists(#date) OR #played <> :true` (ARCHITECTURE.md §5b step 2). *(check: green)*
- [x] S2-5 RED: `play.service.test.ts › independence` → hand-completed advances `playStreak` and does NOT touch `loginStreak`; check-in does NOT touch `playStreak` (FR-1.3). *(check: red)*
- [x] S2-6 GREEN: keep the two axes independent on the player record. *(check: green)*
- [x] S2-7 RED: `play.service.test.ts › missed day reset` → play gap, no freeze ⇒ `playStreak=1`, play `streakBroken`. *(check: red)*
- [x] S2-8 GREEN: play reset branch. *(check: green)*
- [x] S2-9 RED: `dynamo.repository.test.ts › play writes` → `mergePlayed` (pattern E) and `advancePlayStreak` (`lastPlayDate = :yesterday`). *(check: red)*
- [x] S2-10 GREEN: add `mergePlayed` + `advancePlayStreak` to `dynamo.repository.ts`. *(check: green)*
- [x] S2-11: `src/handlers/internal.ts` (FR-6.1) — `internalAuth` (403 on miss), validate `{playerId, tableId, handId, completedAt}` (400 on missing/invalid/non-ISO), map to §4.6 (`playStreakUpdated, date, playStreak`); mount `POST /internal/streaks/hand-completed` with `internalAuth` only, **never** `authMiddleware` (FR-6.3, CLAUDE.md Inv 10). *(check: typecheck clean)*
- [x] S2-12 RED: `__tests__/integration/hand-completed.int.test.ts` → post hand ⇒ `playStreakUpdated:true playStreak:1`; repeat same `completedAt` ⇒ `false`; missing/`X-Player-Id`-only secret ⇒ `403`; `GET /player/streaks` shows `playStreak` up, `loginStreak` unchanged. *(check: red then green)*
- [x] S2-13 GREEN: pass the integration test. *(check: `npm test` green)*
- [x] S2-14 GATE: **Slice S2 DoD** — `npm test` green incl. independence + multiple-hands; live double-post shows `true` then `false`; missing secret → 403. Write `SLICE_REPORTS/slice-2.md`.

---

## Slice S3 — Milestone rewards  *(FR-2; seeds FR-7)*

- [x] S3-1 RED: `__tests__/services/reward.service.test.ts › exact milestone fires once` → advance to `7` ⇒ reward `{type:'login_milestone',milestone:7,points:150,streakCount:7}`; advance to `8` ⇒ none (FR-2.1/2.3). *(check: red)*
- [x] S3-2 GREEN: `src/services/reward.service.ts` exact-match `getMilestone(n)` detection. *(check: green)*
- [x] S3-3 RED: `reward.service.test.ts › re-award after reset` → reach 7, reset, reach 7 ⇒ 2nd reward, new `rewardId` (FR-2.2). *(check: red)*
- [x] S3-4 GREEN: detection keyed on this advance hitting the exact value (ARCHITECTURE.md §5d step 2). *(check: green)*
- [x] S3-5 RED: `reward.service.test.ts › play vs login points` → play 7 ⇒ `points:300`; play 3 ⇒ `100` (DATA_MODEL.md §9). *(check: red)*
- [x] S3-6 GREEN: points from `loginReward`/`playReward` by `type`. *(check: green)*
- [x] S3-7 RED: `reward.service.test.ts › notification payload` → reward carries `notification:{title,body,deepLink:'hijackpoker://streaks',milestone,type}`, body milestone-aware login-vs-play e.g. `"You earned 150 bonus points for a 7-day login streak. 14 days unlocks 400!"` (FR-7.3, API_CONTRACT.md §4.4). *(check: red)*
- [x] S3-8 GREEN: payload builder in `reward.service.ts`. *(check: green)*
- [x] S3-9: Decide `rewardId` — install `ulid ^2.3.0` (pattern H uses `ScanIndexForward=false`) or timestamp-prefixed string; record the choice in `ASSUMPTIONS.md` (TECH_STACK.md §2 optional-dep justification). *(check: ASSUMPTIONS updated; if installed, STND-5 still ≤ budget)*
- [x] S3-10 RED: `dynamo.repository.test.ts › awardMilestone transaction` → one `TransactWriteCommand` bundling player `Update` + activity `Put` + `streaks-rewards` `Put` (carrying `pointTxnType:'streak_bonus'` + `notification` Map) with `attribute_not_exists(rewardId)` (DATA_MODEL.md §8). *(check: red)*
- [x] S3-11 GREEN: `awardMilestone` in `dynamo.repository.ts`; route check-in/hand-completed milestone-crossings through it, non-milestone writes stay plain conditional writes. *(check: green)*
- [x] S3-12: `src/handlers/rewards.ts` (FR-5.4) → `GET …/rewards` top-level array newest-first (pattern H), each element §4.4 shape incl. `notification`; empty ⇒ `[]`. *(check: typecheck clean)*
- [x] S3-13 RED: `__tests__/integration/milestone.int.test.ts` (the rubric flow) → drive a player to a login milestone ⇒ `milestoneEarned` on the crossing, `null` next; `GET …/rewards` has exactly one reward with right points + notification. *(check: red then green)*
- [x] S3-14 GREEN: pass the integration test. *(check: `npm test` green)*
- [x] S3-15 GATE: **Slice S3 DoD** — `npm test` green incl. once-per-instance + re-award + integration; live milestone drive shows the reward; second crossing after reset shows two rewards. Write `SLICE_REPORTS/slice-3.md`.

---

## Slice S4 — Freeze protection  *(FR-3, FR-5.5)*

- [x] S4-1 RED: `__tests__/services/freeze.service.test.ts › missed one day, freeze available` → `lastLoginDate=2 days ago, freezesAvailable=1, loginStreak=9` ⇒ freeze consumed (`freezesAvailable=0`), streak preserved 9→10 after check-in, `streaks-freeze-history` row for the missed day, activity `freezeUsed:true` (FR-3.4). *(check: red)*
- [x] S4-2 GREEN: `src/services/freeze.service.ts` `gap===2 && freezesAvailable>0` consume branch (ARCHITECTURE.md §5c step 3). *(check: green)*
- [x] S4-3 RED: `freeze.service.test.ts › missed two days, one freeze` → 2 missed days, 1 freeze ⇒ first covered, streak **resets** `loginStreak=1` on the second (spec §Edge 4). *(check: red)*
- [x] S4-4 GREEN: `gap>=3` (or `gap===2` no freeze) ⇒ no protection. *(check: green)*
- [x] S4-5 RED: `freeze.service.test.ts › freeze covers both axes` → one consumed freeze protects login AND play for the same missed day (FR-3.6). *(check: red)*
- [x] S4-6 GREEN: single consume applies to both transitions. *(check: green)*
- [x] S4-7 RED: `freeze.service.test.ts › monthly grant on the 1st` → `lastFreezeGrantDate` prior `YYYY-MM` ⇒ `freezesAvailable+=1`, set to current `YYYY-MM`; same month ⇒ no grant (FR-3.1, `YYYY-MM` string compare, spec §Edge 5). *(check: red)*
- [x] S4-8 GREEN: monthly-grant branch (ARCHITECTURE.md §5c step 5). *(check: green)*
- [x] S4-9 RED: `dynamo.repository.test.ts › consumeFreeze + grant` → `consumeFreeze` is one `TransactWriteCommand` (player `Update freezesAvailable-1, freezesUsedThisMonth+1` cond `freezesAvailable > :zero`; freeze-history `Put` cond `attribute_not_exists(#date)`; activity `freezeUsed=true`); `grantFreezeAdmin` uses `ADD freezesAvailable :n` (pattern J). *(check: red)*
- [x] S4-10 GREEN: add `consumeFreeze` + `grantFreezeAdmin` to `dynamo.repository.ts`. *(check: green)*
- [x] S4-11: Wire `freeze.service` at the **top** of check-in and hand-completed, **before** the transition (ARCHITECTURE.md §5c, CLAUDE.md Inv 5). *(check: a check-in after a 1-day gap with a freeze yields `freezeConsumed:true`)*
- [x] S4-12: `src/handlers/freezes.ts` (FR-5.5) → `GET …/freezes` `{freezesAvailable, freezesUsedThisMonth, lastFreezeGrantDate, history[]}` (consumptions newest-first, pattern I; §4.5). *(check: typecheck clean)*
- [x] S4-13: `src/handlers/admin.ts` `POST …/admin/streaks/freezes/grant` (FR-3.3) — `internalAuth` (403), `count>=1` (400 else), unknown player `404`, exceed-`99`-cap `409` (§4.7, ASSUMPTIONS); response per §4.7. *(check: typecheck clean)*
- [x] S4-14 RED: `__tests__/integration/freeze.int.test.ts` → seed a 1-day gap + 1 freeze, check-in ⇒ `freezeConsumed:true`, streak preserved, `GET …/freezes` balance down + history row; admin-grant raises balance; over-cap ⇒ `409`. *(check: red then green)*
- [x] S4-15 GREEN: pass the integration test. *(check: `npm test` green)*
- [x] S4-16 GATE: **Slice S4 DoD** — `npm test` green incl. one-day-protected, two-day-reset, both-axes, monthly-grant; live admin-grant + gap + check-in shows `freezeConsumed:true`. Write `SLICE_REPORTS/slice-4.md`.

---

## Slice S5 — Calendar + seed  *(FR-5.3; NFR-5, NFR-8)*

- [x] S5-1 RED: `__tests__/services/calendar.service.test.ts › deriveActivity` → `{loggedIn:true,played:false}`→`login_only`; `{played:true}`→`played`; `{freezeUsed:true}`→`freeze`; `{streakBroken:true}`→`broken`; none→`none`; priority `played>freeze>broken>login_only>none` (DATA_MODEL.md §3). *(check: red)*
- [x] S5-2 GREEN: `src/services/calendar.service.ts` `deriveActivity()` (total, order-independent). *(check: green)*
- [x] S5-3 RED: `calendar.service.test.ts › dense month array` → one entry per calendar day ascending; absent days `none` zeroed; future days in current month `none` (§4.3). *(check: red)*
- [x] S5-4 GREEN: dense-array assembly. *(check: green)*
- [x] S5-5 RED: `calendar.service.test.ts › month validation` → `2026-2`/`2026-13`/`feb` ⇒ 400-class; omitted ⇒ current UTC month (§4.3 ASSUMPTION). *(check: red)*
- [x] S5-6 GREEN: validation + default. *(check: green)*
- [x] S5-7 RED: `dynamo.repository.test.ts › queryMonth` → one `QueryCommand` `playerId = :p AND begins_with(#date, :ym)` (pattern F, NFR-8). *(check: red)*
- [x] S5-8 GREEN: add `queryMonth` to `dynamo.repository.ts`. *(check: green; no Scan)*
- [x] S5-9: `src/handlers/calendar.ts` (FR-5.3) → `{month, days[]}` (§4.3), `400` on malformed month. *(check: typecheck clean)*
- [x] S5-10: Rewrite `scripts/seed-streaks.js` to the new model (DATA_MODEL.md §11) — keep 10 players `streak-001..010` + weights, 60 days ending today UTC; per-day `loggedIn~Bernoulli(consistency)`, `played~Bernoulli(consistency*0.6)`; walk days for `loginStreakAtDay`/`playStreakAtDay` with gap resets; protect some single-day gaps with a freeze (write `freezeUsed`, decrement balance, write `streaks-freeze-history` row); write a `streaks-rewards` row each time a counter **equals** a milestone (incl. re-award); derive player aggregate last (current/best, last dates, `lastFreezeGrantDate=current YYYY-MM`); **drop** legacy `currentStreak`/`longestStreak`/`totalCheckIns`/`lastCheckIn`/activity `checkedIn`; plain `PutCommand` (re-runnable). *(check: seed runs; `streaks-players` item has no legacy fields)*
- [x] S5-11 GATE: **Slice S5 DoD** — `npm test` green incl. all 5 derivations + priority + validation; `docker compose --profile streaks up` + `node scripts/seed-streaks.js`, then `curl "…/calendar?month=<current>" -H 'X-Player-Id: streak-001'` returns a dense array mixing all 5 states; `grep -n Scan src/{handlers,services,repositories}` clean. Write `SLICE_REPORTS/slice-5.md`.

---

## Slice S6 — Dashboard (React)  *(FR-4 all)*

- [x] S6-1: Add frontend test deps to `streaks-frontend/package.json` — `vitest ^1.6.0`, `@testing-library/react ^16.0.0`, `@testing-library/jest-dom ^6.4.0`, `jsdom ^24.1.0`, `msw ^2.3.0`, `@testing-library/user-event ^14.5.0` (dev); add `"test":"vitest run"`; vitest config sharing `vite.config.ts`; MSW `setupServer`. *(check: exactly 6 installs; `npm test` runs)*
- [x] S6-2: `src/store/streaksApi.ts` — RTK Query `createApi` + `fetchBaseQuery` (baseUrl `VITE_API_URL`, `X-Player-Id` header), endpoints streaks/calendar/rewards/freezes; extend `store.ts` with the api reducer+middleware (keep auth slice); `src/types/streaks.types.ts` mirrors §5.5. *(check: typecheck clean; store has both reducers)*
- [x] S6-3: `theme.ts` — dark base + single orange accent (`#FF9800` on `#0D1117` or dossier `#F5923E`; pick one); re-check brand tokens before hardcoding (RESEARCH.md Q6). *(check: `createTheme({palette:{mode:'dark',...}})` applied via `CssBaseline`)*
- [x] S6-4 RED: `src/__tests__/StreakCounter.test.tsx` → renders login number + flame and play number + cards; flame `scale` increases with streak (FR-4.1/4.2). *(check: red)*
- [x] S6-5 GREEN: `src/components/StreakCounter.tsx` — CSS `transform: scale(1 + min(streak,365... cap)*0.02)` (zero-dep). *(check: green)*
- [x] S6-6 RED: `src/__tests__/CalendarHeatMap.test.tsx` → 30 cells; cell color per `activity` value (gray/light-green/dark-green/blue/red); tooltip present (FR-4.3, ADR-5). *(check: red)*
- [x] S6-7 GREEN: `src/components/CalendarHeatMap.tsx` — CSS-grid + `sx` 5-state colors + MUI `<Tooltip>`. *(check: green)*
- [x] S6-8 RED: `src/__tests__/MilestoneProgress.test.tsx` → renders "Play 2 more days to earn 300 bonus points!" copy + both-axis progress (FR-4.4). *(check: red)*
- [x] S6-9 GREEN: `src/components/MilestoneProgress.tsx`. *(check: green)*
- [x] S6-10 RED/GREEN: `PersonalBest.tsx` (FR-4.5), `FreezeStatus.tsx` (FR-4.6: count, "freeze active" today, last-used dates), `RewardHistory.tsx` (FR-4.7: date/milestone/type/points) each with an RTL+MSW test. *(check: each test green)*
- [x] S6-11: `src/components/StreakDashboard.tsx` replaces `pages/Dashboard.tsx`; wires `useStreaks`/`useCalendar`; check-in affordance posts + refetches; display clamps at 365 (FR-1.7). *(check: typecheck clean)*
- [x] S6-12 GATE: **Slice S6 DoD** — `cd streaks-frontend && npm test` green; with API seeded, open `localhost:4001` → both counters (flame grows), populated 30-day heat map (all 5 colors), milestone copy, personal best, freeze status, reward history, visibly on-brand. Write `SLICE_REPORTS/slice-6.md` with an observed-state/screenshot note.

---

## Slice S7 — Hardening + docs  *(NFR-4/6/7; SM-4) — CORE SHIPS HERE*

- [x] S7-1: `src/middleware/error.ts` — single normalizer emitting `{error,message}` with §3 codes: `BadRequest`/400, `Unauthorized`/401, `Forbidden`/403, `NotFound`/404, `Conflict`/409, `InternalError`/**500** (DB-down → 500, ASSUMPTIONS A-3); a test per code path. **Includes the unmatched-route 404:** replace `handler.ts`'s `{error:'Not found'}` catch-all with the canonical `{error:'NotFound', message}` shape, and add an integration test asserting an unknown path returns `404 {error:'NotFound'}` (review finding, S6). *(check: each error path returns the documented code+shape; unknown route → `404 NotFound`)*
- [x] S7-2: Logging sweep — `winston` `playerId`+`correlationId` (middleware-generated, threaded) at check-in/hand-completed/reward-award/freeze-consume/admin-grant; document metric hooks (ARCHITECTURE.md §8). *(check: STND-3 grep clean; a write path logs with correlationId)*
- [x] S7-3: Confirm the check-in → streak → milestone integration green end-to-end; `npm test` green in **one** command per package (NFR-4/SM-2). *(check: both `npm test` green)*
- [x] S7-4: README — option C + why (frame on the live "$100K Hot Streak Freeroll", RESEARCH.md Q6); setup (`docker compose --profile streaks up`, `node scripts/seed-streaks.js`, `git config core.hooksPath .githooks`); implemented-vs-deferred; trade-offs; "what we'd do next" (Could-Haves). *(check: a fresh reader runs it to a rendered seeded dashboard)*
- [x] S7-5: Polish `API_CONTRACT.md` against shipped routes; reconcile ASSUMPTIONS A-1/A-2/A-3 into the docs they correct (TECH_STACK §4, API_CONTRACT, ARCHITECTURE §7); confirm ≥4 ADRs exist (ARCHITECTURE §11). *(check: A-n entries marked reconciled)*
- [x] S7-6: SM-5 invariant assertions present — dup same-day no double-increment; 2-day gap + 1 freeze resets; milestone once per instance; calendar month = one Query. *(check: 4 assertions exist and pass)*
- [x] S7-8: Remove backend jest `--forceExit` and fix the underlying open handle (close the `ddbClient`/`docClient` + any supertest server in `afterAll`; the integration tests log an open-handle warning) so `npm test` exits cleanly on its own. If a handle genuinely can't be closed (DynamoDB Local keep-alive), document why and prefer `--detectOpenHandles`-verified cleanup over a blanket force-exit (review finding, S6). *(check: `npm test` exits 0 with no `--forceExit` and no open-handle warning, OR a documented justification)*
- [x] S7-7 GATE: **Slice S7 DoD** — `npm test` green in both packages; STND-3/STND-4 greps clean; README executes top-to-bottom to a seeded dashboard. Write `SLICE_REPORTS/slice-7.md` — **CORE-SHIPPABLE CHECKPOINT.**

---

## Slice S8 — Bonus: backend extras  *(FR-7, FR-8, FR-10) — only after S7 `[x]`*

- [ ] S8-1: Audit the FR-7 `notification` payload against §4.4/§5.5 (`{title,body,deepLink,milestone,type}`), returned in `milestoneEarned` + `…/rewards`, content-only; add `deepLink` to the stored Map if missing. *(check: a rewards response carries the full payload)*
- [ ] S8-2 RED: `__tests__/integration/admin-history.int.test.ts` → `GET …/admin/streaks/players/:id/history` with `X-Internal-Secret` ⇒ composite `{player,activity,rewards,freezes}` (§4.8); missing secret ⇒ `403` before lookup; unknown player ⇒ `404`. *(check: red)*
- [ ] S8-3 GREEN: `admin.ts` history branch composing existing services (no new sub-shapes); reuses `INTERNAL_API_SECRET`. *(check: green)*
- [ ] S8-4 RED: `freeze.service.test.ts › cron/lazy idempotency` → running the consume twice (cron + lazy) against the same missed day never double-consumes (per-day `attribute_not_exists(date)` guard, ARCHITECTURE.md §5f step 4). *(check: red)*
- [ ] S8-5 GREEN: `src/handlers/scheduled-freeze.ts` — thin cron entry, paginated `Scan` of `streaks-players` (the **one** sanctioned Scan, NFR-8 exception) calling the **same** `freeze.service.consume` (ADR-2, never a parallel impl); wire `serverless.yml` `schedule` event `enabled: ${env:FREEZE_CRON_ENABLED,'false'}`. *(check: green; `serverless invoke local -f scheduledFreeze` runs)*
- [ ] S8-6 GATE: **Slice S8 DoD** — `npm test` green incl. admin-history + cron-idempotency; `serverless invoke local -f scheduledFreeze` consumes a due freeze and does NOT double-consume on a second run / alongside a lazy check-in; admin history `403` without secret. Write `SLICE_REPORTS/slice-8.md`.

---

## Slice S9 — Bonus: share-card  *(FR-9)*

- [ ] S9-1 RED: `__tests__/services/share.service.test.ts › renders brand SVG` → self-contained `<svg>` encoding `loginStreak`, `playStreak`, `bestLoginStreak`, Hijack wordmark + "Hot Streak" tie-in, dark/orange palette (§4.9). *(check: red)*
- [ ] S9-2 GREEN: `src/lib/share-card.ts` — pure `(state)=>string` SVG template, zero-dep (TECH_STACK.md §1 locked default; NO satori/resvg unless PNG built). *(check: green)*
- [ ] S9-3 RED: `share.service.test.ts › degrade never throws` → zero-state/new player ⇒ minimal fallback card, never error (§4.9). *(check: red)*
- [ ] S9-4 GREEN: fallback path. *(check: green)*
- [ ] S9-5: `src/handlers/share-card.ts` (FR-9.2) — player auth, read-only via `getPlayer`, `Content-Type: image/svg+xml`; render failure ⇒ 200 fallback, never 500 (ARCHITECTURE.md §7); `?format=png` only if rasterizer built. *(check: `curl …/share-card -H 'X-Player-Id: streak-001'` returns valid SVG)*
- [ ] S9-6: Add a "Share" affordance to `StreakDashboard.tsx` opening/embedding the card (FR-9.2). *(check: dashboard renders the share control)*
- [ ] S9-7 GATE: **Slice S9 DoD** — `npm test` green incl. renderer + degrade; live SVG returns; zero-state player still 200; dashboard Share works. Write `SLICE_REPORTS/slice-9.md`.

---

## Slice S10 — Bonus: CI  *(NFR-10)*

- [ ] S10-1: `.github/workflows/ci.yml` — on push/PR, `actions/setup-node@v4` Node 22, install + `tsc --noEmit` + `streaks-api` Jest + `streaks-frontend` Vitest (ARCHITECTURE.md §10). No new npm deps. *(check: workflow parses; both suites invoked)*
- [ ] S10-2: Ensure parity with `.githooks/pre-push` (red CI == red push, CLAUDE.md §4). *(check: same commands in both)*
- [ ] S10-3 GATE: **Slice S10 DoD** — workflow valid; both suites run; a push shows green steps. Write `SLICE_REPORTS/slice-10.md`.

---

## Backlog — Login experience + themed dashboard (user-requested 2026-06-05)  *(NOT core; lands at/after S6, gated behind S7 per CLAUDE.md §2 over-scope rule)*

User direction captured during the S1 build. This is an **extension of the S6 dashboard + a new pre-dashboard login/intro flow** — do NOT start it while any S0–S7 core item is open. Assets currently live on the user's Desktop and must be copied into `streaks-frontend/public/` (or `src/assets/`) when this is built.

- [x] BL-1: **Cinematic intro → login → dashboard flow.** On first load play the branded intro video (`ElevenLabs_video_kling-o-3-edit_make the sun..._2026-06-05T16_04_20.mp4`, ~5.8 MB, Hijack Poker logo / "make the sun…" motion piece), then transition to the **login screen** (ref `Gemini_Generated_Image_6sf9ru6sf9ru6sf9.png` — art-deco brass/wood "High Roller's Lounge" Hijack card with **Sign In / Sign Up**), and on login land on the **streaks/freeze dashboard** (ref `Gemini_Generated_Image_ncgch7ncgch7ncgc.png`). Login is stub-auth in this build (sets `X-Player-Id`; a seed id like `streak-001`), no real credentials. *(check: load app → intro plays → login → dashboard renders for the chosen player)*
- [x] BL-2: **Three selectable dashboard themes** via a top-corner tab (Option 1 / 2 / 3), each visually distinct, switchable at runtime. Option candidates: (1) the docs' dark `#0D1117` + orange `#FF9800`; (2) the warm art-deco brass/parchment "saloon" palette shown in the dashboard mockup; (3) a third distinct treatment (e.g. high-contrast neon/charcoal). Themes swap the MUI palette only — same components/data. *(check: tab switches all three live; each passes the FR-4 component tests)*
- [x] BL-3: The `ncgch7…` mockup is an **on-spec FR-4 reference** (login+play counters w/ flame/cards, next-milestone, 2 freezes w/ grant/purchase source, 30-day 5-state heat-map + legend, milestone banner, reward history) — use it as the visual target for S6 and the theme work; reconcile its palette choice with the S6-3 brand decision (the mockup diverges from the dark/orange docs token — that divergence is BL-2 Option 2, not a docs violation). *(check: S6 dashboard matches the mockup's information layout)*

> **Scope note (no invention):** these are recorded per CLAUDE.md §7 "features not in the docs go to TODO.md backlog with a note." They are bonus/extension work beyond the documented FR set; the core daily-streaks feature (S0–S7) ships complete first. If time is short, BL-1/BL-2 go to the README "what we'd do next."

---

## Item counts (planning baseline)

S0: 12 · S1: 18 · S2: 14 · S3: 15 · S4: 16 · S5: 11 · S6: 12 · S7: 7 · S8: 6 · S9: 7 · S10: 3 · Standing: 5. **Core (S0–S7): 105 items. Bonus (S8–S10): 16 items. Total: 126** (incl. 11 slice-gate items + 5 standing).
