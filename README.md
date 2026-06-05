# Hijack Poker — Daily Streaks (Option C)

A daily-engagement system for Hijack Poker: it tracks each player's **login** and
**play** streaks, awards milestone bonuses, protects streaks with **freezes**, and
surfaces all of it in a polished React dashboard plus a documented REST API a Unity
mobile client can consume.

---

## 1. What & why

This is Option **C — Daily Streaks** from the Hijack tech assignment, and it is a
**deliberate extension of a strategy Hijack already runs live**, not a hypothetical
feature. Hijack's current retention play is the manually-administered
**"$100K Hot Streak Freeroll"** promo — a weekly, hours-played contest run by hand.
It rewards *volume*, but there is no per-player, daily-granularity loop that rewards
**consistency**, gives players a visible reason to return *every* day, and exposes a
clean contract both the Unity client and a web dashboard can render.

Daily Streaks productizes that "Hot Streak" pattern as a deterministic, **UTC-anchored
streak engine**:

- **Login streak** — consecutive UTC days the player opened the app.
- **Play streak** — consecutive UTC days the player completed a hand (advanced
  independently of login, via a server-to-server event from the hand processor).
- **Milestone rewards** at 3 / 7 / 14 / 30 / 60 / 90 days, each firing exactly once
  per streak instance.
- **Freezes** that protect a streak across a single missed day, so one bad day doesn't
  wipe a 60-day run (the single biggest churn risk in a streak product).

Everything is anchored to a **single UTC calendar day** computed once per request, and
both write paths (`check-in`, `hand-completed`) are **once-per-UTC-day idempotent**,
backed by DynamoDB conditional writes — safe to retry, never double-counts.

> Full product spec: [`docs/challenge-streaks.md`](docs/challenge-streaks.md). Requirements
> (FR/NFR) live in [`PROJECT.md`](PROJECT.md).

---

## 2. Feature tour

![Streaks dashboard — player streak-001, month 2026-04](SLICE_REPORTS/slice-6-dashboard.png)

The screenshot above is the **demo target**: player **`streak-001`**, month
**`2026-04`** — the one seed fixture that exercises **all five heat-map states** in a
single month. The frontend honors `VITE_DEMO_MONTH=2026-04` (see
`streaks-frontend/.env.example`); unset it to default the calendar to the current UTC
month.

What ships:

- **Login streak** (flame motif) and **play streak** (cards motif) — two independent
  counters, each with its personal best. A `hand-completed` event advances `playStreak`
  without touching `loginStreak`, and vice versa.
- **Milestone rewards** — crossing 3 / 7 / 14 / 30 / 60 / 90 days awards bonus points
  (login and play ladders differ; see [§5.2 of the API contract](API_CONTRACT.md)).
  Each award is written atomically with a **FR-7 push-notification payload**
  (`{ title, body, deepLink, milestone, type }`) stored on the reward record —
  **content only, no delivery** (delivery is out of scope). A reward fires **once per
  streak instance**: reset → re-reach → award again with a new `rewardId`.
- **Freeze protection** — a missed day is detected and a freeze consumed **lazily, on
  the next check-in** (the conceptual 01:00-UTC consumption). One freeze protects
  **exactly one** missed day and applies to **both** streaks. A free freeze is granted
  on the **1st of each UTC month**; operators can also grant freezes via the admin
  endpoint (e.g. a purchased-balance top-up).
- **The dashboard** — both counters, the 30-day heat map (gray / light-green /
  dark-green / blue=freeze / red=broken), dual milestone progress bars, personal bests,
  freeze status + history, and reward history. React + MUI + RTK Query on Hijack's
  dark/orange brand (`#FF9800` on `#0D1117`).

---

## 3. Quick start

**Prerequisites**

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Docker Compose v2)
- [Node.js 22+](https://nodejs.org/) — for the seed script and running tests locally
- Git

**Run it, top to bottom:**

```bash
# 0. (once) enable the versioned pre-push hook — runs tsc --noEmit + npm test
#    for changed packages before every push. Never bypass with --no-verify.
git config core.hooksPath .githooks

# 1. copy env defaults
cp .env.example .env

# 2. start the streaks stack: MySQL, Redis, DynamoDB Local (+ init that creates the
#    4 streaks tables), streaks-api on :5001, streaks-frontend on :4001.
#    First run takes 2-3 min while containers npm-install.
docker compose --profile streaks up

# 3. in a second terminal, seed deterministic demo data (players streak-001..010).
#    Idempotent: it wipes the seed players' rows, then rewrites them.
node scripts/seed-streaks.js        # or: npm run seed:streaks

# 4. open the dashboard
open http://localhost:4001          # demo player streak-001, month 2026-04
```

Health check: `curl http://localhost:5001/api/v1/health` →
`{"service":"streaks-api","status":"ok",...}`

### Working curl examples

These run green against the live `:5001` service after seeding (real outputs shown):

```bash
BASE=http://localhost:5001
PID='streak-001'
SECRET='dev-internal-secret'

# Current streak state (FR-5.1)
curl $BASE/api/v1/player/streaks -H "X-Player-Id: $PID"
# → {"loginStreak":2,"playStreak":2,"bestLoginStreak":17,"bestPlayStreak":4,
#    "freezesAvailable":0,"nextLoginMilestone":{"days":3,"reward":50,"daysRemaining":1},
#    "nextPlayMilestone":{"days":3,"reward":100,"daysRemaining":1},
#    "lastLoginDate":"2026-06-05","lastPlayDate":"2026-06-05"}

# Freeze balance + consumption history (FR-5.5)
curl $BASE/api/v1/player/streaks/freezes -H "X-Player-Id: $PID"
# → {"freezesAvailable":0,"freezesUsedThisMonth":2,"lastFreezeGrantDate":"2026-06",
#    "history":[{"date":"2026-04-14","source":"purchased"},
#               {"date":"2026-04-08","source":"free_monthly"}]}

# Internal: hand completed (FR-6) — shared secret, NOT X-Player-Id, playerId in the body
curl -X POST $BASE/internal/streaks/hand-completed \
  -H 'Content-Type: application/json' \
  -H "X-Internal-Secret: $SECRET" \
  -d '{"playerId":"streak-001","tableId":456,"handId":"hand-789","completedAt":"2026-02-20T14:30:00Z"}'
# → {"playerId":"streak-001","date":"2026-02-20","playStreakUpdated":true,
#    "playStreak":1,"milestoneEarned":null}

# Admin: grant freezes (FR-3.3) — shared secret
curl -X POST $BASE/api/v1/admin/streaks/freezes/grant \
  -H 'Content-Type: application/json' \
  -H "X-Internal-Secret: $SECRET" \
  -d '{"playerId":"streak-001","count":2}'
# → {"playerId":"streak-001","granted":2,"freezesAvailable":2,
#    "source":"purchased","updatedAt":"..."}
```

> The internal/admin calls **mutate** state. After running them, re-run
> `node scripts/seed-streaks.js` to restore the clean demo fixtures.

**Stop / reset:**

```bash
docker compose --profile streaks down      # stop
docker compose --profile streaks down -v   # also wipe DB volumes (full reset)
```

---

## 4. Architecture (brief)

```
React dashboard (Vite :4001)  ──HTTP──►  Streaks API (serverless-offline :5001)  ──►  DynamoDB Local
   RTK Query, X-Player-Id                handler → service → repository                  4 tables
```

**Layered, always** (CLAUDE.md Inv. 6): every request flows **handler → service →
repository**. Handlers do HTTP + validation only; all streak/freeze/reward/calendar
logic lives in `services/`; all DynamoDB IO lives in `repositories/`. No `docClient`
calls leak into handlers.

**4-table DynamoDB model** (created by `docker-compose` `dynamodb-init`; keys are frozen):

| Table | PK / SK | Holds |
|---|---|---|
| `streaks-players` | `playerId` | Current streak state, bests, freeze balance |
| `streaks-activity` | `playerId` / `date` | One row per UTC day (login/play/freeze/broken flags) |
| `streaks-rewards` | `playerId` / `rewardId` | Milestone rewards + the `notification` payload Map |
| `streaks-freeze-history` | `playerId` / `date` | Freeze **consumption** events |

**Core invariants:**

- **UTC calendar day, once per request.** Every "day" is a UTC day derived a single
  time via `lib/utc.ts` (Luxon `DateTime.utc().toISODate()`). No device clocks.
- **Idempotent writes.** `check-in` and `hand-completed` are once-per-UTC-day idempotent
  via a conditional write (`attribute_not_exists(#date)`) on the dated activity row —
  duplicate same-day calls return current state at `200`, never a double-increment.
- **Atomic milestone awards.** A milestone reward + the `streak_bonus` ledger txn + the
  `notification` payload + the player update are one `TransactWriteCommand` — never an
  awarded-but-unrecorded reward.
- **No Scans on hot paths.** A calendar month is one `Query` (`begins_with(#date, :ym)`).

Depth: [`ARCHITECTURE.md`](ARCHITECTURE.md) (flows + ADRs), [`DATA_MODEL.md`](DATA_MODEL.md)
(tables, access patterns, conditional writes), [`API_CONTRACT.md`](API_CONTRACT.md)
(every route, shape, and error code).

---

## 5. Testing

```bash
# Backend — 141 tests (Jest + ts-jest)
cd serverless-v2/services/streaks-api && npm install && npm test

# Backend typecheck (strict TS)
npm run typecheck            # tsc --noEmit

# Frontend — 18 tests (Vitest + RTL + MSW)
cd serverless-v2/services/streaks-frontend && npm install && npm test
```

**Test philosophy:**

- **Exact-value TDD units** for all pure logic and IO-shaped services — `lib/utc.ts`,
  the streak / freeze / reward / calendar services, and the repository
  conditional-write/transaction helpers. The failing test is written first, with the
  exact expected values (e.g. "consecutive day, `loginStreak = 4` → after check-in `5`").
- **Integration tests** drive the Express app with **supertest against DynamoDB Local**,
  covering the full check-in → streak update → milestone reward path.
- **Frontend** is acceptance-test-driven: components render with the real Redux
  `<Provider>`, the network is mocked with **MSW**, and assertions are on rendered output
  (heat-map cell states, streak numbers, milestone copy).
- **SM-5 machine-checkable invariants** — the idempotency guarantees (one check-in per
  UTC day; first-hand-of-day advances, later hands no-op; one activity row; no
  double-increment) are tagged tests (`SM-5(a/b/c/d)`), so the once-per-day contract is
  enforced by CI, not by inspection.

The backend suite exits clean (no `--forceExit`).

---

## 6. Implemented vs deferred

| Slice | Scope | Status |
|---|---|---|
| **S0** | TypeScript foundation, toolchain, health route | ✅ Shipped |
| **S1** | Login check-in core (streak advance/reset, idempotency) | ✅ Shipped |
| **S2** | Play streak + internal `hand-completed` event | ✅ Shipped |
| **S3** | Milestone rewards + FR-7 notification payload | ✅ Shipped |
| **S4** | Freeze protection (lazy eval, monthly grant, admin grant) | ✅ Shipped |
| **S5** | Calendar endpoint + deterministic seed | ✅ Shipped |
| **S6** | React dashboard (counters, heat map, rewards, freezes) | ✅ Shipped |
| **S7** | Hardening + docs (error contract, this README, API polish) | ✅ Shipped |

The **Must + Should core (S0–S7) shipped first and complete** (the over-scope rule,
PROJECT.md §7: a complete core beats a half-finished core chasing bonuses). With the core
green, the **Could-Have bonus phase and the UX backlog were then built too** — all of the
below now ship:

| Bonus | Scope | Status |
|---|---|---|
| **S8** | FR-7 push-payload audit, **FR-8 admin view-history** (§4.8), **FR-10 scheduled-freeze cron** | ✅ Shipped — the cron calls the **same** `freeze.service` consume the lazy path uses (idempotent via the per-day freeze-history conditional write, ADR-2); the one sanctioned `Scan`. |
| **S9** | **FR-9 share-card** SVG endpoint + dashboard "Share" affordance | ✅ Shipped — branded streak card via zero-dep server-side SVG; degrades to a minimal card, never 500s (ADR-8). `?format=png` → `400` (no rasterizer built). |
| **S10** | NFR-10 GitHub Actions CI | ✅ Shipped — `streaks-ci.yml` mirrors the pre-push hook (`tsc --noEmit` + both suites on push/PR, Node 22, DynamoDB Local service). |
| **BL-1** | Cinematic intro → login screen → dashboard flow | ✅ Shipped — branded intro video → art-deco "High Roller's Lounge" login (stub-auth sets `X-Player-Id`) → dashboard, with logout. |
| **BL-2** | 3 selectable dashboard themes (runtime switch) | ✅ Shipped — `hijack-dark` / `hijack-lounge` (warm art-deco) / `hijack-neon`, switched live via a top-corner `1·2·3` control, persisted. |
| **BL-3** | Mockup-driven visual polish | ✅ Shipped — dashboard matches the FR-4 mockup layout; the mockup's warm palette is BL-2's lounge theme. |

**Test status (streaks feature):** backend **161** + frontend **29** = **190 tests**, `tsc`
clean, every slice gate re-verified live. Each package is `npm install && npm test` (see §5);
the sibling skeleton services (`holdem-processor`, `rewards-api`, `cash-game-broadcast`) are
**out of this feature's scope and untouched** — they pass once their own and the
`serverless-v2/shared` `node_modules` are installed.

> **What we'd do next** (genuinely remaining): PI-1 — `scripts/init-dynamodb.sh` creates 2
> of the 4 streaks tables (the running stack uses docker-compose's full init, so this only
> affects a standalone run of that helper); and a docs-align sweep of the `RESEARCH.md`
> citations (that file lives in the parent dir, outside this repo).

---

## 7. Trade-offs & decisions

Architectural decisions are recorded as **ADRs in [`ARCHITECTURE.md §11`](ARCHITECTURE.md)**
(11 ADRs) and every doc-conflict resolution in [`ASSUMPTIONS.md`](ASSUMPTIONS.md)
(A-1…A-7, all reconciled in S7). Notable ones:

- **Zero-dep `rewardId`** (A-7 / ADR-10) — instead of installing `ulid`, the reward id is
  a zero-dependency, lexicographically-sortable string: a 15-digit zero-padded
  epoch-millis prefix + a short base-36 suffix (`makeRewardId`). It sorts ascending by
  time exactly like a ULID's time component, so a rewards `Query` with
  `ScanIndexForward=false` returns newest-first directly — preserving the only property
  the access pattern needs while keeping the dep budget intact.
- **500, not 503, for DB-down** (A-3 / ADR-11) — an unhandled DynamoDB/server failure
  returns `500 InternalError` with the canonical `{ error, message }` shape. The wire
  error catalogue (API_CONTRACT.md §3) is canonical for status codes; there is no 503.
- **Canonical `/api/v1/player/streaks…` + alias** (ADR-6) — the Unity-contract path is
  canonical; the skeleton's `/api/v1/streaks…` is kept as a backward-compatible alias
  routed to the same handlers.
- **`serverless-esbuild ^1.55.0`** (A-4) — the planning literal `^0.8.0` doesn't exist on
  npm and can't transpile `.ts` handlers for current serverless-offline; the 1.x line is
  what actually builds and runs the TS service.

---

## 8. Repo layout (streaks-relevant)

```
skeleton/
├── docker-compose.yml                  # `streaks` profile + the 4-table dynamodb-init
├── .env.example                        # env defaults (INTERNAL_API_SECRET=dev-internal-secret)
├── .githooks/                          # pre-push: tsc --noEmit + npm test
├── scripts/seed-streaks.js             # deterministic, idempotent seed (streak-001..010)
├── serverless-v2/services/
│   ├── streaks-api/                    # TS backend: handlers → services → repositories
│   └── streaks-frontend/               # React + MUI + RTK Query dashboard (Vite)
├── API_CONTRACT.md  ARCHITECTURE.md  DATA_MODEL.md  PROJECT.md  TECH_STACK.md
├── ASSUMPTIONS.md   CLAUDE.md          # doc-conflict resolutions + agent rulebook
└── SLICE_REPORTS/                      # what shipped each slice (+ dashboard screenshot)
```

For the generic multi-option skeleton readme (Options A/B/D, MySQL schema, Hand Viewer,
full port reference), see [`docs/local-development.md`](docs/local-development.md).
</content>
