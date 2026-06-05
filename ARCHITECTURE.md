# ARCHITECTURE.md — Hijack Poker Daily Streaks (Option C)

**Status:** Locked. Constrained by [`PROJECT.md`](./PROJECT.md) (FR/NFR IDs are canonical here) and grounded in [`../RESEARCH.md`](../RESEARCH.md) (Q1–Q6).
**Scope:** Must-Have + Should-Have (PROJECT.md §7) = S0–S7 core. **Could-Have ratified into scope 2026-06-05** (FR-7 push-payload, FR-8 admin view-history, FR-9 share-card, FR-10 scheduled freeze, NFR-10 CI) — built in the S8–S10 bonus phase **after** the core is green (PROJECT.md §7 over-scope discipline). Bonus components are marked **[BONUS]** throughout this doc.
**Precedence:** `CLAUDE.md §Doc precedence` — PROJECT.md > this doc > TECH_STACK / API_CONTRACT / DATA_MODEL.
**Canonical companions:** [`DATA_MODEL.md`](./DATA_MODEL.md) (table attributes), [`API_CONTRACT.md`](./API_CONTRACT.md) (request/response/error shapes), [`TECH_STACK.md`](./TECH_STACK.md) (versions/tooling). This doc points to them; it does not duplicate them.

---

## 1. Architecture philosophy (ranked commitments)

1. **Deterministic UTC core (PROJECT.md NFR-1, FR-1.4).** Every streak decision is a pure function of (persisted state, the single UTC day computed once at the request edge). One `utcDay()` derivation in `lib/utc.ts`; "today/yesterday/days-between" are computed once and threaded down. No `Date` math in services or repositories. Rationale: RESEARCH.md Q3 (device-clock exploit avoidance; midnight-boundary bug class).
2. **Idempotent writes (NFR-2, FR-5.2, FR-6.2).** Both player-driven writes (check-in, hand-completed) are once-per-UTC-day idempotent via a DynamoDB conditional write (`attribute_not_exists`) on the activity item. The activity-row write is the **single source of truth** for "did this happen today." Rationale: RESEARCH.md Q3 — conditional writes are idempotent and retry-safe; bare atomic counters are not.
3. **Thin handlers / logic in services / IO in repositories (SM-3, Pillar 5).** Handlers parse+validate+respond only. Services hold all streak/freeze/reward/calendar business rules and stay pure where possible (date and current state passed in). Repositories own every DynamoDB call. No service imports the AWS SDK; no handler reads DynamoDB.
4. **Fail-honest (NFR-7).** A consistent `{ error, message }` JSON shape with correct HTTP codes. We never silently swallow a write failure or report a reward we failed to persist (see §7). `501` remains only for genuinely unimplemented surface.
5. **Team-extensible (Pillar 5).** TypeScript end-to-end on the backend, layered, business logic unit-tested with exact expected values, non-obvious calls captured as ADRs (§11). Four readable tables over one clever one (ADR-1).

---

## 2. System diagram (ASCII)

### Production shape (target — deployment itself is out of scope, PROJECT.md §8)

```
                         ┌──────────────────────────────┐
  Unity mobile client    │  player-facing surface        │
  + Web dashboard  ──────▶  GET  /api/v1/player/streaks   │
   (JWT stub:             │  POST /api/v1/player/streaks/  │
    X-Player-Id)         │       check-in                 │
                         │  GET  …/calendar ?month=        │
                         │  GET  …/rewards                 │
                         │  GET  …/freezes                 │      ┌────────────────────┐
                         │  GET  …/share-card    [BONUS]   │      │  DynamoDB (4 tables)│
                         │      (alias: /api/v1/streaks…)  │      │  streaks-players    │
                         └───────────────┬─────────────────┘      │  streaks-activity   │
                                         │  authMiddleware         │  streaks-rewards    │
                                         ▼                         │  streaks-freeze-    │
  Game Engine            ┌──────────────────────────────┐  SDK v3 │     history         │
  holdem-processor ──────▶  internal / admin surface     │ ──────▶ └────────────────────┘
  (FR-6, hand done)      │  POST /internal/streaks/       │ DocCli           ▲
   shared-secret guard   │       hand-completed           │                  │
   (NOT player auth)     │  POST /api/v1/admin/.../freezes│ (FR-3.3)         │ same
                         │  GET  /api/v1/admin/…/history   │ (FR-8 [BONUS])  │ freeze.service
                         │      streaks-api  (Lambda)     │                  │ consume()
                         └───────────────┬────────────────┘                  │
                                         │                                    │
  EventBridge / cron  ───────────────────▶ scheduledFreeze handler  [BONUS] ─┘
   (rate/cron, §10)        FR-10: iterates players, calls the SAME
                           freeze.service consume() the lazy path uses
                           (idempotent via per-day conditional write)

       handler.ts → handlers/ → services/ → repositories/dynamo.repository.ts → DocClient
```

The Game Engine path is the existing `holdem-processor` pipeline (PROJECT.md §3 P1, RESEARCH.md Q6). It does **not** call the player-facing surface; it posts to `/internal/streaks/hand-completed` (FR-6.3), which is guarded separately (§9). **ASSUMPTION:** in production the internal call is server-to-server inside the VPC/trust boundary; the shared-secret guard is the documented stand-in (no real integration is built — PROJECT.md §8 hard-out).

**[BONUS] Scheduled-freeze Lambda (FR-10):** an EventBridge/cron `schedule` event (§10) invokes a separate `scheduledFreeze` handler that iterates players and calls the **same** `freeze.service` consume function the lazy path (5c) uses — never a parallel implementation. Lazy eval (5c) remains the **source of truth**; the cron job is an idempotent freshness optimizer (5f). **[BONUS] Share-card endpoint (FR-9):** `GET /api/v1/player/streaks/share-card` renders a branded streak card via `share.service` (5g); it reads existing streak state and writes nothing.

### Local-dev shape (`docker compose --profile streaks up`, NFR-5)

```
┌─ Docker Compose (profile: streaks) ───────────────────────────────────┐
│                                                                       │
│  dynamodb-local         :8000   (AWS DynamoDB Local image)            │
│  dynamodb-init          (one-shot: creates the 4 streaks tables,      │
│                          then exits — docker-compose.yml ~L111-151)   │
│                                                                       │
│  streaks-api            :5001   node:22-alpine, serverless-offline    │
│      env: DYNAMODB_ENDPOINT=http://dynamodb-local:8000               │
│           STREAKS_PLAYERS_TABLE / STREAKS_ACTIVITY_TABLE (+ rewards,  │
│           freeze-history added by this build)                         │
│                                                                       │
│  streaks-frontend       :4001   node:22-alpine, Vite dev server       │
│      env: VITE_API_URL=http://localhost:5001                         │
│                                                                       │
│  Browser ──▶ :4001 (dashboard) ──RTK Query──▶ :5001 (api) ──▶ :8000  │
└───────────────────────────────────────────────────────────────────────┘
```

Seed: an extended `seed-streaks.js` populates login/play/freeze/reward data so the dashboard renders against real data (PROJECT.md S5, SM-1).

---

## 3. Repo / service layout (target TypeScript trees)

Reconciles PROJECT.md's spec tree with what exists in the skeleton today (CommonJS `handler.js`, `src/routes/*.js`, `src/services/dynamo.service.js`). The skeleton's `routes/` (Express routers) is renamed to `handlers/` to match the spec's vocabulary and the layered model; the existing stub routes (`check-in.js`, `streaks.js`, `health.js`) are absorbed/replaced. `src/services/dynamo.service.js` becomes `repositories/dynamo.repository.ts` (it is IO, not business logic — fixing the skeleton's mislabel).

### `serverless-v2/services/streaks-api/` (TypeScript — ADR-7)

```
streaks-api/
├── handler.ts                     # Express app + serverless-http; mounts routers, CORS, 404
├── serverless.yml                 # v3, provider nodejs20.x  (see §10 note)
├── serverless.offline.yml         # serverless-offline, httpPort 5001
├── tsconfig.json  package.json  jest.config
├── src/
│   ├── handlers/                  # thin: parse → call service → map to HTTP
│   │   ├── health.ts
│   │   ├── check-in.ts            # POST /player/streaks/check-in        (FR-5.2)
│   │   ├── streaks.ts             # GET  /player/streaks                 (FR-5.1)
│   │   ├── calendar.ts            # GET  /player/streaks/calendar        (FR-5.3)
│   │   ├── rewards.ts             # GET  /player/streaks/rewards         (FR-5.4)
│   │   ├── freezes.ts             # GET  /player/streaks/freezes         (FR-5.5)
│   │   ├── internal.ts            # POST /internal/streaks/hand-completed(FR-6)
│   │   ├── admin.ts               # POST …/admin/streaks/freezes/grant (FR-3.3)
│   │   │                          # GET  …/admin/streaks/players/:id/history  (FR-8 [BONUS])
│   │   ├── share-card.ts          # GET  /player/streaks/share-card   (FR-9 [BONUS])
│   │   └── scheduled-freeze.ts    # cron entry; not an HTTP route      (FR-10 [BONUS])
│   ├── services/                  # all business logic; pure where practical
│   │   ├── streak.service.ts      # increment / reset / best-streak; orchestrates check-in & play
│   │   ├── play.service.ts        # play-streak advance from hand-completed (FR-1.2)
│   │   ├── reward.service.ts      # milestone detection + award assembly + push payload (FR-2, FR-7 [BONUS])
│   │   ├── freeze.service.ts      # monthly grant, lazy auto-consume (consume() reused by cron), admin grant (FR-3, FR-10)
│   │   ├── share.service.ts       # render branded streak card (FR-9 [BONUS]; renderer per TECH_STACK.md)
│   │   └── calendar.service.ts    # day-array assembly from one Query     (FR-5.3)
│   ├── repositories/
│   │   └── dynamo.repository.ts   # every DynamoDB op (Get/Put/Update/Query/Transact)
│   ├── domain/
│   │   └── types.ts               # PlayerStreak, ActivityDay, Reward, FreezeRecord, ApiShapes
│   ├── lib/
│   │   └── utc.ts                 # utcDay(), yesterday(), daysBetween(), YYYY-MM  (NFR-1)
│   ├── middleware/
│   │   ├── auth.ts                # JWT stub → req.playerId (X-Player-Id)  (NFR-3)
│   │   └── internalAuth.ts        # shared-secret guard for /internal/*    (§9)
│   └── config/
│       ├── milestones.ts          # MILESTONES table (FR-2.1; values already in constants.js)
│       └── constants.ts           # table names, freeze rules, milestone helpers
└── __tests__/                     # unit (streak/reset/milestone/freeze) + ≥1 integration (NFR-4)
```

### `serverless-v2/services/streaks-frontend/` (React 18 + TS — exists; extended)

```
streaks-frontend/
├── vite.config.ts (port 4001)  tsconfig.json  package.json
├── src/
│   ├── main.tsx  App.tsx  theme.ts          # dark/orange MUI v5 theme (exists; on-brand pass)
│   ├── store/
│   │   ├── index.ts                          # configureStore (extends existing store.ts auth slice)
│   │   └── streaksApi.ts                      # RTK Query createApi (ADR: RTK Query, RESEARCH.md Q5)
│   ├── api/
│   │   └── client.ts                          # base URL / X-Player-Id header (exists, kept)
│   ├── hooks/
│   │   ├── useStreaks.ts                      # wraps generated RTK Query hooks
│   │   └── useCalendar.ts
│   ├── components/
│   │   ├── StreakDashboard.tsx                # container (replaces pages/Dashboard.tsx placeholder)
│   │   ├── StreakCounter.tsx                  # flame grows with length (FR-4.1/4.2)
│   │   ├── CalendarHeatMap.tsx                # CSS grid + MUI, from scratch (ADR-5, FR-4.3)
│   │   ├── MilestoneProgress.tsx             # FR-4.4
│   │   ├── PersonalBest.tsx                   # FR-4.5
│   │   ├── FreezeStatus.tsx                   # FR-4.6
│   │   └── RewardHistory.tsx                  # FR-4.7
│   └── types/
│       └── streaks.types.ts                   # mirrors API_CONTRACT.md shapes
└── __tests__/                                 # RTL + MSW for key components (NFR-4)
```

---

## 4. Data model (at a glance — DATA_MODEL.md is canonical)

Four tables (ADR-1; RESEARCH.md Q4). Keys only here; full attribute tables, defaults, and the milestone reward matrix live in **[`DATA_MODEL.md`](./DATA_MODEL.md)**.

| Table | PK | SK | Holds | Created by |
|---|---|---|---|---|
| `streaks-players` | `playerId` (S) | — | current/best login+play streaks, last dates, freeze balance, `lastFreezeGrantDate` (`YYYY-MM`) | docker-init |
| `streaks-activity` | `playerId` (S) | `date` (S, `YYYY-MM-DD` UTC) | `loggedIn`/`played`/`freezeUsed`/`streakBroken` + streak-at-day; **the idempotency item** | docker-init |
| `streaks-rewards` | `playerId` (S) | `rewardId` (S, ULID) | milestone awards (type, milestone, points, streakCount) | docker-init |
| `streaks-freeze-history` | `playerId` (S) | `date` (S, `YYYY-MM-DD`) | consumed freezes (source: `free_monthly`/`purchased`) | docker-init |

All four exist in `docker-compose.yml` (~L111-151). The skeleton's `dynamo.service.js` only wires `STREAKS_PLAYERS_TABLE` + `STREAKS_ACTIVITY_TABLE`; the new repository adds the rewards + freeze-history table names (set in the compose env and `serverless.yml`). SK is ISO-8601 so lexical order = chronological (RESEARCH.md Q4). DocClient is configured with `removeUndefinedValues: true` (already in `shared/config/dynamo.js`; RESEARCH.md Q4).

---

## 5. Core flows (step-by-step)

Each flow names the exact DynamoDB ops and the `ConditionExpression`s that enforce idempotency/atomicity. UTC day is computed once in the handler via `utcDay()` and passed down (NFR-1).

### 5a. Login check-in (`POST /api/v1/player/streaks/check-in`, FR-5.2)

Implements the algorithm in [`docs/challenge-streaks.md` §Core Logic: Check-In](./docs/challenge-streaks.md).

1. `today = utcDay()`, `yesterday = today − 1` (computed once, edge).
2. **Idempotency gate (source of truth):** `streak.service` asks the repo to write the activity item for `today` with `PutCommand … ConditionExpression: "attribute_not_exists(#date)"` setting `loggedIn=true`.
   - **`ConditionalCheckFailedException` ⇒ already checked in today** → short-circuit: read the player record, return current state. **Idempotent, 200** (FR-5.2, SM-5). No counter touched.
   - Succeeds ⇒ first login today; continue.
3. `getPlayer(playerId)` (`GetCommand` on `streaks-players`). New player ⇒ no `lastLoginDate`.
4. **Lazy freeze evaluation runs first** (see 5c) to settle any missed days before deciding today's transition.
5. Decide login transition:
   - `lastLoginDate === yesterday` (or freeze just preserved) → `loginStreak += 1`.
   - new player / no prior date → `loginStreak = 1` (FR edge: first check-in).
   - `lastLoginDate < yesterday` and no freeze applied → `loginStreak = 1` (reset, FR-1.5); mark `streakBroken` on the activity row.
6. **Milestone check** (5d) on the new `loginStreak` via `getMilestone()` (`config/milestones.ts`).
7. **Best-streak update:** `bestLoginStreak = max(bestLoginStreak, loginStreak)` (FR-1.6).
8. **Persist** player mutation (`loginStreak`, `bestLoginStreak`, `lastLoginDate=today`, `updatedAt`) and finalize the activity row (`loginStreakAtDay`). If a milestone fired, the player update + reward + txn + notification go in **one** `TransactWriteCommand` (5d). Else a single conditional `UpdateCommand` on the player record (condition `lastLoginDate <> :today` to guard against a racing duplicate that slipped past step 2).
9. Return updated state (API_CONTRACT.md shape).

> Counter advance uses a **conditional `UpdateCommand`, never `ADD`** (RESEARCH.md Q3 — atomic counters double-count on retry). The activity conditional write is what actually makes the whole flow idempotent; the player update is guarded as defense-in-depth.

### 5b. Play streak via hand-completed (`POST /internal/streaks/hand-completed`, FR-6)

1. `internalAuth` guard (shared secret, §9). Validate `{ playerId, tableId, handId, completedAt }`; `day = utcDay(completedAt)` — the UTC day of the *hand*, not "now" (RESEARCH.md Q3 timezone edge).
2. **Idempotency per UTC day:** upsert the activity item for `day` setting `played=true` with `ConditionExpression: "attribute_not_exists(#date) OR #played <> :true"`.
   - condition false (already `played` that day) ⇒ **no-op** (FR-6.2; multiple-hands edge). Return 200.
3. Same transition logic as 5a but on the **play** axis (`playStreak`, `bestPlayStreak`, `lastPlayDate`) — independent counter (FR-1.3). Lazy freeze (5c) applies to play too.
4. Milestone check on `play_milestone` axis (5d).
5. Persist via conditional `UpdateCommand` or `TransactWriteCommand` (if milestone). Return 200.

### 5c. Lazy freeze auto-consumption (FR-3.5/3.7, the 01:00-UTC rule, implemented lazily)

Runs at the top of every check-in / hand-completed, **before** the transition decision (no scheduled Lambda — ADR-2, PROJECT.md §8).

1. Let `last` = the relevant `lastLoginDate`/`lastPlayDate`. `gap = daysBetween(last, today)`.
2. `gap <= 1` → nothing to do (active or contiguous).
3. `gap === 2` (exactly one missed day) **and** `freezesAvailable > 0`:
   - **Consume one freeze:** `TransactWriteCommand` = (a) `UpdateCommand` on player `SET freezesAvailable = freezesAvailable - 1, freezesUsedThisMonth = +1` with `ConditionExpression: "freezesAvailable > :zero"`; (b) `PutCommand` on `streaks-freeze-history` for the missed `date` with `attribute_not_exists(#date)` (idempotent record); (c) `PutCommand`/update the missed day's `streaks-activity` row `freezeUsed=true`.
   - Streak **preserved** — the subsequent transition treats `last` as if it were `yesterday` (FR-3.4/3.6: one freeze covers both axes simultaneously).
4. `gap >= 3`, or `gap === 2` with no freeze → no protection; the transition (5a/5b step 5) **resets** the streak and marks `streakBroken` (FR-3 edge: two missed days → freeze covers first, reset on second; RESEARCH.md Q2).
5. **Monthly grant** is settled here too: if `lastFreezeGrantDate !== YYYY-MM(today)`, grant 1 free freeze and set `lastFreezeGrantDate` — compared by calendar month, not every 30 days (FR-3.1, RESEARCH.md Q3 edge).

> Lazy eval means a missed day's `freezeUsed`/`streakBroken` flag is materialized on the *next* activity event, not at 01:00 UTC. The calendar endpoint (5e) renders the stored flags; ASSUMPTION: a never-returning player's gap days stay `none` until they return — acceptable for this scope and documented in the README.

### 5d. Milestone reward award (FR-2, atomic)

1. After a counter advance, `reward.service.getMilestone(newCount)` returns a milestone or null. Milestones: 3/7/14/30/60/90 (FR-2.1, `config/milestones.ts`).
2. "Once per milestone **per streak instance**" (FR-2.2): because a reset takes the counter back through the ladder, reaching `7` again is a genuinely new advance to 7 — so detection keys on *this advance hitting the exact value*, not on historical existence. The activity-row idempotency (5a/5b) guarantees the advance happens at most once per day, which is what makes "exactly once per instance" hold (SM-5).
3. **Atomic award** — single `TransactWriteCommand` (RESEARCH.md Q4, cross-table atomicity) bundling:
   - `Put` `streaks-rewards` row (`rewardId`=ULID, type `login_milestone`/`play_milestone`, milestone, points, streakCount, createdAt) with `attribute_not_exists(rewardId)`;
   - `Put`/Update the **point transaction** record `type="streak_bonus"` (FR-2.5 — record only, no live rewards integration);
   - `Put` the **notification** payload (FR-2.4 — stored, not delivered, per §8);
   - the player-record `Update` from 5a/5b step 8.
   - One transaction ⇒ no awarded-but-unrecorded reward and no recorded-but-unawarded points (§7 partial-write).
4. **[BONUS] Push-notification payload on the reward item (FR-7).** When `reward.service` assembles the reward in step 3, it **also** builds the push-notification message payload — `{ title, body, deepLink, milestone, type }` — and attaches it to the **same `streaks-rewards` row** (a `notification` attribute; DATA_MODEL.md §4–5 canonical) inside the **same `TransactWriteCommand`**. **No extra write, no separate notifications table** (ADR-9). Body copy is milestone-aware loss-aversion-light framing distinct for login vs play (FR-7.3, RESEARCH.md Q1). The payload is returned in the `milestoneEarned`/reward shapes (API_CONTRACT.md). Content only — delivery is a hard out-of-scope (PROJECT.md §8, FR-7.1).

> **Resolved (DATA_MODEL.md §4–5 canonical):** the `streak_bonus` transaction and the `notification` payload are stored **on the same `streaks-rewards` row** (via the `pointTxnType` and `notification` attributes) — no separate transactions or notifications table. The architectural invariant is that they are written **in the same `TransactWriteCommand`** as the reward.

### 5e. Calendar assembly (`GET …/calendar?month=YYYY-MM`, FR-5.3)

1. `calendar.service` validates `month` (`YYYY-MM`), derives `begins_with` prefix.
2. **One** `QueryCommand` on `streaks-activity`: `KeyConditionExpression: "playerId = :p AND begins_with(#date, :ym)"` (NFR-8 — single Query, no Scan; RESEARCH.md Q4).
3. Build a dense day array for the month: each present row → its activity state; absent days → `none`. State precedence (canonical, DATA_MODEL.md §3): `played` (dark green) > `freeze` (blue) > `broken` (red) > `login_only` (light green) > `none` (gray) (FR-4.3).
4. Return `{ month, days[] }` (API_CONTRACT.md shape). The dashboard's "last 30 days" view uses the same row data via a `BETWEEN` window (RESEARCH.md Q4).

### 5f. [BONUS] Scheduled freeze consumption (FR-10, cron handler)

A cron-triggered handler (`scheduled-freeze.ts`, invoked by the EventBridge `schedule` event in §10) proactively settles missed-day freezes for players who have **not** returned, keeping stored `freezeUsed`/`streakBroken` flags fresh for the dashboard/calendar of absent players. It is a freshness optimizer, **not** a second source of truth.

1. **Iterate players.** The handler pages players from `streaks-players`. **Tradeoff (explicit):** there is no natural "players with a stale `lastLoginDate`" index, so the bonus tooling either (a) `Scan`s `streaks-players` (paginated), or (b) maintains a GSI keyed on `lastActivityDate` to Query only at-risk players. We **lean to a paginated `Scan` for the bonus** (simplest, no schema change, runs off the hot path on a schedule) and note the GSI as the production upgrade. This is the **one sanctioned `Scan`** — it is cron/admin tooling, never a player/internal request path (CLAUDE.md Inv. 8, NFR-8).
2. For each player, compute `gap = daysBetween(lastLoginDate/lastPlayDate, today)` with the same `utcDay()` edge derivation (NFR-1).
3. **Call the SAME `freeze.service` consume function the lazy path (5c step 3) uses** — never a parallel implementation. Same `TransactWriteCommand`: player decrement guarded by `freezesAvailable > 0`, `streaks-freeze-history` `Put` for the missed `date` with `attribute_not_exists(#date)`, missed-day activity `freezeUsed=true`.
4. **Idempotency with lazy eval (the load-bearing invariant).** Because both paths route through the **per-day `streaks-freeze-history` conditional write** (`attribute_not_exists(date)`), running the cron and the lazy path against the same missed day **can never double-consume**: whichever runs first writes the freeze-history row and decrements; the second sees `ConditionalCheckFailedException` and no-ops. **Lazy evaluation on next check-in remains the source of truth** (ADR-2) — the cron only materializes the same decision earlier for absent players.
5. Emit `streaks.freeze.consumed` per consume and a `streaks.scheduled.swept` count (§8). Errors per-player are logged and skipped; one bad player never fails the sweep.

### 5g. [BONUS] Share-card generation (`GET /api/v1/player/streaks/share-card`, FR-9)

1. `share-card.ts` handler resolves `req.playerId` (player auth, §9), calls `share.service.renderCard(playerId)`.
2. `share.service` reads the player's streak state (the same `getPlayer` read 5a uses — current login/play streaks, personal bests; FR-9.1) — **read-only, no writes.**
3. It renders a **branded** card (dark/orange Hijack styling, framed around the "Hot Streak" promo per RESEARCH.md Q6) summarizing both streaks + personal best.
4. **Rendering approach is decided in [`TECH_STACK.md`](./TECH_STACK.md), not here** — the lean default is **server-side SVG templating** (zero heavy deps, returns `image/svg+xml`); an **optional satori + resvg** path renders PNG (`image/png`) if a raster card is wanted. This doc does not re-decide the dependency; see ADR-8 and TECH_STACK.md.
5. On render failure, **degrade** to a minimal text/SVG fallback — never `500` (see §7). Return `200` with the card body and the appropriate content-type.

---

## 6. API surface (API_CONTRACT.md is canonical for shapes/errors)

Canonical path prefix `/api/v1/player/streaks…`; `/api/v1/streaks…` kept as a backward-compat alias so the existing skeleton stub/tests keep working (ADR-6, PROJECT.md FR-5 ASSUMPTION). All player endpoints pass `authMiddleware` (sets `req.playerId`).

| Method | Path | Purpose | FR |
|---|---|---|---|
| GET | `/api/v1/health` | Liveness (exists, public) | — |
| GET | `/api/v1/player/streaks` | Current login+play streaks, bests, freezes, next milestones | FR-5.1 |
| POST | `/api/v1/player/streaks/check-in` | Record today's login; idempotent per UTC day | FR-5.2 |
| GET | `/api/v1/player/streaks/calendar?month=YYYY-MM` | Heat-map day array (one Query) | FR-5.3 |
| GET | `/api/v1/player/streaks/rewards` | Reward history | FR-5.4 |
| GET | `/api/v1/player/streaks/freezes` | Freeze balance + history | FR-5.5 |
| GET | `/api/v1/player/streaks/share-card` | **[BONUS]** Branded streak card (SVG/PNG); player auth; read-only | FR-9 |
| POST | `/internal/streaks/hand-completed` | Game-engine play-streak update; idempotent; shared-secret guard | FR-6 |
| POST | `/api/v1/admin/streaks/freezes/grant` | Admin grants freeze balance (no payment) | FR-3.3 |
| GET | `/api/v1/admin/streaks/players/:playerId/history` | **[BONUS]** Full player streak + activity + rewards + freeze history (support/debug); `X-Internal-Secret` guard | FR-8 |
| GET\|POST | `/api/v1/streaks…` (alias of the player paths) | Backward compat for skeleton stub | FR-5 |

> The scheduled-freeze sweep (FR-10) is a **cron handler, not an HTTP endpoint** — it has no public route (§5f, §10). It is intentionally absent from this table.

Full request bodies, response JSON, and the `{ error, message }` error catalogue (400/401/404/409/501) are in **[`API_CONTRACT.md`](./API_CONTRACT.md)** (Unity-facing, rubric-weighted SM-4).

---

## 7. Failure modes & degradation

| Dependency / failure | Behavior |
|---|---|
| **DynamoDB unavailable** | Repository surfaces the SDK error; the error-normalizing middleware maps it to `500` `{error:"InternalError", message}` (the canonical wire shape — API_CONTRACT.md §3; **reconciled per ASSUMPTIONS A-3** — there is no 503 in the shipped error contract). No partial state written (writes are conditional/transactional). Reads fail closed (no stale fabrication). The client retries with backoff; writes are idempotent, so retries are safe. Logged with `playerId`+`correlationId` (§8). |
| **Duplicate same-day check-in** (`ConditionalCheckFailedException` on activity put) | **Idempotent success: `200`** with current state (FR-5.2, SM-5). We deliberately do **not** 409 the player here — a retried check-in is expected. *(`409` is reserved and documented in API_CONTRACT.md for the rare case a caller asserts a non-idempotent precondition; default check-in path returns 200.)* |
| **Partial write** (reward persisted but player not advanced, or vice-versa) | Impossible on the happy path: milestone award + player update + txn + notification are one `TransactWriteCommand` (5d) — all-or-nothing (RESEARCH.md Q4). A transaction-level failure ⇒ nothing written ⇒ retry-safe. |
| **Clock / UTC edge at midnight** (`…T00:00:00Z`) | Belongs to that UTC date via `utcDay()` (`toISODate()`-equivalent). UTC computed once at the edge; never recomputed in services (NFR-1, RESEARCH.md Q3 edge). |
| **Missing freeze on a gap day** | No protection applied; streak resets and `streakBroken` is recorded (5c step 4). Not an error. |
| **Malformed internal event** (missing `playerId`/`completedAt`, bad date) | `400` `{error:"bad_request"}` from `internal.ts` validation before any write. |
| **Auth missing** (`X-Player-Id` absent on player route) | `401` `{error:"Unauthorized"}` (matches existing skeleton `authMiddleware`). Internal route without the shared secret ⇒ `401`/`403`, never falls back to player auth (§9, FR-6.3). |
| **Two missed days with one freeze** | Freeze covers the first; streak still resets on the second (5c, RESEARCH.md Q2). |
| **Race: two concurrent first-of-day check-ins** | Activity conditional put lets exactly one win; the loser gets the idempotent 200. Player `UpdateCommand` additionally guarded by `lastLoginDate <> :today`. |
| **[BONUS] Scheduled-Lambda vs lazy-eval race (FR-10)** | Both call the same `freeze.service` consume; the **per-day `streaks-freeze-history` conditional write** (`attribute_not_exists(date)`) lets exactly one win — the other gets `ConditionalCheckFailedException` and no-ops. **Never double-consumes.** Lazy eval stays source of truth (5f step 4, ADR-2). |
| **[BONUS] Share-card render failure (FR-9)** | **Degrade, never 500 the dashboard.** `share.service` falls back to a minimal text/SVG card and returns `200` (5g step 5). The dashboard's "Share" affordance treats the card as best-effort; a failed render does not block the rest of the page. |
| **[BONUS] Large player count in the cron sweep (FR-10)** | The paginated `Scan` of `streaks-players` costs O(players) RCUs per sweep; on a large base this is non-trivial. Mitigations: page with bounded `Limit`, run off-peak on the schedule, and (production) replace the `Scan` with a `lastActivityDate` GSI to touch only at-risk players (5f step 1). Per-player errors are logged and skipped — one failure never aborts the sweep. |

---

## 8. Observability (NFR-6)

- **Structured logging:** `winston` (already in `shared/config/logger.js`; JSON in non-local, pretty in local). Log at every **write path** — check-in, hand-completed, reward award, freeze consume, admin grant — with `playerId` + a per-request `correlationId` (generated in middleware, propagated through services). Decisions worth a log line: streak increment vs reset, milestone fired, freeze consumed, monthly grant issued.
- **Metric hooks (documented, emit points):** `streaks.checkin.count`, `streaks.reset.count` (login/play tagged), `streaks.reward.awarded` (milestone tagged), `streaks.freeze.consumed`, `streaks.freeze.granted`, `streaks.idempotent_noop.count`. Emitted as structured log fields now (a CloudWatch EMF / metrics sink is the production upgrade).
- **With more time (Could-Have):** EMF metric formatting, X-Ray tracing across the TransactWrite, a dead-simple `/internal/health` deep check that pings DynamoDB, alarm on reset-rate spikes (streak-anxiety signal, RESEARCH.md Q2).

---

## 9. Security summary

- **Player auth (NFR-3):** JWT-based guard, **stubbed** — `authMiddleware` accepts `X-Player-Id` (skeleton convention) and/or a stub-decoded JWT, sets `req.playerId`. Real auth (Descope is the org's actual provider per RESEARCH.md Q6) is out of scope (PROJECT.md §8).
- **Internal endpoint separation (FR-6.3):** `/internal/streaks/hand-completed` uses a **separate shared-secret guard** (`internalAuth`), not player auth — the game engine is not a player and must not present `X-Player-Id`. A missing/wrong secret returns 401/403 and never falls through to player auth.
- **Admin endpoint (FR-3.3):** behind the same internal/shared-secret class of guard; grants freeze balance only — never touches payment (PROJECT.md §8 hard-out).
- **[BONUS] Admin view-history (FR-8):** **reuses the same internal shared-secret guard (`X-Internal-Secret` / `internalAuth`)** as the admin-grant and internal endpoints — **not** player auth. It exposes another player's full state for support/debug, so it must never be reachable from the player-auth surface; missing/wrong secret returns 401/403 and never falls through to player auth (FR-8.2, CLAUDE.md Inv. 10).
- **[BONUS] Share-card auth (FR-9):** guarded by **player auth (`X-Player-Id` → `req.playerId`)** for simplicity — a player renders **their own** card. **ASSUMPTION:** the production approach for a publicly-shareable link would be a **signed, expiring token** (so the URL can be posted without leaking the player's auth header); we pick player-auth here as the lean in-scope choice and note the signed-link upgrade (ADR-8). Generation only — no social posting (PROJECT.md §8).
- **Input validation:** every write handler validates body/params before any DynamoDB call (`400` on malformed). `month` query strictly matched to `YYYY-MM`.
- **PII:** none beyond the `playerId` GUID. No names, emails, financials. `streak_bonus` is a record only; notification payloads are stored, not delivered (PROJECT.md §8).

---

## 10. Deployment

- **Framework:** Serverless Framework **v3** (`frameworkVersion: '3'` in `serverless.yml` / `serverless.offline.yml`). Single `api` function, `httpApi: '*'` catch-all routed by the Express app via `serverless-http`.
- **Runtime honesty (note):** the skeleton's `serverless.yml` sets `provider.runtime: nodejs20.x`, while the Docker containers and PROJECT.md technical requirements use `node:22-alpine`. **We keep `nodejs20.x` in `serverless.yml` (skeleton baseline) but build/test on Node 22 locally;** TECH_STACK.md should call this gap out and decide whether to bump the Lambda runtime to `nodejs22.x` for a real deploy. Recorded as a known discrepancy, not silently "fixed."
- **Local:** `serverless-offline` (httpPort 5001, lambdaPort 5003) against `dynamodb-local:8000`; tables created by the one-shot `dynamodb-init` container (docker-compose.yml ~L111-151). `npm install && npx serverless offline …` is the container command. TypeScript is compiled (ts build or `serverless-plugin-typescript`/esbuild — TECH_STACK.md is canonical for the chosen transpile path).
- **Production (out of scope, shape only):** `serverless deploy --stage <env>` provisions API Gateway (HTTP API) + the Lambda + the 4 DynamoDB tables (defined as `resources` or via the dynamodb-local-mirrored definitions). IAM scoped to the 4 tables.
- **[BONUS] Scheduled-freeze Lambda (FR-10):** a **second Serverless function** with a `schedule` event (EventBridge cron), e.g. `events: [{ schedule: rate(1 day) }]` (or `cron(0 1 * * ? *)` to mirror the conceptual 01:00 UTC consumption time, FR-3.7), pointing at `scheduled-freeze.ts` (§5f). It is **not** wired into the `httpApi` catch-all — no public route. Locally it can be invoked directly (`serverless invoke local -f scheduledFreeze`) since `serverless-offline` does not fire schedule events. IAM needs the same 4-table access.
- **[BONUS] CI pipeline (NFR-10):** a **GitHub Actions** workflow at **`.github/workflows/`** (e.g. `ci.yml`) runs on push/PR: lint (if configured) + `tsc --noEmit` typecheck + both test suites (`streaks-api` Jest, `streaks-frontend` Vitest). It mirrors the local pre-push hook (CLAUDE.md §4) so green CI is required before the work is considered shippable. Built in slice S10 (PROJECT.md §10).

---

## 11. ADRs (short)

**ADR-1 — Multi-table over single-table.**
*Context:* PROJECT.md fixes 4 tables; single-table is the DynamoDB default "best practice." *Decision:* keep 4 tables (`streaks-players/activity/rewards/freeze-history`). *Consequences:* AWS explicitly sanctions multi-table when it's easier to reason about (RESEARCH.md Q4); these entities are never co-retrieved heterogeneously, so single-table's marquee benefit doesn't apply; tables stay junior-readable; cross-table atomicity is preserved with `TransactWriteCommand`. Trade-off: a reward-award touches multiple tables, mitigated by the transaction.

**ADR-2 — Lazy eval is the source of truth AND a scheduled Lambda is added as an idempotent bonus.**
*Context:* FR-3.7 specifies "consumed at 01:00 UTC next day"; FR-10 ratifies a scheduled freeze-consumption Lambda into scope (PROJECT.md §7, 2026-06-05) alongside the lazy path. *Decision:* **lazy evaluation at the top of the next check-in/hand-completed remains the source of truth** (zero-infra, deterministic, testable, spec-blessed — RESEARCH.md Q2). **[BONUS]** A scheduled (EventBridge cron) Lambda (§5f, §10) is added that calls the **exact same `freeze.service` consume function** the lazy path uses — one implementation, two triggers. *Consequences:* the cron materializes a missed day's `freezeUsed`/`streakBroken` flag earlier for absent players (fixing the lazy-only gap where a never-returning player's days read `none`), while the shared function + the **per-day `streaks-freeze-history` conditional write** (`attribute_not_exists(date)`) guarantee the two paths **never double-consume** (§5f step 4, §7). Trade-off: the cron's player iteration is a paginated `Scan` (the one sanctioned Scan; GSI is the prod upgrade — §5f step 1). *Rationale for sharing the function:* prevents the classic drift bug where a duplicated freeze rule diverges between paths.

**ADR-3 — UTC calendar day vs device-local.**
*Context:* leaders disagree (Duolingo = device-local midnight; Snapchat = rolling 24h) — RESEARCH.md Q1. *Decision:* UTC calendar day everywhere, computed once at the request edge (`lib/utc.ts`). *Consequences:* exploit-resistant (no device-clock attack), simplest to test, matches FR-1.4/NFR-1. Trade-off: a UTC-8 player's late-night activity counts toward the next UTC day — accepted and documented as an edge case.

**ADR-4 — Conditional-write idempotency vs Powertools.**
*Context:* idempotency could come from `@aws-lambda-powertools/idempotency` or a conditional write. *Decision:* the activity item's `attribute_not_exists` conditional write is the once-per-UTC-day source of truth; counters advance via conditional `UpdateCommand`, never `ADD`. *Consequences:* business-rule idempotency is calendar-aligned (Powertools keys off payload-hash/TTL, not calendar days — RESEARCH.md Q3); zero extra infra; retry-safe. Powertools stays available as a complementary request-dedup layer if needed.

**ADR-5 — Heat map built from scratch.**
*Context:* `react-calendar-heatmap` / `react-activity-calendar` exist (RESEARCH.md Q5). *Decision:* build the 30-day heat map from scratch with a CSS grid + MUI `sx` + MUI `<Tooltip>`. *Consequences:* exact control over the 5-state colors on the dark/orange brand, no week-column semantics to fight, no tolerance-only React-18 peer dep, 30 cells too small to justify a library. Trade-off: we own accessibility/tooltips — small. Fallback: `react-activity-calendar`.

**ADR-6 — Canonical `/api/v1/player/streaks` path + alias.**
*Context:* the spec's **API Response Shapes** section uses `/api/v1/player/streaks…`; the skeleton stub mounts `/api/v1/streaks…`. *Decision:* expose `/api/v1/player/streaks…` as canonical (Unity contract) and keep `/api/v1/streaks…` as a backward-compat alias. *Status update (2026-06-05):* this is **CONFIRMED by the spec's API Response Shapes**, no longer an assumption — the `/streaks…` strings in the suggested service structure are handler file names, not public routes (PROJECT.md §11.3). *Consequences:* Unity contract honored, existing stub/tests unbroken; the alias is now a harmless convenience, not a guess. Trade-off: two mounts to maintain — trivial (same routers). The `/share-card` bonus endpoint (FR-9) lives under the same canonical prefix.

**ADR-7 — TypeScript conversion of the backend.**
*Context:* skeleton is CommonJS JS; PROJECT.md technical reqs and rubric want TypeScript (NFR-9). *Decision:* convert streaks-api to TypeScript with shared `domain/types.ts`. *Consequences:* type-safe domain model shared toward the frontend contract, better code-quality rubric signal, layered boundaries enforced by types. Trade-off: friction against CommonJS `shared/` modules (interop via `esModuleInterop`/`allowJs`); reopen only if that friction outweighs the rubric gain (PROJECT.md §11.1).

**ADR-8 — [BONUS] Share-card rendering approach (FR-9).**
*Context:* the share-card (5g) needs a branded image/SVG from server-side streak state; options range from server-side SVG templating to satori+resvg PNG to a headless-browser screenshot. *Decision:* render via the approach **decided in [`TECH_STACK.md`](./TECH_STACK.md)** — the lean default is **server-side SVG templating** (`image/svg+xml`, zero heavy deps), with **optional satori + resvg** for PNG if a raster card is wanted; **this ADR does not pick the dependency, TECH_STACK is canonical for that.** Auth is player-auth (`X-Player-Id`) for simplicity, with a signed expiring public link noted as the production upgrade (§9). *Consequences:* the dashboard gets a "Share" affordance with minimal new dependencies; render failures **degrade to a text/SVG fallback, never 500** (§7). Trade-off: SVG is the easy path but a raster (PNG) card embeds more cleanly in some social previews — the satori path is the documented upgrade. Reject headless-browser screenshotting (Puppeteer) as far too heavy for a bonus.

**ADR-9 — [BONUS] Push payload stored on the reward item, no notifications table (FR-7).**
*Context:* FR-7 requires a push-notification message payload (content only, no delivery — PROJECT.md §8) generated when a milestone reward is earned. *Decision:* build the payload `{ title, body, deepLink, milestone, type }` in `reward.service` and persist it as a `notification` attribute **on the existing `streaks-rewards` row, inside the same `TransactWriteCommand`** that writes the reward (5d step 4). **No separate notifications table is added** — the existing FR-2.4 notification record + the reward row already carry the lifecycle. *Consequences:* zero extra write, zero new table (keeps the 4-table model, ADR-1), payload travels atomically with the reward so there is never a reward-without-payload, and it is returned in the `milestoneEarned`/reward shapes (API_CONTRACT.md). Trade-off: if real delivery were ever built, a dedicated outbox/notifications table with a status field would be the right structure — out of scope now (PROJECT.md §8); DATA_MODEL.md is canonical for the `notification` attribute shape.

**ADR-10 — Zero-dep time-ordered `rewardId` (no `ulid` install).**
*Context:* the rewards `Query` uses `ScanIndexForward=false` to return newest-first (DATA_MODEL.md §7 pattern H), which needs a sort key that orders by creation time; the obvious choice is a `ulid` dependency. *Decision:* ship a **zero-dependency, lexicographically-sortable, time-ordered** id — a 15-digit zero-padded epoch-millis prefix + a short base-36 random suffix (`reward.service` `makeRewardId`), e.g. `001779912380053-vcppvl4y`. Epoch-millis is derived from the request's `now`/`completedAt` via `lib/utc.ts` so all time math stays in one place (Inv. 1). *Consequences:* the prefix sorts ascending by time exactly like a ULID's time component (15 digits covers epoch-millis to ~year 5138), so `ScanIndexForward=false` returns newest-first **directly** with no `createdAt` post-sort — the only property pattern H needs; the random suffix disambiguates same-millisecond awards. Keeps the backend dep budget intact (STND-5, already at its 5-install cap). *Trade-off:* not a standards-named ULID — but DATA_MODEL.md §4 explicitly allows a sortable-by-time fallback, so the ladder/Query semantics are unchanged. (Reconciles ASSUMPTIONS A-7.)

**ADR-11 — Canonical error contract is `{error,message}` with 400/401/403/404/409/500 — no 503.**
*Context:* ARCHITECTURE.md §7 originally mapped a DynamoDB/server failure to `503 {error:"unavailable"}`, but API_CONTRACT.md §3 defines the wire error catalogue as 400/401/403/404/409/500 with the canonical shape `{error:"<Label>", message}` and lists no 503. *Decision:* an **error-normalizing middleware** maps every failure to that §3 catalogue; an unhandled DB/server failure is **`500 InternalError`**, never 503. Unknown routes are `404 NotFound` (verified live: `{"error":"NotFound","message":"No route for GET /api/v1/..."}`). *Consequences:* API_CONTRACT.md (canonical for the wire surface, CLAUDE.md Inv. 7) and the shipped service agree exactly; clients get one stable error shape and one machine label per status; idempotent writes make `500` retries safe (§6 of the contract). *Trade-off:* 503-with-`Retry-After` is arguably more precise for transient DB unavailability — noted as a future refinement, but the simpler single-`500` contract is what ships. (Reconciles ASSUMPTIONS A-3.)
```

