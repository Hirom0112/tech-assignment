# CLAUDE.md — Agent rulebook: Hijack Poker Daily Streaks (Option C)

This file governs how any coding agent builds this feature. It is binding. Read it before writing code, and re-read §1 before every slice.

The feature lives in the cloned skeleton (`serverless-v2/services/streaks-api` + `streaks-frontend`). We submit a **PR against the skeleton's `main`**, so treat the skeleton's existing conventions as the host environment and extend them.

---

## Doc precedence (conflict resolution order)

When two docs disagree, the **higher** wins:

1. **PROJECT.md** — requirements (FR-n/NFR-n), scope, success metrics. The contract.
2. **ARCHITECTURE.md** — system shape, flows, ADRs.
3. **DATA_MODEL.md** / **API_CONTRACT.md** — canonical for storage and the wire format respectively (co-equal; they don't overlap).
4. **TECH_STACK.md** — versions, deps, conventions.
5. **CLAUDE.md** (this file) — process. If process blocks a higher doc's requirement, the requirement wins; fix the process note afterward.
6. The official `docs/challenge-streaks.md` is the **source of truth for product behavior**; if our docs ever contradict it on *functional* behavior, the challenge doc wins and we correct our doc (functional ambiguity → sam@hijackpoker.com; architecture is ours to decide).

Never silently resolve a conflict — note it in the commit/PR and update the losing doc.

---

## 1. Non-negotiable invariants

1. **UTC calendar day, always.** Every "day" is a UTC calendar day (00:00–23:59 UTC). Derive the day **once per request** via the single `utcDay()` helper (`lib/utc.ts`, Luxon `DateTime.utc().toISODate()`). Never call `new Date()` math for day logic in more than one place. No device/local timezones anywhere. (PROJECT.md FR-1.4, NFR-1)
2. **Idempotent writes.** `POST /check-in` and `POST /internal/streaks/hand-completed` are **once-per-UTC-day idempotent**. The source of truth is a DynamoDB **conditional write** (`attribute_not_exists(#date)`) on the dated `streaks-activity` row — not application-level checks alone. Duplicate same-day calls return the current state (HTTP 200), never a double-increment. (NFR-2, DATA_MODEL.md §7–8)
3. **Streak counters advance conditionally, never blindly.** Increment with a `ConditionExpression` (`lastLoginDate = :yesterday` / no prior date), so a retry can't double-count. Never use a bare atomic `ADD` for streak length. (RESEARCH.md Q3; DATA_MODEL.md §8)
4. **Milestone awards are atomic and once-per-instance.** When a check-in crosses a milestone, write the reward + `streak_bonus` transaction + the `notification` push payload (FR-7 — `{ title, body, deepLink, milestone, type }`, content only, no delivery) + player update in a **single `TransactWriteCommand`** so there is never an awarded-but-unrecorded reward. The `notification` Map lives on the `streaks-rewards` row (no separate notifications table — DATA_MODEL §4–5). A reward fires **exactly once per streak instance** (reset → re-reach → award again). (FR-2.2/2.3/2.5, FR-7, ARCHITECTURE.md §5d)
5. **Freeze = lazy evaluation on next check-in.** A missed day is detected and a freeze consumed when the player next checks in (the conceptual 01:00 UTC consumption, implemented lazily). A freeze protects **exactly one** missed day and applies to **both** streaks. Two missed days with one freeze → first day covered, streak still resets on the second. Monthly free freeze is granted on the **1st** (compare `lastFreezeGrantDate` as `YYYY-MM`), not every 30 days. (FR-3, ARCHITECTURE.md §5c)
6. **Layered, always.** Request flow is **handler → service → repository**. Handlers do HTTP + validation only; all streak/freeze/reward/calendar logic lives in `services/`; all DynamoDB IO lives in `repositories/`. No `docClient` calls in handlers or route files. (ARCHITECTURE.md §1, §3)
7. **The wire format is API_CONTRACT.md.** Response field names, the `activity` enum (`none|login_only|played|freeze|broken`), the error shape `{ error, message }`, and status codes match API_CONTRACT.md exactly. Canonical player path is `/api/v1/player/streaks…`; keep `/api/v1/streaks…` as a working alias. (FR-5, NFR-7)
8. **No table Scans on hot paths.** A calendar month is a single `Query` (`begins_with(#date, :ym)`); a streak view is a bounded set of `Get`/`Query`. `Scan` is allowed only in the seed/admin tooling, never in player/internal endpoints. (NFR-8)
9. **TypeScript, strict.** `strict: true`. No `any` on domain types (the `shared/` CommonJS interop point is the one documented exception, TECH_STACK.md §3). Domain types live in `domain/types.ts` and mirror API_CONTRACT.md. (NFR-9)
10. **Auth is stubbed but present.** Player endpoints require `X-Player-Id` → `req.playerId` (JWT-verify is stubbed). The internal + admin endpoints are guarded by `X-Internal-Secret` (`INTERNAL_API_SECRET`), **not** player auth. Never expose the internal endpoint on the player-auth surface. (NFR-3, FR-6.3)
11. **Keys are frozen.** The 4 tables and their keys are created by `docker-compose.yml` dynamodb-init; do **not** change table names or key schema. New env vars `STREAKS_REWARDS_TABLE` and `STREAKS_FREEZE_HISTORY_TABLE` must be added to the compose env + `.env.example`. (DATA_MODEL.md §1)
12. **Secrets & money stay out.** No payment logic (freeze purchase is balance-only via admin grant). No PII beyond the `playerId` GUID. No real credentials in the repo; local AWS creds are the literal `local`/`local`.

---

## 2. Build order

Build slices in PROJECT.md §10 order; each ends runnable. Do not start a slice until its dependency slice is green.

- **Core (Must + Should) — ship this complete first:** **S0 TS foundation** → **S1 Login core** → **S2 Play + internal** → **S3 Milestones** → **S4 Freeze** → **S5 Calendar + seed** → **S6 Dashboard** → **S7 Hardening + docs**.
- **Bonus (Could-Have) — only after S7 is green:** **S8 backend extras** (FR-7 push payload, FR-8 admin view-history, FR-10 scheduled freeze Lambda) → **S9 share-card** (FR-9) → **S10 CI** (NFR-10).

**Over-scope rule (PROJECT.md §7):** never start a bonus slice while any core slice (S0–S7) is unfinished. If time runs short, the core ships complete and unfinished bonuses are written into the README's "what we'd do next" — a half-finished core to chase a bonus is a failure.

Detailed per-slice steps lived in an internal build plan (kept out of the submission repo) — not this file.

Per-slice loop: read the slice's plan entry → write failing tests (§3) → implement → green → refactor → commit at green → one-sentence status.

---

## 3. TDD workflow

**Strict scopes (red → green → refactor is mandatory):** all pure logic and IO-shaped services — `lib/utc.ts`, `services/streak.service.ts`, `services/freeze.service.ts`, `services/reward.service.ts`, `services/calendar.service.ts`, and the repository conditional-write/transaction helpers. Write the failing unit test first, with **exact expected values**.

**Adapted scopes:**
- **Frontend components** → acceptance-test-driven: render with the real Redux `<Provider>`, mock the network with **MSW**, assert on rendered output (`findByText`, the heat-map cell colors/states, the streak numbers). (TECH_STACK.md §1 frontend)
- **Handlers/routes** → covered by the integration test (supertest against the Express app with DynamoDB Local), not isolated unit tests.

### Worked test targets (exact expected values — these are acceptance anchors)

- **New player first check-in:** no prior `lastLoginDate` → `loginStreak = 1`, `bestLoginStreak = 1`, activity row `{ loggedIn:true, loginStreakAtDay:1 }`. (FR-1, edge: new player)
- **Consecutive day:** `lastLoginDate = yesterday`, `loginStreak = 4` → after check-in `loginStreak = 5`.
- **Idempotent same-day:** check-in twice on the same UTC day → `loginStreak` unchanged after the 2nd call; only one `streaks-activity` row exists; both responses HTTP 200. (NFR-2)
- **Missed day, no freeze:** `lastLoginDate = 2 days ago`, `freezesAvailable = 0`, `loginStreak = 9` → after check-in `loginStreak = 1`, activity row `streakBroken:true`. (FR-1.5)
- **Missed one day, freeze available:** `lastLoginDate = 2 days ago`, `freezesAvailable = 1`, `loginStreak = 9` → freeze consumed (`freezesAvailable = 0`), `loginStreak` stays `9` then this check-in makes it `10`; `streaks-freeze-history` row written for the missed day; activity `freezeUsed:true`. (FR-3.4)
- **Missed two days, one freeze:** gap of 2, `freezesAvailable = 1` → freeze covers the first missed day, streak still **resets** (`loginStreak = 1`) on the second. (FR-3, edge)
- **Milestone exactly:** login streak advances to `7` → one `streaks-rewards` row `{ type:'login_milestone', milestone:7, points:150, streakCount:7 }` + a `streak_bonus` txn + a notification; advancing to `8` writes **no** new reward. Re-reaching `7` after a reset awards **again**. (FR-2.1/2.2)
- **Independent streaks:** a `hand-completed` event advances `playStreak` without touching `loginStreak`, and vice versa. (FR-1.3)
- **Monthly free freeze:** `lastFreezeGrantDate` in a prior month → on next check-in `freezesAvailable += 1` and `lastFreezeGrantDate` set to current `YYYY-MM`; same month → no extra grant. (FR-3.1)
- **Calendar derivation:** activity row `{loggedIn:true, played:false}` → `activity:'login_only'`; `{played:true}` → `'played'`; `{freezeUsed:true}` → `'freeze'`; `{streakBroken:true}` → `'broken'`; no row → `'none'`. Priority when multiple (canonical, DATA_MODEL.md §3): `played` > `freeze` > `broken` > `login_only` > `none`.

Milestone ladder (login/play points) — single source is `src/config/constants.js`: 3→50/100, 7→150/300, 14→400/800, 30→1000/2000, 60→2500/5000, 90→5000/10000.

**Coverage bar:** every streak increment / reset / milestone / freeze branch has a unit test; ≥1 integration test for check-in → streak update → milestone reward (NFR-4, SM-2). `npm test` green in one command per package before any commit.

---

## 4. Git discipline — enforced-trunk model

- **Trunk-based, direct push to `main` is allowed**, gated by a **versioned pre-push hook** in `.githooks/` that runs the full check suite (lint if configured, `tsc --noEmit` typecheck, and `npm test` for any changed package). Setup wires it via `git config core.hooksPath .githooks` (document this in the README setup steps).
- **Never pass `--no-verify`.** If the hook fails, fix the code, not the hook.
- **Branch-per-slice is optional**; if used, prune merged branches (repo-audit handles stragglers).
- **Commit at green:** a commit contains the passing tests **and** the code that makes them pass, together. Refactors are separate commits. Conventional-commit style with a package scope (e.g. `feat(streaks-api): login check-in idempotency`) — but only treat the scope convention as binding if a `commit-msg` hook enforces it; otherwise keep messages clear and meaningful (no 200 micro-commits, no one giant squash — the rubric notes commit history is reviewed).
- **Remotes:** this repo is for a PR against the Hijack skeleton. Follow the standing personal git rules only where they apply; the deliverable is one clean PR against the skeleton's `main`.

---

## 5. Definition of Done (per slice)

A slice is done only when ALL hold:
1. Every FR/NFR the slice owns (PROJECT.md §10) is implemented and demonstrably working.
2. Strict-scope logic has red→green→refactor unit tests with exact expected values; `npm test` green.
3. The slice's runnable result (PROJECT.md §10 "Runnable result" column) is verified by actually running it (endpoint curled / dashboard rendered), not assumed.
4. Code is layered (Inv. 6), typed (Inv. 9), logged at write paths (NFR-6), and returns the canonical error shape (NFR-7).
5. Docs touched: API_CONTRACT.md / DATA_MODEL.md updated if the wire/storage shape changed; any new env var added to TECH_STACK.md §4 **and** `.env.example` **and** docker-compose.
6. The pre-push hook passes without `--no-verify`.

---

## 6. Commands

> Exact scripts are finalized in S0; these are the canonical entry points. Backend runs in `serverless-v2/services/streaks-api`, frontend in `serverless-v2/services/streaks-frontend`.

- **Start everything (local):** `docker compose --profile streaks up` (MySQL, Redis, DynamoDB Local + init, streaks-api:5001, streaks-frontend:4001).
- **Seed data:** `node scripts/seed-streaks.js` (extended in S5 for login/play/freeze/reward data).
- **Backend tests:** `cd serverless-v2/services/streaks-api && npm test` (Jest + ts-jest).
- **Backend typecheck:** `npm run typecheck` (`tsc --noEmit`) — added in S0.
- **Frontend tests:** `cd serverless-v2/services/streaks-frontend && npm test` (Vitest + RTL + MSW) — added in S0/S6.
- **Frontend dev:** `npm run dev` (Vite, port 4001).
- Health check: `curl http://localhost:5001/api/v1/health`.

---

## 7. Multi-agent split (if parallelized)

Split along **package + slice** boundaries to avoid collisions:
- **Backend-logic agent:** `lib/`, `services/`, `repositories/`, backend tests (S0–S5).
- **API/handler agent:** `handlers/`, routing, `serverless.*.yml`, integration test, API_CONTRACT.md (S1–S6, after the relevant service exists).
- **Frontend agent:** `streaks-frontend/src/*`, components, hooks, RTK Query api slice, component tests (S6, after S1/S5 endpoints exist).
- **Seed/infra agent:** `scripts/seed-streaks.js`, docker-compose env additions, `.env.example` (S5).

Shared touchpoints (`domain/types.ts`, API_CONTRACT.md, DATA_MODEL.md) are owned by the director; an agent proposes changes, the director reconciles. Never let two agents edit the same file in the same step.

---

## 8. Hijack house style (don't lose points on the obvious)

- **Brand the dashboard.** Dark base + single orange accent (skeleton theme is `#FF9800` on `#0D1117`; dossier brand is `#F5923E` on near-black — pick one and apply it intentionally, not the default MUI look). The frontend is the most visible deliverable (PROJECT.md Pillar 4). Re-check real brand tokens before hardcoding (RESEARCH.md Q6 flags teal/Poppins as unverified).
- **Frame the README around the live "Hot Streak" promo** — this feature extends a real Hijack engagement strategy, not a hypothetical (RESEARCH.md Q6).
- **Keep it junior-navigable:** clear folder layout, package docstrings, no cruft, a README that runs. (Standing repo standard.)
- **Document what you'd do next** (Could-Have items in PROJECT.md §8) in the README — the rubric values that judgment more than cramming bonuses in.
