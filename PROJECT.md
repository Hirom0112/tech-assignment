# PROJECT.md — Hijack Poker Daily Streaks (Option C)

**Status:** Locked planning baseline. Ratify or reopen via the decisions in §11.
**Grounding:** [`RESEARCH.md`](RESEARCH.md) and the official spec [`docs/challenge-streaks.md`](docs/challenge-streaks.md).
**Precedence:** see `CLAUDE.md §Doc precedence`. This doc constrains ARCHITECTURE.md, TECH_STACK.md, API_CONTRACT.md, DATA_MODEL.md.

---

## 1. Vision

Ship a **daily engagement system** for Hijack Poker that tracks player login and play activity, maintains independent streak counters, awards milestone rewards, protects streaks with freezes, and surfaces all of it in a polished React dashboard — plus a documented REST API a Unity mobile client can consume.

This is a deliberate extension of Hijack's **already-live "$100K Hot Streak Freeroll"** promo (RESEARCH.md Q6): we are productizing an engagement pattern the company already runs by hand, not inventing a hypothetical feature.

## 2. Problem statement

Hijack's retention play today is a manually-administered weekly "hours played" promo. There is no per-player, daily-granularity engagement loop that (a) rewards *consistency* (not just volume), (b) gives players a visible reason to return *every* day, and (c) exposes a clean contract the Unity client and a web dashboard can both render. Daily Streaks fills that gap with a deterministic, UTC-anchored streak engine.

## 3. Users

- **P0 — The Player (web + Unity mobile).** Wants to see their login & play streaks, today's status, what reward is next, and to never lose a streak to a single missed day. Consumes the dashboard and the REST API.
- **P1 — The Game Engine / Hand Processor.** A backend system (the existing holdem-processor pipeline) that fires an internal event when a player completes a hand. Consumes the internal API (FR-6).
- **P2 — The Operator / Admin.** Grants freeze balances (payments are out of scope) and needs the system to be observable and safe to extend. Consumes the admin endpoint (FR-3) and logs.

## 4. Product pillars

1. **Deterministic & UTC-anchored.** Every streak decision is a pure function of UTC calendar days and persisted state — no device clocks, no timezones, no ambiguity. (NFR-1)
2. **Idempotent & safe to retry.** Every external write (check-in, hand-completed) is once-per-UTC-day idempotent via conditional writes. (NFR-2)
3. **Fair by design.** Freezes protect against a single missed day; the low bar to "extend" (one login / one hand) follows the proven Duolingo pattern (RESEARCH.md Q1–Q2).
4. **The frontend is the showcase.** The dashboard is the most visible deliverable; it must look intentional on Hijack's dark/orange brand, not like a default MUI demo.
5. **Built for a team to extend.** Layered (handlers → services → repositories), typed, tested on business logic, with ADRs for non-obvious calls.

## 5. Functional requirements

Mirrors `docs/challenge-streaks.md`; IDs are canonical and cited by other docs and commits.

### FR-1 Daily activity tracking
- **FR-1.1** Track a **login streak**: consecutive UTC calendar days the player authenticates (check-in).
- **FR-1.2** Track a **play streak**: consecutive UTC calendar days the player completes ≥1 hand (dealt → showdown or fold resolution).
- **FR-1.3** The two streaks are **independent** (e.g. 30-day login, 5-day play).
- **FR-1.4** A "day" is a **UTC calendar day** (00:00–23:59 UTC). All math UTC.
- **FR-1.5** A streak **resets to 0** when a day is missed (and no freeze applies — see FR-3).
- **FR-1.6** Track **current** and **longest-ever** (personal best) for each streak.
- **FR-1.7** UI caps streak **display** at 365 days (stored value may exceed; display clamps).

### FR-2 Streak rewards
- **FR-2.1** Milestones at **3, 7, 14, 30, 60, 90** days, with distinct login vs play point values (table in DATA_MODEL.md §Milestones; values already in `streaks-api/src/config/constants.js`).
- **FR-2.2** A reward is **claimed once per milestone per streak instance**: reach 7, reset, reach 7 again → earn again.
- **FR-2.3** Rewards are awarded **automatically** the moment the milestone is reached.
- **FR-2.4** A **notification record** is created when a reward is earned.
- **FR-2.5** "Bonus points" are written as a **point transaction** with `type = "streak_bonus"` (record only; no live rewards-system integration).

### FR-3 Streak protection (freeze)
- **FR-3.1** Each player gets **1 free freeze per calendar month** (granted on the 1st, compared via `YYYY-MM`, not every 30 days).
- **FR-3.2** Additional freezes are **purchasable** — track the balance only; payment out of scope.
- **FR-3.3** An **admin endpoint grants** freezes to a player.
- **FR-3.4** A freeze protects against **exactly 1 missed day**; the streak does not reset.
- **FR-3.5** Freezes are **consumed automatically** on a missed day.
- **FR-3.6** A freeze applies to **both** login and play streaks simultaneously.
- **FR-3.7** Conceptually consumed at **01:00 UTC** next day if no activity; **lazy evaluation on next check-in is the chosen implementation** (scheduled Lambda is Could-Have, §8).

### FR-4 Streak dashboard (React)
- **FR-4.1** Current **login streak** (number + flame icon that grows with length).
- **FR-4.2** Current **play streak** (number + cards icon).
- **FR-4.3** **30-day calendar heat map**, each day colored: none=gray, login-only=light green, played=dark green, freeze=blue, broken=red.
- **FR-4.4** **Next milestone** copy ("Play 2 more days to earn 300 bonus points!") with progress for both streaks.
- **FR-4.5** **Personal best** display.
- **FR-4.6** **Freeze status**: available count, "freeze active" indicator when today is protected, freeze history (last-used dates).
- **FR-4.7** **Reward history**: list of earned rewards (date, milestone, type, points).

### FR-5 REST API for the Unity client
- **FR-5.1** `GET /api/v1/player/streaks` — current state (login/play streak, freezes available, next milestones).
- **FR-5.2** `POST /api/v1/player/streaks/check-in` — record today's login; **idempotent** (multiple same-day calls = one check-in).
- **FR-5.3** `GET /api/v1/player/streaks/calendar?month=YYYY-MM` — heat-map day array.
- **FR-5.4** `GET /api/v1/player/streaks/rewards` — reward history.
- **FR-5.5** `GET /api/v1/player/streaks/freezes` — freeze balance + history.
- **FR-5.6** Full request/response shapes + error codes documented in API_CONTRACT.md (Unity-facing — explicitly rubric-weighted).

> **Confirmed by spec:** the "API Response Shapes" section uses `/api/v1/player/streaks…`, so that is the **canonical** Unity contract path. The `/api/v1/streaks…` strings in the suggested service structure are handler file names, not public routes; we keep `/api/v1/streaks…` as a harmless backward-compat alias so the existing skeleton stub/tests don't break. Recorded as ADR-6 in ARCHITECTURE.md.

### FR-6 Internal API for game events
- **FR-6.1** `POST /internal/streaks/hand-completed` with `{ playerId, tableId, handId, completedAt }` updates the play streak for that UTC day.
- **FR-6.2** **Idempotent per UTC calendar day** (first hand sets `played`; later hands that day are no-ops).
- **FR-6.3** Not called by the client; separated from the player-facing auth surface.

### FR-7 Push notification content (Could-Have, now in scope)
- **FR-7.1** When a milestone reward is earned, generate a **push-notification message payload** (title, body, deep-link, milestone, type) — **content only, no delivery** (delivery is hard out of scope).
- **FR-7.2** The payload is stored on the reward record (DATA_MODEL.md §4–5) and returned in the reward/`milestoneEarned` shapes.
- **FR-7.3** Body copy is milestone-aware and uses loss-aversion-light framing (e.g. "You earned 150 bonus points. 14 days unlocks 400!"), distinct for login vs play milestones. (RESEARCH.md Q1 milestone-celebration design)

### FR-8 Admin view-history endpoint (Could-Have, now in scope)
- **FR-8.1** An admin/operator endpoint returns a player's full streak state + activity + rewards + freeze history for support/debugging.
- **FR-8.2** Guarded by the internal/admin shared secret (NFR-3), not player auth.

### FR-9 Streak share-card (Could-Have, now in scope)
- **FR-9.1** Generate a shareable streak card (image/SVG) summarizing a player's current streaks, personal best, and brand styling.
- **FR-9.2** Exposed as an endpoint and surfaced from the dashboard (a "Share" affordance). Generation only; social posting is out of scope.

### FR-10 Scheduled freeze consumption (Could-Have, now in scope)
- **FR-10.1** A scheduled (cron) handler runs the **same** freeze-consumption logic as the lazy path (FR-3.7), proactively consuming freezes for players who missed a day, keeping stored state fresh for absent players.
- **FR-10.2** Lazy evaluation on next check-in remains the **source of truth**; the scheduled job must be idempotent with it (running both never double-consumes — guarded by the per-day freeze-history conditional write).

## 6. Non-functional requirements

- **NFR-1 UTC correctness.** A single shared `utcDay()` derivation; "today/yesterday/days-between" computed once at the request edge. No `Date` math in multiple call sites. (Pillar 1)
- **NFR-2 Idempotency.** Check-in and hand-completed are once-per-UTC-day idempotent via DynamoDB conditional writes (`attribute_not_exists`), safe to retry. (Pillar 2)
- **NFR-3 Auth.** JWT-based guard, **stubbed**: accept `X-Player-Id` (skeleton convention) and/or a stub-decoded JWT → `req.playerId`. Internal endpoint uses a separate shared-secret/guard, not player auth.
- **NFR-4 Testing.** Unit tests cover streak increment, reset, milestone, and freeze logic with exact expected values; ≥1 integration test for check-in → streak update → milestone reward. `npm test` runs green in one command.
- **NFR-5 Local-first.** `docker compose --profile streaks up` + a seed command produces a dashboard with real data. No AWS account needed.
- **NFR-6 Observability.** Structured `winston` logs at write paths (check-in, hand-completed, reward award, freeze consume) with `playerId` + correlation; documented metric hooks.
- **NFR-7 Error contract.** Consistent JSON error shape `{ error, message }` with correct HTTP codes (400/401/404/409/501→implemented). Documented in API_CONTRACT.md.
- **NFR-8 Performance.** A month of calendar data is a **single** DynamoDB Query (`begins_with`); a full streak view is a bounded, small number of reads. No table Scans on hot paths.
- **NFR-9 Type safety.** Backend converted to **TypeScript**; shared domain types between API and (where practical) frontend contract.
- **NFR-10 CI pipeline (Could-Have, now in scope).** A GitHub Actions workflow runs lint (if configured) + `tsc --noEmit` typecheck + both test suites on push/PR; green CI is required before the work is considered shippable. Mirrors the local pre-push hook (CLAUDE.md §4).

## 7. In scope (this build = Must + Should + all Could-Have)

- **Must-Have:** FR-1, FR-2 (milestones 3/7/14/30 minimum, all six implemented), FR-4.1–4.4, FR-5.1–5.3, unit tests, docker-compose + green tests.
- **Should-Have:** FR-3 (freeze + monthly grant + admin grant), FR-4.5–4.7, FR-5.4–5.5, FR-6, integration test, full API documentation.
- **Could-Have (ratified into scope 2026-06-05):** FR-7 push-notification content (payload only), FR-8 admin view-history endpoint, FR-9 streak share-card, FR-10 scheduled freeze Lambda (alongside lazy eval), NFR-10 GitHub Actions CI, and the flame-grows animation (FR-4.1, already in).

> **Over-scope discipline (challenge warns against it):** Could-Haves are built in a dedicated bonus phase (slices S8–S10) **after** the Must+Should core (S0–S7) is green and shippable. If time runs short, the core ships complete and any unfinished Could-Have is documented in the README's "what we'd do next" — we never ship a half-finished core to chase a bonus.

## 8. Out of scope (hard — per spec)

Real auth system (stub the JWT guard), freeze **payment** processing, real game-engine integration (use the FR-6 endpoint), push-notification **delivery** (store the payload only — FR-7 is content-only), social posting of the share-card (generation only — FR-9), the live rewards-system integration behind `streak_bonus` (write the transaction record only), Unity client implementation, production deployment, load testing.

## 9. Success metrics

Tied to the challenge rubric (Working 30% / Code 25% / Testing 20% / Architecture 15% / Docs 10%):

- **SM-1 (Working).** `docker compose --profile streaks up` + seed → dashboard renders both streaks, a populated 30-day heat map, next-milestone progress, freeze status, and reward history against the live API. All six FR-5 + FR-6 endpoints return correct data.
- **SM-2 (Testing).** `npm test` green in both `streaks-api` and `streaks-frontend`; business-logic unit tests assert exact streak/reset/milestone/freeze values; ≥1 integration test for the check-in→reward flow.
- **SM-3 (Architecture).** Every endpoint flows handler→service→repository; the 4-table model is justified by an ADR; idempotency + UTC invariants are enforced in code, not docs.
- **SM-4 (Docs).** README (option + why, setup, implemented-vs-deferred, trade-offs) + API_CONTRACT.md (Unity-facing shapes + error codes) + ≥4 short ADRs.
- **SM-5 (Correctness invariants, machine-checkable).** Duplicate same-day check-in does not double-increment; a 2-day gap with 1 freeze resets the streak; milestone fires exactly once per instance; calendar month = one Query.

## 10. Slice roadmap

Every slice is independently shippable and ends in something runnable/verifiable. The detailed slice steps were tracked in an internal build plan (not part of this submission repo); the table below is the durable roadmap.

| Slice | Title | Delivers (FRs) | Depends on | Runnable result |
|---|---|---|---|---|
| **S0** | TS foundation | NFR-1,9; repo/build/test pipeline | — | `streaks-api` builds in TS, health route + `utcDay()` unit tests pass; 4-table env wired |
| **S1** | Login streak core | FR-1.1/1.4–1.7, FR-5.1–5.2, NFR-2 | S0 | `POST /check-in` (idempotent) + `GET /player/streaks` return correct login streak; unit + integration tests |
| **S2** | Play streak + internal event | FR-1.2/1.3, FR-6 | S1 | `POST /internal/streaks/hand-completed` advances play streak idempotently; independent from login |
| **S3** | Milestone rewards | FR-2 | S1, S2 | Reaching a milestone writes reward + `streak_bonus` txn + notification; once-per-instance; `GET …/rewards` |
| **S4** | Freeze protection | FR-3, FR-5.5 | S1, S2 | Monthly grant + lazy auto-consume preserves streak across 1 missed day; admin grant; `GET …/freezes` |
| **S5** | Calendar + seed | FR-5.3; NFR-5,8 | S1–S4 | `GET …/calendar?month=` returns 5-state day array; extended `seed-streaks.js` populates login/play/freeze/reward data |
| **S6** | Dashboard | FR-4 (all) | S1–S5 | React dashboard: counters w/ growing flame, 30-day heat map, milestone progress, personal best, freeze status, reward history — on brand |
| **S7** | Hardening + docs | NFR-4,6,7; SM-4 | S0–S6 | README + API_CONTRACT polish, ADRs, integration test, logging/error pass; full `npm test` green — **core is shippable here** |
| **S8** | Bonus: backend extras | FR-7, FR-8, FR-10 | S3, S4, S7 | Push-payload generated + stored on reward; admin view-history endpoint; scheduled freeze Lambda sharing the lazy-eval function (idempotent) |
| **S9** | Bonus: share-card | FR-9 | S6, S7 | Share-card endpoint generates a branded streak card; dashboard "Share" affordance |
| **S10** | Bonus: CI | NFR-10 | S7 | GitHub Actions workflow: lint + typecheck + both test suites green on push/PR |

**FR → slice coverage check:** FR-1→S0/S1/S2 · FR-2→S3 · FR-3→S4 · FR-4→S6 · FR-5→S1/S4/S5 · FR-6→S2 · FR-7→S3/S8 · FR-8→S8 · FR-9→S9 · FR-10→S8 · NFR-10→S10. Every FR/NFR maps to ≥1 slice. ✓
**Phasing:** S0–S7 = Must+Should core (shippable). S8–S10 = Could-Have bonus phase, built only after S7 is green.

## 11. Locked decisions to ratify (most likely to be wrong)

1. **Backend → TypeScript** (convert the JS/CommonJS skeleton). *Ratified — and confirmed a spec requirement* ("Technical Requirements → Language: TypeScript"), not merely a quality choice. Reopen only if conversion friction against the CommonJS `shared/` modules proves unworkable. (TECH_STACK.md §1)
2. **Scope = Must + Should + all Could-Have** (ratified 2026-06-05). Could-Haves are built in the S8–S10 bonus phase **after** the S0–S7 core is green; if time runs short the core ships complete and unfinished bonuses are documented. Reopen by dropping a specific Could-Have if S0–S7 overruns.
3. **Canonical API path = `/api/v1/player/streaks…`** with `/api/v1/streaks…` as a back-compat alias. *Confirmed by spec* — the "API Response Shapes" section uses `/api/v1/player/streaks…`; the `/streaks…` strings in the suggested service structure are handler file names, not public routes. The alias is now a harmless convenience, not an assumption. (ARCHITECTURE.md ADR-6)
