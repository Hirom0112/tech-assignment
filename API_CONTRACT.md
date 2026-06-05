# API_CONTRACT.md — Hijack Poker Daily Streaks (Option C)

**Status:** Locked. The Unity-facing REST surface for the Daily Streaks engine.
**Grounding:** [`PROJECT.md`](PROJECT.md) (FR-5, FR-6, FR-3.3, NFR-3, NFR-7) and the official spec [`docs/challenge-streaks.md`](docs/challenge-streaks.md) — response shapes here match the spec's examples byte-for-byte where the spec gives one.
**Audience:** the Unity mobile client (primary), the React dashboard (secondary), and the game/hand processor (internal).
**Precedence:** constrained by `PROJECT.md`; constrains the backend route handlers and the shared TypeScript contract types.

> Every shape in this document is canonical, but the **player-id values in the examples
> are illustrative** (`p1-uuid-0001`, etc.). The stub accepts **any** non-empty
> `X-Player-Id` (§2.1); it does not validate the id against a fixed list. The **shipped
> seed** uses the convention **`streak-001`…`streak-010`** (`scripts/seed-streaks.js`,
> DATA_MODEL.md §11), and the live demo/dev player is **`streak-001`** — substitute it
> wherever an example shows `p1-uuid-0001`. (Reconciled per ASSUMPTIONS **A-2**.) All
> JSON bodies are real, not placeholders.

---

## 1. Conventions

| Concern | Value |
|---|---|
| **Base URL (local)** | `http://localhost:5001` (serverless-offline; `docker compose --profile streaks up`) |
| **API version prefix** | `/api/v1` for all player + admin endpoints |
| **Internal prefix** | `/internal` (unversioned; server-to-server, not a public contract) |
| **Content-Type (request)** | `application/json` on every body-bearing request (`POST`). `GET` requests take no body. |
| **Content-Type (response)** | `application/json; charset=utf-8` on every response, including errors — **except the share-card** (§4.9), which returns `image/svg+xml` (and optionally `image/png` — ASSUMPTION, see §4.9). Error responses are always `application/json`, even from the share-card endpoint. |
| **Player auth header** | `X-Player-Id: <guid>` (JWT stub — see §2) |
| **Internal auth header** | `X-Internal-Secret: <shared-secret>` (see §2) |
| **Admin auth header** | `X-Internal-Secret: <shared-secret>` (admin endpoints reuse the internal shared secret — see §2 / §4.7) |
| **Timestamps** | ISO-8601 in **UTC** with `Z` suffix, e.g. `2026-02-20T14:30:00Z`. Fields named `*At` / `*createdAt` / `updatedAt`. |
| **Calendar dates** | `YYYY-MM-DD` in **UTC**, e.g. `2026-02-20`. Fields named `*Date` and the calendar `date`. |
| **Calendar months** | `YYYY-MM` in **UTC**, e.g. `2026-02`. The `month` field + `?month=` query param. |
| **Date authority** | The server is the sole authority on "today". Clients never send "today"; UTC day math is derived server-side from `Date.now()` at the request edge (NFR-1). The device clock is never trusted. |
| **Error shape** | Canonical: `{ "error": string, "message": string }` (NFR-7). `error` is a short stable machine label; `message` is human-readable. No other top-level keys on errors. |
| **CORS** | `Access-Control-Allow-Origin: *`, allowed headers include `Content-Type, Authorization, X-Player-Id`; `OPTIONS` preflight returns `200`. |
| **Trailing slashes** | Not significant. `/api/v1/player/streaks` and `/api/v1/player/streaks/` are equivalent. |
| **Unknown body fields** | Ignored (forward-compatible). Unknown **query** params are ignored. |

---

## 2. Authentication

### 2.1 Player authentication (JWT stub) — `X-Player-Id`

Per **NFR-3**, real JWT verification is **stubbed** for this build. Every player-facing endpoint (`/api/v1/player/**`) requires:

```
X-Player-Id: p1-uuid-0001
```

The value is treated as the authenticated `playerId` and bound to `req.playerId`. There is no body- or query-supplied player id; a player can only ever act on their own record.

**Real implementation (documented, not built):** the client would send `Authorization: Bearer <jwt>`; the guard would verify the signature and extract the `sub` claim → `playerId`. The `X-Player-Id` header is the local-dev stand-in for that `sub`. The contract shape (everything downstream of "we have a `playerId`") is identical either way, so swapping the stub for real JWT verification is non-breaking. **ASSUMPTION:** for this build the stub accepts any non-empty `X-Player-Id` without verifying it exists until a per-endpoint check (see 404 in §3).

**Missing/empty header → `401`** (matches `src/middleware/auth.js`):

```json
{
  "error": "Unauthorized",
  "message": "X-Player-Id header is required"
}
```

### 2.2 Internal authentication — `X-Internal-Secret`

`POST /internal/streaks/hand-completed` (FR-6) is **server-to-server** and is deliberately **off the player-auth surface** (FR-6.3). It does **not** accept `X-Player-Id`; the `playerId` it acts on is supplied **in the body**. It is guarded by a shared secret:

```
X-Internal-Secret: <value of env INTERNAL_API_SECRET>
```

- Missing or non-matching secret → **`403`** (see §3). A missing secret is `403`, not `401`, because this surface is not part of the player-auth scheme.
- **ASSUMPTION:** the secret is provided via env var `INTERNAL_API_SECRET` (constant-time compared). Locally it defaults to `dev-internal-secret` from `.env.example`.

### 2.3 Admin authentication

`POST /api/v1/admin/streaks/freezes/grant` (FR-3.3) is operator-only. It reuses the **internal shared secret** (`X-Internal-Secret`) — admin actions are server/operator-initiated, never player-initiated, so they share the internal trust boundary rather than the player JWT scheme. Missing/invalid secret → **`403`**.

**ASSUMPTION:** reusing `X-Internal-Secret` for admin keeps the auth surface to two mechanisms (player JWT stub + shared secret). A production system would split admin into its own scoped role/JWT; that change would be additive (accept a new header) and non-breaking.

---

## 3. Error codes

All errors use the canonical shape `{ "error", "message" }` (NFR-7). `error` values are stable; do not parse `message`.

| HTTP | `error` | When | Example body |
|---|---|---|---|
| **400** | `BadRequest` | Malformed/missing required input: bad `month` format, missing required body field, wrong type, `count <= 0`. | `{ "error": "BadRequest", "message": "Query param 'month' must match YYYY-MM (e.g. 2026-02)" }` |
| **401** | `Unauthorized` | Missing/empty `X-Player-Id` on a player endpoint (real impl: missing/invalid JWT). | `{ "error": "Unauthorized", "message": "X-Player-Id header is required" }` |
| **403** | `Forbidden` | Missing/invalid `X-Internal-Secret` on an internal or admin endpoint. | `{ "error": "Forbidden", "message": "Invalid or missing X-Internal-Secret" }` |
| **404** | `NotFound` | Unknown route, **or** a referenced player has no streak record (e.g. admin grant to an unknown player). | `{ "error": "NotFound", "message": "No streak record for player p9-uuid-9999" }` |
| **409** | `Conflict` | Reserved for a state conflict (documented; see §4.7 admin grant note). Not emitted by the happy paths — idempotent writes return `200`, not `409`. | `{ "error": "Conflict", "message": "Freeze grant exceeds the maximum balance of 99" }` |
| **500** | `InternalError` | Unhandled server/database failure. The client should retry with backoff; writes are idempotent (§6), so retries are safe. | `{ "error": "InternalError", "message": "An unexpected error occurred" }` |

> **404 vs 401 ordering:** auth is checked first. A request to a player route with no `X-Player-Id` returns `401` even if the route would 404. A bad `X-Internal-Secret` returns `403` before any 404 body lookup.

---

## 4. Endpoints

Quick map (full reference in §8):

| # | Method | Path | Auth | FR |
|---|---|---|---|---|
| 4.1 | `GET`  | `/api/v1/player/streaks` | Player | FR-5.1 |
| 4.2 | `POST` | `/api/v1/player/streaks/check-in` | Player | FR-5.2 |
| 4.3 | `GET`  | `/api/v1/player/streaks/calendar?month=YYYY-MM` | Player | FR-5.3 |
| 4.4 | `GET`  | `/api/v1/player/streaks/rewards` | Player | FR-5.4 |
| 4.5 | `GET`  | `/api/v1/player/streaks/freezes` | Player | FR-5.5 |
| 4.6 | `POST` | `/internal/streaks/hand-completed` | Internal secret | FR-6 |
| 4.7 | `POST` | `/api/v1/admin/streaks/freezes/grant` | Internal secret (admin) | FR-3.3 |
| 4.8 | `GET`  | `/api/v1/admin/streaks/players/{playerId}/history` | Internal secret (admin) | FR-8 |
| 4.9 | `GET`  | `/api/v1/player/streaks/share-card` | Player | FR-9 |

> **Content-Type note.** Every endpoint returns `application/json` **except 4.9 `share-card`**, which returns `image/svg+xml` by default (and optionally `image/png` via `?format=png` — ASSUMPTION, see §4.9). All error responses are `application/json` on every endpoint (§1, §3).

> **Canonical vs alias paths.** The canonical Unity contract path is `/api/v1/player/streaks…`. The skeleton stub mounts `/api/v1/streaks…`; that prefix is kept as a **backward-compatible alias** that maps to the same handlers (see §7). New clients SHOULD use `/api/v1/player/streaks…`. Both the canonical and alias paths are mounted live (verified at `:5001`); the alias covers `GET /api/v1/streaks` and `POST /api/v1/streaks/check-in`.

> **Shipped vs deferred (build status).** §4.1–§4.7 and `/api/v1/health` are **mounted and live** (curl-verified at `:5001`). **§4.8 admin view-history (FR-8)** and **§4.9 share-card (FR-9)** are **specified here but not yet mounted** — they belong to the bonus phase (S8/S9, PROJECT.md §10). Until then, requesting those paths returns `404 NotFound` (the canonical error shape), consistent with their deferred status. Their contracts are locked so the bonus slices implement them without re-spec.

---

### 4.1 `GET /api/v1/player/streaks`

**Purpose (FR-5.1).** Return the player's current streak state: both streak counters, personal bests, freeze balance, and the next milestone for each streak. This is the primary read the Unity client and the dashboard poll on open.

**Auth.** Player (`X-Player-Id`).

**Params.** None (path/query/body all empty).

**Side effects.** None. This is a pure read; it does **not** advance streaks, consume freezes, or grant the monthly freeze. (Use `POST /check-in` to mutate.)

**Success — `200 OK`.** Shape matches `docs/challenge-streaks.md` exactly.

```json
{
  "loginStreak": 12,
  "playStreak": 5,
  "bestLoginStreak": 45,
  "bestPlayStreak": 22,
  "freezesAvailable": 2,
  "nextLoginMilestone": { "days": 14, "reward": 400, "daysRemaining": 2 },
  "nextPlayMilestone": { "days": 7, "reward": 300, "daysRemaining": 2 },
  "lastLoginDate": "2026-02-20",
  "lastPlayDate": "2026-02-19"
}
```

**Field reference.**

| Field | Type | Notes |
|---|---|---|
| `loginStreak` | integer ≥ 0 | Current consecutive login days (FR-1.1). Stored value; **not** display-clamped (UI clamps at 365 per FR-1.7). |
| `playStreak` | integer ≥ 0 | Current consecutive play days (FR-1.2). |
| `bestLoginStreak` | integer ≥ 0 | Personal best login streak (FR-1.6). |
| `bestPlayStreak` | integer ≥ 0 | Personal best play streak. |
| `freezesAvailable` | integer ≥ 0 | Current freeze balance (FR-3). |
| `nextLoginMilestone` | object \| `null` | Next unreached login milestone, or `null` if the streak is at/above 90 (the top rung). |
| `nextLoginMilestone.days` | integer | Milestone length (one of 3/7/14/30/60/90). |
| `nextLoginMilestone.reward` | integer | Login points awarded at that milestone (§5 ladder). |
| `nextLoginMilestone.daysRemaining` | integer ≥ 1 | `days - loginStreak`. |
| `nextPlayMilestone` | object \| `null` | Same shape, play side; `reward` is the **play** value. |
| `lastLoginDate` | `YYYY-MM-DD` \| `null` | Last UTC day the player checked in. `null` for a brand-new player. |
| `lastPlayDate` | `YYYY-MM-DD` \| `null` | Last UTC day the player completed a hand. `null` if never played. |

> **ASSUMPTION:** when a streak is ≥ 90 (no higher milestone), the corresponding `next…Milestone` is `null`. Clients should render "max milestone reached".

**Errors.** `401` (no auth), `404` (`NotFound` if the player has never been seen — **ASSUMPTION:** alternatively a fresh zero-state record may be returned with all-zero counters and `null` dates; the canonical behavior for this build is to **return zero-state `200`** for any authenticated player, so the dashboard never errors on a new user), `500`.

---

### 4.2 `POST /api/v1/player/streaks/check-in`

**Purpose (FR-5.2, NFR-2).** Record today's login for the authenticated player. Called when the player opens the app/site. Advances the login streak (or resets it / consumes a freeze on a missed day), lazily evaluates any pending freeze consumption (FR-3.7), grants the monthly free freeze if due (FR-3.1), and awards any milestone reward newly reached (FR-2.3).

**Auth.** Player (`X-Player-Id`).

**Request body.** None required. An empty body or `{}` is valid; `Content-Type: application/json` is recommended but not required when the body is empty. Any fields sent are ignored.

**Idempotency (once per UTC day).** Calling `check-in` multiple times on the same UTC calendar day performs **exactly one** check-in (NFR-2, SM-5). The first call mutates; subsequent same-day calls are **no-ops that return the current state**. **The response is always `200 OK`** — both the first call and same-day repeats. The boolean `checkedInToday` is `true` in both cases; `streakAdvanced` distinguishes them (see below). The client never needs to detect "already checked in" itself.

**Success — `200 OK`.**

First check-in of the day that advances the streak and crosses the 14-day login milestone:

```json
{
  "playerId": "p1-uuid-0001",
  "checkedInToday": true,
  "streakAdvanced": true,
  "freezeConsumed": false,
  "streaks": {
    "loginStreak": 14,
    "playStreak": 5,
    "bestLoginStreak": 45,
    "bestPlayStreak": 22,
    "freezesAvailable": 2,
    "nextLoginMilestone": { "days": 30, "reward": 1000, "daysRemaining": 16 },
    "nextPlayMilestone": { "days": 7, "reward": 300, "daysRemaining": 2 },
    "lastLoginDate": "2026-02-20",
    "lastPlayDate": "2026-02-19"
  },
  "milestoneEarned": {
    "rewardId": "01JG2K8Z3Q9X7M4P5R6T7V8W9A",
    "type": "login_milestone",
    "milestone": 14,
    "points": 400,
    "streakCount": 14,
    "createdAt": "2026-02-20T08:15:02Z",
    "notification": {
      "title": "14-day login streak!",
      "body": "You earned 400 bonus points for a 14-day login streak. 30 days unlocks 1000!",
      "deepLink": "hijackpoker://streaks",
      "milestone": 14,
      "type": "login_milestone"
    }
  }
}
```

A repeat call the same day (idempotent no-op), or a normal check-in that earns no milestone:

```json
{
  "playerId": "p1-uuid-0001",
  "checkedInToday": true,
  "streakAdvanced": false,
  "freezeConsumed": false,
  "streaks": {
    "loginStreak": 14,
    "playStreak": 5,
    "bestLoginStreak": 45,
    "bestPlayStreak": 22,
    "freezesAvailable": 2,
    "nextLoginMilestone": { "days": 30, "reward": 1000, "daysRemaining": 16 },
    "nextPlayMilestone": { "days": 7, "reward": 300, "daysRemaining": 2 },
    "lastLoginDate": "2026-02-20",
    "lastPlayDate": "2026-02-19"
  },
  "milestoneEarned": null
}
```

A check-in after a single missed day where a freeze was auto-consumed to protect the streak (FR-3.4/3.5):

```json
{
  "playerId": "p1-uuid-0001",
  "checkedInToday": true,
  "streakAdvanced": true,
  "freezeConsumed": true,
  "streaks": {
    "loginStreak": 15,
    "playStreak": 0,
    "bestLoginStreak": 45,
    "bestPlayStreak": 22,
    "freezesAvailable": 1,
    "nextLoginMilestone": { "days": 30, "reward": 1000, "daysRemaining": 15 },
    "nextPlayMilestone": { "days": 3, "reward": 100, "daysRemaining": 3 },
    "lastLoginDate": "2026-02-21",
    "lastPlayDate": "2026-02-19"
  },
  "milestoneEarned": null
}
```

**Field reference.**

| Field | Type | Notes |
|---|---|---|
| `playerId` | string | Echo of the authenticated player. |
| `checkedInToday` | boolean | Always `true` after a successful call (the player is checked in for today, whether by this call or an earlier same-day one). |
| `streakAdvanced` | boolean | `true` only when **this** call mutated state (first check-in of the day). `false` on idempotent same-day repeats. |
| `freezeConsumed` | boolean | `true` if a freeze was auto-consumed during this call to protect the streak across exactly one missed day (FR-3.4–3.6). |
| `streaks` | object | The full post-check-in streak state — **identical shape to `GET /api/v1/player/streaks` (§4.1)**. |
| `milestoneEarned` | object \| `null` | The reward record created if this check-in reached a login milestone (FR-2.3), else `null`. Same object shape as a `GET …/rewards` element (§4.4). On idempotent repeats this is always `null` (the reward was returned only on the call that earned it). |

> **Note on freezes & both streaks:** a freeze protects **both** login and play streaks for the missed day (FR-3.6). In the freeze example above, the play streak still shows `0` because the freeze protects against a *missed day*, but the player simply had not played recently; whether a play milestone fires depends on hands, recorded via §4.6, not check-in.

**Errors.** `401` (no auth), `500`. Never `409` — same-day repeats are `200` no-ops, not conflicts.

---

### 4.3 `GET /api/v1/player/streaks/calendar?month=YYYY-MM`

**Purpose (FR-5.3).** Return the per-day activity array for one UTC calendar month, for the 30-day heat map (FR-4.3). Backed by a single DynamoDB Query (`begins_with` on `YYYY-MM`), so it is cheap (NFR-8).

**Auth.** Player (`X-Player-Id`).

**Query params.**

| Param | Type | Required | Validation | Example |
|---|---|---|---|---|
| `month` | string | **Yes** | Must match `^\d{4}-\d{2}$` (UTC `YYYY-MM`), month 01–12. Invalid → `400`. | `2026-02` |

**ASSUMPTION:** if `month` is omitted, the server defaults to the **current UTC month** rather than erroring (convenience for the dashboard's initial load). A *malformed* `month` (e.g. `2026-2`, `2026-13`, `feb`) is always `400`.

**Success — `200 OK`.** Shape matches `docs/challenge-streaks.md` exactly. `days` is ordered ascending by `date` and contains **one entry per calendar day in the month** (days with no record are emitted as `activity: "none"` with zeroed counters); future days within the current month are also `none`.

```json
{
  "month": "2026-02",
  "days": [
    { "date": "2026-02-01", "activity": "played",     "loginStreak": 8, "playStreak": 3 },
    { "date": "2026-02-02", "activity": "login_only",  "loginStreak": 9, "playStreak": 0 },
    { "date": "2026-02-03", "activity": "freeze",      "loginStreak": 9, "playStreak": 0 },
    { "date": "2026-02-04", "activity": "none",        "loginStreak": 0, "playStreak": 0 },
    { "date": "2026-02-05", "activity": "broken",      "loginStreak": 0, "playStreak": 0 }
  ]
}
```

**Field reference.**

| Field | Type | Notes |
|---|---|---|
| `month` | `YYYY-MM` | Echo of the resolved month. |
| `days` | array | One element per calendar day, ascending by `date`. |
| `days[].date` | `YYYY-MM-DD` | UTC calendar day. |
| `days[].activity` | enum | One of `none` \| `login_only` \| `played` \| `freeze` \| `broken` (§5). Maps to heat-map colors gray/light-green/dark-green/blue/red. |
| `days[].loginStreak` | integer ≥ 0 | Login streak count **as of that day** (`loginStreakAtDay`). |
| `days[].playStreak` | integer ≥ 0 | Play streak count as of that day. |

**Errors.** `400` (malformed `month`), `401` (no auth), `500`.

---

### 4.4 `GET /api/v1/player/streaks/rewards`

**Purpose (FR-5.4).** Return the player's earned streak rewards (milestone history) for the reward-history UI (FR-4.7).

**Auth.** Player (`X-Player-Id`).

**Params.** None required.

**ASSUMPTION (pagination):** the full list is returned (small per player). The array is ordered **newest-first** by `createdAt`. A `?limit=` query param MAY be added later (additive, non-breaking).

**Success — `200 OK`.** A JSON array (top-level array, not wrapped).

```json
[
  {
    "rewardId": "01JG2K8Z3Q9X7M4P5R6T7V8W9A",
    "type": "login_milestone",
    "milestone": 14,
    "points": 400,
    "streakCount": 14,
    "createdAt": "2026-02-20T08:15:02Z",
    "notification": {
      "title": "14-day login streak!",
      "body": "You earned 400 bonus points for a 14-day login streak. 30 days unlocks 1000!",
      "deepLink": "hijackpoker://streaks",
      "milestone": 14,
      "type": "login_milestone"
    }
  },
  {
    "rewardId": "01JFZ9D4H2N6B8C0E1F3G5J7K9",
    "type": "play_milestone",
    "milestone": 7,
    "points": 300,
    "streakCount": 7,
    "createdAt": "2026-02-13T19:42:11Z",
    "notification": {
      "title": "7-day play streak!",
      "body": "You earned 300 bonus points for a 7-day play streak. 14 days unlocks 800!",
      "deepLink": "hijackpoker://streaks",
      "milestone": 7,
      "type": "play_milestone"
    }
  },
  {
    "rewardId": "01JFXP1A0M3N5Q7R9S2T4V6W8X",
    "type": "login_milestone",
    "milestone": 7,
    "points": 150,
    "streakCount": 7,
    "createdAt": "2026-02-13T08:03:55Z",
    "notification": {
      "title": "7-day login streak!",
      "body": "You earned 150 bonus points for a 7-day login streak. 14 days unlocks 400!",
      "deepLink": "hijackpoker://streaks",
      "milestone": 7,
      "type": "login_milestone"
    }
  }
]
```

**Field reference.**

| Field | Type | Notes |
|---|---|---|
| `rewardId` | string (ULID/UUID) | Stable unique id of the reward record. |
| `type` | enum | `login_milestone` \| `play_milestone`. |
| `milestone` | integer | Milestone day length: 3/7/14/30/60/90. |
| `points` | integer | Bonus points awarded; matches the §5 ladder for `type` + `milestone`. |
| `streakCount` | integer | Actual streak length when earned (equals `milestone` at award time). |
| `createdAt` | ISO-8601 UTC | When the reward was awarded. |
| `notification` | object | **FR-7 push-notification content payload** — the message that *would* be pushed when this reward was earned (**content only; no delivery** — PROJECT.md §8). Stored on the reward record as the `notification` Map (DATA_MODEL.md §4–5). Present on every reward object. See sub-fields below. |
| `notification.title` | string | Short headline, e.g. `"14-day login streak!"`. |
| `notification.body` | string | Milestone-aware body copy with loss-aversion-light framing (FR-7.3), distinct for login vs play, e.g. `"You earned 400 bonus points for a 14-day login streak. 30 days unlocks 1000!"`. |
| `notification.deepLink` | string | App deep-link the notification opens to. **ASSUMPTION:** the scheme/path `hijackpoker://streaks` is invented for this build; a real client would supply its own. |
| `notification.milestone` | integer | The milestone day length (mirrors the reward's `milestone`): 3/7/14/30/60/90. |
| `notification.type` | enum | `login_milestone` \| `play_milestone` (mirrors the reward's `type`). |

> **Notification field name & shape.** The wrapping field is `notification` to match the `notification` Map stored on the reward item in `streaks-rewards` (DATA_MODEL.md §4–5, appendix). The Unity-facing payload carries `{ title, body, deepLink, milestone, type }` (FR-7.1). **ASSUMPTION:** DATA_MODEL.md's stored Map also persists `points` + `createdAt` (already present on the parent reward object); those are storage conveniences and are **not** re-surfaced inside `notification` on the wire to avoid duplicating the reward's own `points`/`createdAt`. `deepLink` (FR-7.1) **is present in the stored Map** (DATA_MODEL.md §4 example + §5) and on the wire — `hijackpoker://streaks` is confirmed live in the seeded rewards.

> A `streak_bonus` point-transaction record is written alongside each reward (FR-2.5) but is **not** part of this response — it is an internal ledger record, not a Unity-facing resource.

**Errors.** `401` (no auth), `500`. (Empty history → `200` with `[]`.)

---

### 4.5 `GET /api/v1/player/streaks/freezes`

**Purpose (FR-5.5).** Return the player's freeze balance and consumption history for the freeze-status UI (FR-4.6).

**Auth.** Player (`X-Player-Id`).

**Params.** None required.

**Success — `200 OK`.**

```json
{
  "freezesAvailable": 2,
  "freezesUsedThisMonth": 1,
  "lastFreezeGrantDate": "2026-02",
  "history": [
    { "date": "2026-02-18", "source": "free_monthly" },
    { "date": "2026-01-27", "source": "purchased" }
  ]
}
```

**Field reference.**

| Field | Type | Notes |
|---|---|---|
| `freezesAvailable` | integer ≥ 0 | Current freeze balance (same value as `streaks.freezesAvailable`). |
| `freezesUsedThisMonth` | integer ≥ 0 | Freezes consumed in the current UTC month. |
| `lastFreezeGrantDate` | `YYYY-MM` \| `null` | UTC month the free monthly freeze was last granted (FR-3.1). `null` if never granted. |
| `history` | array | Freeze **consumption** events, newest-first by `date`. |
| `history[].date` | `YYYY-MM-DD` | UTC day a freeze was consumed. |
| `history[].source` | enum | `free_monthly` \| `purchased` — which kind of freeze was consumed. |

> **ASSUMPTION:** `history` lists freeze **consumptions** (matching the `streaks-freeze-history` table, whose SK `date` is "when freeze was consumed"). Grants are reflected in `freezesAvailable` / `lastFreezeGrantDate`, not in `history`.

**Errors.** `401` (no auth), `500`.

---

### 4.6 `POST /internal/streaks/hand-completed`

**Purpose (FR-6).** Server-to-server notification from the hand processor that a player completed a hand. Advances that player's **play** streak for the hand's UTC day (FR-1.2, FR-6.1). Not called by the Unity client (FR-6.3).

**Auth.** Internal shared secret (`X-Internal-Secret`). **No** `X-Player-Id` — the target player is in the body.

**Request body.** Shape matches `docs/challenge-streaks.md`.

```json
{
  "playerId": "p1-uuid-0001",
  "tableId": 456,
  "handId": "hand-789",
  "completedAt": "2026-02-20T14:30:00Z"
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `playerId` | string | **Yes** | Non-empty player GUID. The play streak is updated for this player. |
| `tableId` | integer | **Yes** | The table the hand was played at. Recorded for traceability/logs. |
| `handId` | string | **Yes** | Unique hand id. Used for log correlation. |
| `completedAt` | ISO-8601 UTC | **Yes** | When the hand resolved. The **UTC calendar day of `completedAt`** is the day credited (FR-1.4) — not the time of receipt. |

Missing/empty any required field, or non-ISO `completedAt` → `400`.

**Idempotency (once per UTC day).** The **first** hand a player completes on a given UTC day advances the play streak and marks that day `played`; **all later hands that same UTC day are no-ops** (FR-6.2, NFR-2). Enforced by a conditional write (`attribute_not_exists`) keyed on `(playerId, date)`. Safe to redeliver/retry — duplicate `handId` or duplicate same-day events never double-increment (SM-5).

**Success — `200 OK`.**

First hand of the day (play streak advanced, crossed the 3-day play milestone):

```json
{
  "playerId": "p1-uuid-0001",
  "date": "2026-02-20",
  "playStreakUpdated": true,
  "playStreak": 3,
  "milestoneEarned": {
    "rewardId": "01JG2M4R7P0X2K4N6Q8S0U2W4Y",
    "type": "play_milestone",
    "milestone": 3,
    "points": 100,
    "streakCount": 3,
    "createdAt": "2026-02-20T14:30:01Z",
    "notification": {
      "title": "3-day play streak!",
      "body": "You earned 100 bonus points for a 3-day play streak. 7 days unlocks 300!",
      "deepLink": "hijackpoker://streaks",
      "milestone": 3,
      "type": "play_milestone"
    }
  }
}
```

A later hand the same day (idempotent no-op):

```json
{
  "playerId": "p1-uuid-0001",
  "date": "2026-02-20",
  "playStreakUpdated": false,
  "playStreak": 3,
  "milestoneEarned": null
}
```

**Field reference.**

| Field | Type | Notes |
|---|---|---|
| `playerId` | string | Echo of the input. |
| `date` | `YYYY-MM-DD` | The UTC day credited (derived from `completedAt`). |
| `playStreakUpdated` | boolean | `true` only for the first hand of the day; `false` for idempotent repeats. |
| `playStreak` | integer ≥ 0 | The play streak after processing. |
| `milestoneEarned` | object \| `null` | Play-milestone reward record if this hand reached one (else `null`). Same shape as a `GET …/rewards` element. |

**Errors.** `400` (missing/invalid body field), `403` (bad/missing `X-Internal-Secret`), `500`. (A `playerId` with no prior record is created on first hand — a new player's first-ever hand starts the play streak at `1`; this is **not** a `404`.)

---

### 4.7 `POST /api/v1/admin/streaks/freezes/grant`

**Purpose (FR-3.3).** Operator endpoint to grant freeze(s) to a player (e.g. purchased-balance top-up; payment processing is out of scope). Increases `freezesAvailable`.

**Auth.** Admin via internal shared secret (`X-Internal-Secret`, §2.3). **No** `X-Player-Id`.

**Request body.**

```json
{
  "playerId": "p1-uuid-0001",
  "count": 3
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `playerId` | string | **Yes** | Non-empty player GUID to grant to. |
| `count` | integer | **Yes** | `>= 1`. Number of freezes to add. `<= 0`, non-integer, or missing → `400`. |

**ASSUMPTION:** granted freezes are tracked as `source: "purchased"` for accounting (the monthly free grant is the only `free_monthly` source). **ASSUMPTION:** a soft cap of `99` on `freezesAvailable`; a grant that would exceed it returns `409 Conflict` (the only documented use of `409`).

**Idempotency.** **Not idempotent** — each successful call adds `count`. The caller must not blindly retry on an ambiguous result; retry only after confirming the previous call did not apply (e.g. via `GET …/freezes`). **ASSUMPTION:** an optional `Idempotency-Key` header MAY be honored later to make grants safe to retry; not implemented in this build.

**Success — `200 OK`.**

```json
{
  "playerId": "p1-uuid-0001",
  "granted": 3,
  "freezesAvailable": 5,
  "source": "purchased",
  "updatedAt": "2026-02-20T09:00:00Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `playerId` | string | Echo. |
| `granted` | integer | The `count` applied by this call. |
| `freezesAvailable` | integer | New balance after the grant. |
| `source` | enum | `purchased` (admin grants). |
| `updatedAt` | ISO-8601 UTC | When the balance was updated. |

**Errors.** `400` (bad `count`/missing field), `403` (bad/missing secret), `404` (`NotFound` — unknown `playerId` with no record; **ASSUMPTION:** alternatively the record is created — this build returns `404` to avoid granting to typo'd ids), `409` (would exceed the `99` cap), `500`.

---

### 4.8 `GET /api/v1/admin/streaks/players/{playerId}/history`

**Purpose (FR-8).** Operator/support endpoint that returns a player's **full** streak picture in one composite payload — current aggregate state, the per-day activity rows, the earned rewards, and freeze balance + consumption history — for support and debugging (FR-8.1). It is a read-only superset of what the individual player endpoints (§4.1, §4.3, §4.4, §4.5) expose, collapsed into a single admin call so an operator does not have to stitch four requests together.

**Auth.** Admin via the internal shared secret (`X-Internal-Secret`, §2.3) — **not** player auth (FR-8.2). **No** `X-Player-Id`; the target player is the path param. Missing/invalid secret → **`403`** (checked before any body lookup, §3). Reuses `INTERNAL_API_SECRET` — no new secret is introduced.

**Path params.**

| Param | Type | Required | Validation | Example |
|---|---|---|---|---|
| `playerId` | string | **Yes** | Non-empty player GUID. Unknown player (no `streaks-players` record) → `404`. | `p1-uuid-0001` |

**Query params.** None required. **ASSUMPTION:** an optional `?month=YYYY-MM` MAY later scope the `activity` array to one month (additive, non-breaking); for this build the endpoint returns the recent activity window (the last 60 days, matching the seed horizon — DATA_MODEL.md §11).

**Side effects.** None. Pure read; it does **not** advance streaks, grant, or consume freezes.

**Success — `200 OK`.** A composite object: `player` (the §4.1 nine-field streaks object), `activity` (per-day rows), `rewards` (full reward objects, newest-first — §4.4 shape, including `notification`), and `freezes` (balance summary + consumption history — the §4.5 shape).

```json
{
  "player": {
    "loginStreak": 12,
    "playStreak": 5,
    "bestLoginStreak": 45,
    "bestPlayStreak": 22,
    "freezesAvailable": 2,
    "nextLoginMilestone": { "days": 14, "reward": 400, "daysRemaining": 2 },
    "nextPlayMilestone": { "days": 7, "reward": 300, "daysRemaining": 2 },
    "lastLoginDate": "2026-02-20",
    "lastPlayDate": "2026-02-19"
  },
  "activity": [
    { "date": "2026-02-18", "activity": "played",     "loginStreak": 10, "playStreak": 4 },
    { "date": "2026-02-19", "activity": "login_only", "loginStreak": 11, "playStreak": 0 },
    { "date": "2026-02-20", "activity": "played",     "loginStreak": 12, "playStreak": 5 }
  ],
  "rewards": [
    {
      "rewardId": "01JG2K8Z3Q9X7M4P5R6T7V8W9A",
      "type": "login_milestone",
      "milestone": 14,
      "points": 400,
      "streakCount": 14,
      "createdAt": "2026-02-20T08:15:02Z",
      "notification": {
        "title": "14-day login streak!",
        "body": "You earned 400 bonus points for a 14-day login streak. 30 days unlocks 1000!",
        "deepLink": "hijackpoker://streaks",
        "milestone": 14,
        "type": "login_milestone"
      }
    },
    {
      "rewardId": "01JFZ9D4H2N6B8C0E1F3G5J7K9",
      "type": "play_milestone",
      "milestone": 7,
      "points": 300,
      "streakCount": 7,
      "createdAt": "2026-02-13T19:42:11Z",
      "notification": {
        "title": "7-day play streak!",
        "body": "You earned 300 bonus points for a 7-day play streak. 14 days unlocks 800!",
        "deepLink": "hijackpoker://streaks",
        "milestone": 7,
        "type": "play_milestone"
      }
    }
  ],
  "freezes": {
    "freezesAvailable": 2,
    "freezesUsedThisMonth": 1,
    "lastFreezeGrantDate": "2026-02",
    "history": [
      { "date": "2026-02-18", "source": "free_monthly" },
      { "date": "2026-01-27", "source": "purchased" }
    ]
  }
}
```

**Field reference.**

| Field | Type | Notes |
|---|---|---|
| `player` | object | The full current aggregate — **identical shape to `GET /api/v1/player/streaks` (§4.1)** (the nine-field streaks object). |
| `activity` | array | Per-day activity rows — **same element shape as `GET …/calendar` `days[]` (§4.3)**: `{ date, activity, loginStreak, playStreak }`. Ordered ascending by `date`. **ASSUMPTION:** the recent 60-day window (DATA_MODEL.md §11 seed horizon) unless `?month=` is later added. |
| `rewards` | array | Full reward objects (**§4.4 shape, incl. `notification`**), newest-first by `createdAt`. Empty → `[]`. |
| `freezes` | object | Freeze summary + consumption history — **identical shape to `GET …/freezes` (§4.5)**: `{ freezesAvailable, freezesUsedThisMonth, lastFreezeGrantDate, history }`. |

> **No new fields.** This endpoint composes existing shapes (§4.1/§4.3/§4.4/§4.5) so it stays in lock-step with them — a change to any sub-shape flows through here automatically. It exposes the same `streak_bonus` ledger caveat: that record is **not** surfaced (§5.4).

**Errors.** `403` (bad/missing `X-Internal-Secret` — checked first), `404` (`NotFound` — no `streaks-players` record for `playerId`), `500`.

---

### 4.9 `GET /api/v1/player/streaks/share-card`

**Purpose (FR-9).** Generate a shareable, on-brand **streak card image** summarizing the player's current streaks and personal best (FR-9.1). Surfaced from the dashboard's "Share" affordance (FR-9.2). **Generation only** — social posting is out of scope (PROJECT.md §8). The card can be opened directly in a browser tab or embedded as an `<img src>`.

**Auth.** Player (`X-Player-Id`). The card is always the authenticated player's own card; there is no body- or query-supplied player id (same model as every `/api/v1/player/**` endpoint, §2.1).

**Query params.**

| Param | Type | Required | Validation | Example |
|---|---|---|---|---|
| `format` | enum | No | `svg` (default) or `png`. Any other value → `400`. **ASSUMPTION (optional/PNG):** the PNG path is only present if a server-side SVG→PNG rasterizer is built; if it is not, `?format=png` is treated as unknown and ignored (SVG returned), or returns `400` if PNG was promised. Mark PNG as a stretch — SVG is the guaranteed format. | `png` |

**Side effects.** None. Pure read; renders from the current aggregate (§4.1 fields). It does **not** advance streaks or consume freezes.

**Success — `200 OK`.** **Content-Type `image/svg+xml; charset=utf-8`** (not JSON). The body is a single self-contained SVG document (no external asset refs, so it renders standalone) on Hijack's dark/orange brand (CLAUDE.md §8: orange accent on near-black). It is **not** pasted in full here (a card SVG is large); the shape and the data fields it encodes are:

```
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" role="img"
     aria-label="Hijack Poker streak card">
  <!-- near-black background (#0D1117), single orange accent (#FF9800 / brand #F5923E) -->
  <text ...>HIJACK POKER</text>                 <!-- brand wordmark -->
  <text ...>🔥 12</text>                          <!-- loginStreak  (current login streak) -->
  <text ...>Login streak</text>
  <text ...>🃏 5</text>                           <!-- playStreak   (current play streak) -->
  <text ...>Play streak</text>
  <text ...>Personal best: 45</text>             <!-- bestLoginStreak -->
  <text ...>Daily Streaks · Hot Streak</text>    <!-- promo tie-in (CLAUDE.md §8) -->
</svg>
```

**Encoded data fields** (sourced from the §4.1 aggregate — the card is a pure projection of these):

| Encoded field | Source | Notes |
|---|---|---|
| `loginStreak` | §4.1 `loginStreak` | Current login streak, with the flame motif (FR-4.1). Display-clamped at 365 (FR-1.7). |
| `playStreak` | §4.1 `playStreak` | Current play streak, with the cards motif (FR-4.2). Clamped at 365. |
| `bestLoginStreak` | §4.1 `bestLoginStreak` | Rendered as "Personal best" (FR-4.5). **ASSUMPTION:** the card shows the login best (the headline streak); `bestPlayStreak` MAY also be rendered. |
| brand | static | Hijack wordmark + dark/orange palette + "Hot Streak" promo tie-in (CLAUDE.md §8). Not from the API. |

> **ASSUMPTION (PNG, optional):** if the PNG path is built, `GET …/share-card?format=png` returns the same card rasterized with **Content-Type `image/png`**. PNG is a stretch goal; **SVG is the guaranteed, default format**. If PNG is not built, the endpoint serves SVG regardless of `format`.

**Degrade behavior (never `500`).** The card is a sharing nicety, not a data source, so generation **degrades gracefully** rather than erroring: if any optional aggregate field is missing (e.g. a brand-new player with zero-state counters), the card renders a **minimal fallback** — brand wordmark, `0` streaks, no personal best — at `200`, **never** a `500`. A truly unknown player (no record at all and the build chose strict mode) returns `404` (see Errors); a rasterization failure on the PNG path falls back to serving the SVG, not a `500`.

**Errors.** `401` (no/empty `X-Player-Id` — `application/json` error body, §2.1), `404` (`NotFound` — no player record, if the build does not zero-state new players for the card; **ASSUMPTION:** consistent with §4.1, this build prefers to return a zero-state fallback card at `200` rather than `404`, so the dashboard "Share" never breaks for a new user), `400` (invalid `format` value, only if PNG was promised). Error bodies are always `application/json` `{ error, message }` even though success is an image.

---

## 5. Data dictionary

### 5.1 `activity` enum (calendar day status — §4.3)

| Value | Meaning | Heat-map color (FR-4.3) |
|---|---|---|
| `none` | No login and no hand played this day (or a future day). | gray |
| `login_only` | Player logged in (checked in) but completed no hand. | light green |
| `played` | Player completed ≥ 1 hand (implies logged in or counted active). | dark green |
| `freeze` | A freeze was consumed to protect the streak across this missed day. | blue |
| `broken` | A streak broke this day (missed day, no freeze available). | red |

> Precedence when multiple could apply on one day (canonical, DATA_MODEL.md §3): `played` > `freeze` > `broken` > `login_only` > `none`.

### 5.2 Milestone ladder (FR-2.1)

Mirrors `src/config/constants.js` (`MILESTONES`).

| Milestone (days) | `login_milestone` points | `play_milestone` points |
|---|---|---|
| 3  | 50    | 100   |
| 7  | 150   | 300   |
| 14 | 400   | 800   |
| 30 | 1000  | 2000  |
| 60 | 2500  | 5000  |
| 90 | 5000  | 10000 |

- A reward is earned **once per milestone per streak instance** (FR-2.2): reach 7 → reset → reach 7 again earns the 7-day reward a second time (a new `rewardId`).
- Above 90 there is no further milestone; `next…Milestone` is `null` (§4.1).

### 5.3 Streak display cap

- Stored `loginStreak` / `playStreak` may exceed 365; the **UI display clamps at 365** (FR-1.7). The API returns the **true stored value** — clamping is a presentation concern, not done server-side.

### 5.4 `streak_bonus` transaction (FR-2.5)

- Each awarded reward also writes a point-transaction record with `type = "streak_bonus"` (record-only; no live rewards-system integration). This ledger record is **internal** and intentionally **not exposed** on any Unity-facing endpoint. The Unity-facing view of "what was earned" is `GET …/rewards` (§4.4).

### 5.5 Common nested objects

- **Milestone object** (`next…Milestone`): `{ "days": int, "reward": int, "daysRemaining": int }` — `reward` is the login or play value depending on which field it sits in.
- **Reward object** (in `…/rewards`, `milestoneEarned`, and the admin history `rewards[]` §4.8): `{ rewardId, type, milestone, points, streakCount, createdAt, notification }`.
- **Notification object** (FR-7, the `notification` field on every reward object): `{ title, body, deepLink, milestone, type }` — push-notification content payload, content only (no delivery, PROJECT.md §8). Stored as the `notification` Map on the reward item (DATA_MODEL.md §4–5).
- **Streaks object** (in `GET …/streaks` and `check-in.streaks`): the 9-field object in §4.1.

---

## 6. Idempotency & retries

Two write paths are **once-per-UTC-day idempotent** (NFR-2), backed by DynamoDB conditional writes (`attribute_not_exists`) on the `(playerId, date)` activity key:

| Endpoint | Guarantee | Unity client expectation on retry |
|---|---|---|
| `POST /api/v1/player/streaks/check-in` | At most one check-in per player per UTC day. | **Safe to retry.** First call: `streakAdvanced: true`. Repeats same day: `200` with `streakAdvanced: false`, `milestoneEarned: null`, current state. No `409`. |
| `POST /internal/streaks/hand-completed` | First hand of the UTC day (per `completedAt`) advances; later hands are no-ops. | **Safe to redeliver.** Repeats: `200` with `playStreakUpdated: false`. Duplicate `handId` never double-counts. |

**Client retry guidance.**
- On `500` or a network timeout for either write, **retry with exponential backoff**. Because the writes are idempotent, a retry that lands after the original succeeded simply returns the no-op `200` — no double increment, no duplicate reward.
- A milestone reward is returned **only on the call that earned it** (the mutating call). If you time out *after* the server committed but *before* you received the body, the retry's `milestoneEarned` will be `null`; recover the reward from `GET …/rewards` rather than the retry response.
- `POST /api/v1/admin/streaks/freezes/grant` is **not** idempotent (§4.7) — do not blind-retry; verify via `GET …/freezes` first.

---

## 7. Versioning & compatibility

- **Version prefix.** All player/admin endpoints live under `/api/v1`. A breaking change ships under a new prefix (`/api/v2`) with `/api/v1` kept until clients migrate.
- **Canonical vs alias path.** Canonical: `/api/v1/player/streaks…` (the spec/Unity contract). The skeleton stub mounts `/api/v1/streaks…`; that prefix is kept as a **backward-compatible alias** routed to the same handlers, so existing stub tests and any early integrations keep working (per `PROJECT.md` ADR). The alias covers `GET /api/v1/streaks` and `POST /api/v1/streaks/check-in`. **New clients SHOULD use the `/player/` paths.** The alias may be removed in `/api/v2`.
- **Non-breaking (allowed within v1):** adding new endpoints; adding new **optional** response fields; adding new `activity` / `source` enum values (clients MUST tolerate unknown enum values — treat unknown `activity` as `none`); adding optional query params; swapping the JWT stub for real JWT verification (request shape unchanged from the client's view if it already sends a bearer token).
- **Breaking (requires v2):** removing/renaming a field, changing a field type, changing an endpoint's path semantics, making an optional field required.
- **Enum stability.** `activity`, `type`, and `source` values listed in §5 are stable; clients should switch on them defensively with a default branch.

---

## 8. Quick reference & curl examples

### 8.1 All endpoints

| Method | Path | Auth | Body | Success | Idempotent |
|---|---|---|---|---|---|
| `GET`  | `/api/v1/player/streaks` | `X-Player-Id` | — | `200` | n/a (read) |
| `POST` | `/api/v1/player/streaks/check-in` | `X-Player-Id` | none | `200` | Yes (per UTC day) |
| `GET`  | `/api/v1/player/streaks/calendar?month=YYYY-MM` | `X-Player-Id` | — | `200` | n/a (read) |
| `GET`  | `/api/v1/player/streaks/rewards` | `X-Player-Id` | — | `200` | n/a (read) |
| `GET`  | `/api/v1/player/streaks/freezes` | `X-Player-Id` | — | `200` | n/a (read) |
| `POST` | `/internal/streaks/hand-completed` | `X-Internal-Secret` | `{ playerId, tableId, handId, completedAt }` | `200` | Yes (per UTC day) |
| `POST` | `/api/v1/admin/streaks/freezes/grant` | `X-Internal-Secret` | `{ playerId, count }` | `200` | **No** |
| `GET`  | `/api/v1/admin/streaks/players/{playerId}/history` | `X-Internal-Secret` | — | `200` (JSON) | n/a (read) |
| `GET`  | `/api/v1/player/streaks/share-card` | `X-Player-Id` | — | `200` (`image/svg+xml`; `image/png` optional) | n/a (read) |
| `GET`  | `/api/v1/streaks` *(alias)* | `X-Player-Id` | — | `200` | n/a (read) |
| `POST` | `/api/v1/streaks/check-in` *(alias)* | `X-Player-Id` | none | `200` | Yes |
| `GET`  | `/api/v1/health` | none | — | `200` | n/a |

### 8.2 curl (local; mirrors `docs/local-development.md`)

```bash
# Base URL for the streaks profile
BASE=http://localhost:5001
PID='p1-uuid-0001'
SECRET='dev-internal-secret'

# Health (public)
curl $BASE/api/v1/health

# Current streak state (FR-5.1)
curl $BASE/api/v1/player/streaks \
  -H "X-Player-Id: $PID"

# Daily check-in — idempotent (FR-5.2). Run twice: second is a no-op 200.
curl -X POST $BASE/api/v1/player/streaks/check-in \
  -H 'Content-Type: application/json' \
  -H "X-Player-Id: $PID"

# Calendar heat-map data for a month (FR-5.3)
curl "$BASE/api/v1/player/streaks/calendar?month=2026-02" \
  -H "X-Player-Id: $PID"

# Reward history (FR-5.4)
curl $BASE/api/v1/player/streaks/rewards \
  -H "X-Player-Id: $PID"

# Freeze balance + history (FR-5.5)
curl $BASE/api/v1/player/streaks/freezes \
  -H "X-Player-Id: $PID"

# Internal: hand completed (FR-6) — shared secret, NOT X-Player-Id
curl -X POST $BASE/internal/streaks/hand-completed \
  -H 'Content-Type: application/json' \
  -H "X-Internal-Secret: $SECRET" \
  -d '{"playerId":"p1-uuid-0001","tableId":456,"handId":"hand-789","completedAt":"2026-02-20T14:30:00Z"}'

# Admin: grant freezes (FR-3.3) — shared secret
curl -X POST $BASE/api/v1/admin/streaks/freezes/grant \
  -H 'Content-Type: application/json' \
  -H "X-Internal-Secret: $SECRET" \
  -d '{"playerId":"p1-uuid-0001","count":3}'

# Admin: full player history (FR-8) — shared secret, playerId in the path, NOT X-Player-Id
curl "$BASE/api/v1/admin/streaks/players/$PID/history" \
  -H "X-Internal-Secret: $SECRET"

# Share-card (FR-9) — player auth; returns image/svg+xml (open in a browser)
curl "$BASE/api/v1/player/streaks/share-card" \
  -H "X-Player-Id: $PID"
# In a browser you can pass the id via the dashboard; the SVG renders inline:
#   open "$BASE/api/v1/player/streaks/share-card"   (with the dashboard supplying X-Player-Id)
# Optional PNG (ASSUMPTION — only if the rasterizer path is built):
curl "$BASE/api/v1/player/streaks/share-card?format=png" \
  -H "X-Player-Id: $PID" --output streak-card.png

# Auth failure example → 401
curl -i $BASE/api/v1/player/streaks      # → 401 {"error":"Unauthorized",...}

# Backward-compat alias (still works)
curl $BASE/api/v1/streaks -H "X-Player-Id: $PID"
```
