# DATA_MODEL.md — Hijack Poker Daily Streaks (Option C)

**Status:** Canonical data-model baseline. Constrained by [`PROJECT.md`](PROJECT.md) (FR-1..FR-6, NFR-2/8) and grounded in [`RESEARCH.md`](RESEARCH.md) (Q3 idempotency/UTC, Q4 DynamoDB modeling).
**Precedence:** PROJECT.md > ARCHITECTURE.md (ADR-1 multi-table) > this doc > API_CONTRACT.md / types. Attribute names defined here are the source of truth for API_CONTRACT.md and the TypeScript domain types.
**Store:** DynamoDB (AWS SDK v3 `DynamoDBDocumentClient`), 4 tables, accessed via `streaks-api/src/services/dynamo.service.js` (repository layer).

> **Hard constraints (do not change):**
> - The 4 table names and key schemas are **fixed** by `docker-compose.yml` dynamodb-init (lines ~111–149). Keys below match it byte-for-byte.
> - All date sort keys / date fields are **UTC `YYYY-MM-DD`** (FR-1.4, NFR-1). Month grant fields are UTC `YYYY-MM`.
> - The DocumentClient is created with `marshallOptions.removeUndefinedValues: true` (RESEARCH.md Q4 — SDK v3 no longer drops `undefined`; optional attributes like `username` must not blow up a write). Already set in `dynamo.service.js`'s shared config and in `seed-streaks.js`.
> - Multi-table atomic writes use `TransactWriteCommand` (RESEARCH.md Q4).

---

## 1. Overview

Daily Streaks uses **four separate DynamoDB tables**, not a single-table design:

| Table | PK | SK | Holds |
|---|---|---|---|
| `streaks-players` | `playerId` (S) | — | One aggregate record per player (the two streak counters, bests, freeze balance, last-activity dates). |
| `streaks-activity` | `playerId` (S) | `date` (S, `YYYY-MM-DD`) | One row per player per UTC day; the heat-map source + per-day idempotency key. |
| `streaks-rewards` | `playerId` (S) | `rewardId` (S, sortable time-ordered — §4) | One row per milestone reward earned (also carries the `streak_bonus` txn + notification payload — see §4, §5). |
| `streaks-freeze-history` | `playerId` (S) | `date` (S, `YYYY-MM-DD`) | One row per freeze consumed (the day it protected). |

**Why multi-table (ADR-1).** These four entity types are **never co-retrieved heterogeneously** — every read targets exactly one entity type by `playerId` (and a date/id range). Single-table design's marquee payoff is fetching mixed item types in one Query (RESEARCH.md Q4, citing DeBrie); we never do that, so it buys us nothing and costs junior readability. AWS explicitly sanctions skipping single-table "if multi-table design is easier for you to reason about" (RESEARCH.md Q4). Write atomicity across tables is preserved with `TransactWriteCommand`. This is the *defensible, documented* choice, recorded as **ADR-1** in ARCHITECTURE.md.

---

## 2. Table: `streaks-players`

- **PK:** `playerId` (String). No sort key. One item per player.
- **Purpose:** the live aggregate the dashboard and `GET /player/streaks` (FR-5.1) render directly.

| Attribute | Type | Description |
|---|---|---|
| `playerId` | S | **PK.** Player GUID. |
| `username` | S | Display name. **Optional** — relies on `removeUndefinedValues:true` if absent. |
| `loginStreak` | N | Current consecutive UTC login days (FR-1.1). |
| `playStreak` | N | Current consecutive UTC play days (FR-1.2). Independent of `loginStreak` (FR-1.3). |
| `bestLoginStreak` | N | Personal-best login streak ever (FR-1.6). |
| `bestPlayStreak` | N | Personal-best play streak ever (FR-1.6). |
| `lastLoginDate` | S | `YYYY-MM-DD` UTC of last login check-in. Drives the "is prior active day exactly yesterday?" conditional increment (§7, §8). |
| `lastPlayDate` | S | `YYYY-MM-DD` UTC of last hand played. |
| `freezesAvailable` | N | Current freeze balance (free monthly + admin-granted) (FR-3.1/3.2). |
| `freezesUsedThisMonth` | N | Freezes consumed in the current calendar month (reset when a new monthly grant lands). |
| `lastFreezeGrantDate` | S | `YYYY-MM` of the last free monthly grant. Compared as a string so the grant fires "on the 1st," not every 30 days (FR-3.1, RESEARCH.md Q3 edge case). |
| `createdAt` | S | ISO-8601 timestamp of first record creation. |
| `updatedAt` | S | ISO-8601 timestamp of last mutation. |

**Reconciliation with the legacy seed shape.** The current `seed-streaks.js` and `dynamo.service.js` write a **single-streak legacy shape**: `currentStreak`, `longestStreak`, `totalCheckIns`, `lastCheckIn`, plus `checkedIn` on activity rows. The spec (and FR-1.1–1.3) require the **login/play split**. Migration: legacy fields are **dropped** in favor of the table above:

| Legacy field | Replaced by |
|---|---|
| `currentStreak` | `loginStreak` (and `playStreak` becomes a new independent counter) |
| `longestStreak` | `bestLoginStreak` (and new `bestPlayStreak`) |
| `totalCheckIns` | (removed — derivable from `streaks-activity` if ever needed; not a hot-path attribute) |
| `lastCheckIn` | `lastLoginDate` (and new `lastPlayDate`) |
| activity `checkedIn` | `loggedIn` (and new `played`, `freezeUsed`, `streakBroken`, `loginStreakAtDay`, `playStreakAtDay`) |

`seed-streaks.js` is rewritten to emit the new shape (see §11). There is no in-place data migration step — local data is regenerated from the seed; the legacy shape never ships.

**Example item:**
```json
{
  "playerId": "streak-001",
  "username": "DailyGrinder",
  "loginStreak": 12,
  "playStreak": 5,
  "bestLoginStreak": 45,
  "bestPlayStreak": 22,
  "lastLoginDate": "2026-06-05",
  "lastPlayDate": "2026-06-04",
  "freezesAvailable": 2,
  "freezesUsedThisMonth": 0,
  "lastFreezeGrantDate": "2026-06",
  "createdAt": "2026-04-06T00:00:00.000Z",
  "updatedAt": "2026-06-05T09:14:02.117Z"
}
```

---

## 3. Table: `streaks-activity`

- **PK:** `playerId` (String). **SK:** `date` (String, `YYYY-MM-DD` UTC).
- **Purpose:** one immutable-ish row per player per UTC day. It is **both** the heat-map data source (FR-4.3, FR-5.3) **and** the once-per-day idempotency key (NFR-2, RESEARCH.md Q3: "the UTC date string *is* the idempotency key").

| Attribute | Type | Description |
|---|---|---|
| `playerId` | S | **PK.** |
| `date` | S | **SK.** `YYYY-MM-DD` UTC. |
| `loggedIn` | BOOL | Player checked in this day (FR-1.1). |
| `played` | BOOL | Player completed ≥1 hand this day (FR-1.2). |
| `freezeUsed` | BOOL | A freeze protected this day (FR-3.4/3.5). |
| `streakBroken` | BOOL | A streak reset was recorded on/for this day (FR-1.5). |
| `loginStreakAtDay` | N | Login streak count as of this day (the count the heat map / calendar reports). |
| `playStreakAtDay` | N | Play streak count as of this day. |
| `timestamp` | S | ISO-8601 of the write that created/last-touched the row. |

> **ASSUMPTION:** A single day's row can be touched twice — login (check-in) then a later hand (`hand-completed`) the same day. The first write creates the row (with `attribute_not_exists(#date)`, §7); the second is an **idempotent merge** that flips `played=true` without re-creating the row. So the row is "create-once, narrowly-updatable," not strictly write-once.

**Deriving the calendar `activity` enum.** The API/`calendar.service` collapses the booleans into one `activity` value per day (FR-4.3 / FR-5.3 shape: `none | login_only | played | freeze | broken`). Priority is evaluated **top-to-bottom; first match wins**:

1. `played === true` → **`played`** (dark green). Playing implies logging in; "played" outranks "login_only".
2. `freezeUsed === true` → **`freeze`** (blue). A protected day with no real activity still shows as a save, not a break.
3. `streakBroken === true` → **`broken`** (red).
4. `loggedIn === true` → **`login_only`** (light green).
5. otherwise → **`none`** (gray). Includes days with **no row at all** — the calendar synthesizes a `none` day for any date in the requested window that has no `streaks-activity` item.

> **ASSUMPTION (ordering rationale):** `played` is checked before `freeze`/`broken` because real activity always wins; `freeze` before `broken` because if a freeze was consumed, the streak by definition did *not* break that day (FR-3.4). These two can never both be true for the same day in correct data, but the priority makes the derivation total and order-independent of write history.

**Example items:**
```json
{ "playerId": "streak-001", "date": "2026-06-01", "loggedIn": true, "played": true,  "freezeUsed": false, "streakBroken": false, "loginStreakAtDay": 8, "playStreakAtDay": 3, "timestamp": "2026-06-01T12:01:00.000Z" }
{ "playerId": "streak-001", "date": "2026-06-02", "loggedIn": true, "played": false, "freezeUsed": false, "streakBroken": false, "loginStreakAtDay": 9, "playStreakAtDay": 0, "timestamp": "2026-06-02T08:30:00.000Z" }
{ "playerId": "streak-001", "date": "2026-06-03", "loggedIn": false,"played": false, "freezeUsed": true,  "streakBroken": false, "loginStreakAtDay": 9, "playStreakAtDay": 0, "timestamp": "2026-06-04T01:00:00.000Z" }
```

---

## 4. Table: `streaks-rewards`

- **PK:** `playerId` (String). **SK:** `rewardId` (String).
- **`rewardId` = sortable time-ordered id (ULID **or** the zero-dep epoch-millis-prefix scheme shipped here).** As shipped (**reconciled per ASSUMPTIONS A-7**), `rewardId` is a zero-dependency, lexicographically-sortable string built by `makeRewardId`: a 15-digit zero-padded epoch-millis prefix + a short base-36 suffix, e.g. `001779912380053-vcppvl4y`. Like a ULID's time component it is **lexicographically sortable by creation time**, so a `Query` on PK returns rewards in chronological order for free (newest-first with `ScanIndexForward=false`) — no `createdAt`-sort post-processing, consistent with the ISO-time-series ordering principle in RESEARCH.md Q4. ULID is the recommended alternative; the zero-dep scheme was chosen to keep the dep budget intact (STND-5) while preserving the same ordering property. UUIDv4 would be an acceptable fallback but loses the free ordering.

| Attribute | Type | Description |
|---|---|---|
| `playerId` | S | **PK.** |
| `rewardId` | S | **SK.** Sortable time-ordered id — zero-dep epoch-millis prefix as shipped (A-7), or ULID. |
| `type` | S | `login_milestone` \| `play_milestone` (FR-2). |
| `milestone` | N | Days threshold crossed: one of 3, 7, 14, 30, 60, 90 (FR-2.1). |
| `points` | N | Bonus points awarded (the `loginReward`/`playReward` from §9). |
| `streakCount` | N | Actual streak length when earned (equals `milestone` at award time; kept explicit per spec). |
| `createdAt` | S | ISO-8601 timestamp earned. |
| `pointTxnType` | S | **Always `"streak_bonus"`** — see decision below (FR-2.5). |
| `notification` | M | Notification payload — see §5 (FR-2.4). |

**Where the `streak_bonus` point transaction lives (FR-2.5) — decision.** FR-2.5 says bonus points are recorded as a **point transaction** with `type = "streak_bonus"` (record-only; no live rewards-system integration per §8 out-of-scope). **Decision: it is the *same* `streaks-rewards` record, not a separate table/row.** The reward row already carries `points`, `milestone`, `type`, and `createdAt` — every field a `streak_bonus` transaction needs. We add a single discriminator attribute `pointTxnType: "streak_bonus"` so the record *is* the point transaction.

- **Justification:** one milestone award = one points grant; they are 1:1 and always written together. A second table or row would split an atomic fact across items for no read benefit (we never query "transactions" separately from "rewards" in this build). FR-2.5 explicitly scopes this to "just write the transaction record" — and we do, on the reward item.
- **ASSUMPTION:** `pointTxnType` is constant for now (only `streak_bonus` exists). It is modeled as its own attribute (not hardcoded into `type`, which already means login-vs-play) so a future rewards-system integration can add other transaction kinds without overloading `type`.

**Example item:**
```json
{
  "playerId": "streak-001",
  "rewardId": "01J9ZX8K3M7Q2B5N4P6R8T0V2W",
  "type": "play_milestone",
  "milestone": 7,
  "points": 300,
  "streakCount": 7,
  "createdAt": "2026-06-05T12:01:00.000Z",
  "pointTxnType": "streak_bonus",
  "notification": {
    "title": "🔥 7-day play streak!",
    "body": "You earned 300 bonus points for a 7-day play streak. 14 days unlocks 800!",
    "deepLink": "hijackpoker://streaks",
    "milestone": 7,
    "type": "play_milestone",
    "points": 300,
    "createdAt": "2026-06-05T12:01:00.000Z"
  }
}
```

---

## 5. Notifications (FR-2.4)

FR-2.4 requires a **notification record** when a reward is earned. The spec defines **no notifications table** (only the 4 fixed tables exist), and push-notification *delivery* is explicitly out of scope (PROJECT.md §8 — "store the payload only").

**Decision: the notification payload is stored as the `notification` attribute (a Map) on the reward item in `streaks-rewards`** (shown in §4). No separate notifications table is created.

- **Justification:** a notification is born 1:1 with a reward, in the same transaction, and is never queried independently of its reward in this build. Co-locating it on the reward item (a) keeps the write atomic with the reward (one `Put` inside the same `TransactWriteCommand`, §8), (b) avoids inventing a 5th table the docker-compose init doesn't create, and (c) satisfies "store the payload only" literally. The payload contains `{ title, body, deepLink, milestone, type, points, createdAt }` (the `deepLink` + the milestone-aware body satisfy FR-7) — enough for a future delivery worker to send it verbatim.
- **ASSUMPTION:** if a real notifications service is later added, it reads these payloads (a Scan/Query over `streaks-rewards`, or a stream trigger) rather than us pre-creating a table now. Documented as out-of-scope-but-payload-stored.

---

## 6. Table: `streaks-freeze-history`

- **PK:** `playerId` (String). **SK:** `date` (String, `YYYY-MM-DD` UTC — the day the freeze protected/was consumed).
- **Purpose:** the "freeze last-used dates" list on the dashboard (FR-4.6) and `GET /player/streaks/freezes` history (FR-5.5).

| Attribute | Type | Description |
|---|---|---|
| `playerId` | S | **PK.** |
| `date` | S | **SK.** `YYYY-MM-DD` UTC the freeze was consumed for. |
| `source` | S | `free_monthly` \| `purchased` — which balance the consumed freeze came from (FR-3.1/3.2). |
| `createdAt` | S | ISO-8601 when the consumption was recorded. *(ASSUMPTION: handy for audit; not in the spec's minimal column set.)* |

> Using the protected `date` as the SK makes freeze consumption **idempotent per day** (a day can be protected at most once) and keeps history chronologically sorted by Query, mirroring `streaks-activity`.

**Example item:**
```json
{ "playerId": "streak-001", "date": "2026-06-03", "source": "free_monthly", "createdAt": "2026-06-04T01:00:00.000Z" }
```

---

## 7. Access patterns

Every app operation maps to exactly one (or one transactional set of) DynamoDB op(s). **No Scans on hot paths** (NFR-8); the only Scan is the optional admin/leaderboard `getAllPlayers`.

| # | Operation | FR | DynamoDB op | Key / condition |
|---|---|---|---|---|
| A | Get player state | FR-5.1 | `GetCommand` | `Key: { playerId }` on `streaks-players`. |
| B | Create player (first check-in) | FR-1 (new player) | `PutCommand` | `streaks-players`, `ConditionExpression: attribute_not_exists(playerId)` — only creates if absent. |
| C | Advance login streak (idempotent single increment) | FR-1.1, NFR-2 | `UpdateCommand` | `streaks-players`, see ConditionExpression below. |
| D | Write daily activity (once-per-day) | FR-1, FR-6.2, NFR-2 | `PutCommand` | `streaks-activity`, `ConditionExpression: attribute_not_exists(#date)` (`#date` aliases reserved word `date`). |
| E | Merge `played` into today's row | FR-6.1/6.2 | `UpdateCommand` | `streaks-activity` `Key:{playerId,date}`, conditional create-or-merge: `SET #played = :true` (+ `if_not_exists(...)` preserving login fields) guarded by `ConditionExpression: attribute_not_exists(#date) OR #played <> :true` (**reconciled per ASSUMPTIONS A-6** — the merge is conditional, not an unconditional `SET`; this is what makes `playStreakUpdated` correctly report first-of-day, the once-per-UTC-day idempotency source of truth, consistent with §8). |
| F | Calendar by month (heat map) | FR-5.3, NFR-8 | `QueryCommand` | `streaks-activity`, `playerId = :p AND begins_with(#date, :ym)`, `:ym = "2026-06"`. **One Query.** |
| G | Last-30-days window | FR-4.3 | `QueryCommand` | `streaks-activity`, `playerId = :p AND #date BETWEEN :start AND :end`. **One Query.** |
| H | List rewards history | FR-5.4 | `QueryCommand` | `streaks-rewards`, `playerId = :p`, `ScanIndexForward=false` (newest first — the time-ordered `rewardId` SK sorts by creation time, §4). |
| I | List freeze history | FR-5.5 | `QueryCommand` | `streaks-freeze-history`, `playerId = :p`, `ScanIndexForward=false`. |
| J | Admin grant freeze | FR-3.3 | `UpdateCommand` | `streaks-players`, `ADD freezesAvailable :n` (atomic add is fine here — admin grant is not retry-sensitive per calendar day). |
| K | Check-in crossing a milestone | FR-2.3, §8 | `TransactWriteCommand` | player Update + activity Put + reward Put together — see §8. |
| L | (Admin/leaderboard, off hot path) | — | `ScanCommand` | `streaks-players` — only non-Query read; not on the player request path. |

**(C) Idempotent login increment — ConditionExpression.** Per RESEARCH.md Q3 ("conditional UpdateItem on the player record, condition `lastLoginDate = :yesterday`"), the increment fires **once and only when** the prior active day was exactly yesterday — a retried request finds `lastLoginDate` already == today and the condition fails (treated as a no-op success):
```
UpdateExpression:    SET loginStreak = loginStreak + :one,
                         lastLoginDate = :today,
                         bestLoginStreak = if_not_exists(...)  // max handled in service,
                         updatedAt = :now
ConditionExpression: lastLoginDate = :yesterday
ExpressionAttributeValues: { ":one": 1, ":today": "2026-06-05",
                             ":yesterday": "2026-06-04", ":now": <iso> }
```
(New player: condition omitted / handled by the create path B with `loginStreak = 1`. Reset/freeze paths set `loginStreak = :resetValue` rather than incrementing.) Cite RESEARCH.md **Q3** (conditional write) and **Q4** (no bare atomic counter for the streak count).

**(D) Once-per-day activity write — ConditionExpression.** `date` is a DynamoDB reserved word, so it is aliased:
```
PutCommand on streaks-activity:
  Item:               { playerId, date, loggedIn:true, played:false, ... }
  ConditionExpression: attribute_not_exists(#d)
  ExpressionAttributeNames: { "#d": "date" }
```
A duplicate same-day check-in fails the condition → caught and treated as the idempotent no-op (return current state). Same primitive guards `hand-completed`. Cite RESEARCH.md **Q3/Q4** (`attribute_not_exists` + `begins_with` month query are the two load-bearing patterns).

---

## 8. Idempotency & atomicity

**Idempotency (NFR-2, RESEARCH.md Q3):**
1. **Once-per-UTC-day:** the activity row's `attribute_not_exists(#date)` condition (pattern D) makes both `check-in` (FR-5.2) and `hand-completed` (FR-6.2) idempotent per UTC calendar day with zero extra infra. The UTC date string *is* the idempotency key.
2. **Safe single increment:** the player counter advances via a **conditional UpdateItem** (`lastLoginDate = :yesterday`, pattern C), never a bare `ADD`. RESEARCH.md Q3/Q4: atomic counters are **not** idempotent (a retried `ADD` double-counts); the condition guarantees the streak advances exactly once.
3. The UTC "today/yesterday" pair is computed **once at the request edge** (NFR-1) and passed down — never recomputed per call site.

**Atomicity — `TransactWriteCommand` (RESEARCH.md Q4):** A check-in (or hand-completed) that **crosses a milestone** must write four facts that cannot partially fail:
- **Update** `streaks-players` (advance streak, bump best, update `updatedAt`),
- **Put** the `streaks-activity` row (with `attribute_not_exists(#date)`),
- **Put** the `streaks-rewards` row (which carries `points`, `pointTxnType:"streak_bonus"` §4, and the `notification` map §5),

all inside one `TransactWriteCommand`. This prevents an **awarded-but-unrecorded reward** (or a recorded reward with no notification): either every item commits or none do. Freeze consumption that coincides with a check-in similarly groups the player Update + activity Put + `streaks-freeze-history` Put in one transaction. Non-milestone check-ins (the common case) use plain conditional writes (patterns C+D), not a transaction, to stay cheap.

---

## 9. Milestone reference

Matches `serverless-v2/services/streaks-api/src/config/constants.js` (`MILESTONES`) and FR-2.1 / the spec table. A reward is earned **once per milestone per streak instance** (FR-2.2): reach 7, reset, reach 7 again → earned again.

| Milestone (days) | `loginReward` (login_milestone points) | `playReward` (play_milestone points) |
|---|---|---|
| 3 | 50 | 100 |
| 7 | 150 | 300 |
| 14 | 400 | 800 |
| 30 | 1,000 | 2,000 |
| 60 | 2,500 | 5,000 |
| 90 | 5,000 | 10,000 |

`getMilestone(n)` returns the exact-match milestone (award fires only when the streak count *equals* a threshold, so each is hit once per instance). `getAchievedMilestones(n)` returns all `days <= n` (for progress/UI). `points` on a reward row = `loginReward` or `playReward` for its `type`.

---

## 10. TTL & retention

RESEARCH.md Q4: AWS's time-series guidance recommends a per-item **TTL** attribute to age out old rows. **For this challenge we retain all `streaks-activity` and `streaks-freeze-history` rows** — the heat map and freeze history need historical reads, and 60–90 days × a handful of players is trivially small. No TTL attribute is set.

**Where a TTL would go in prod (documented, not implemented):** add an `expiresAt` (Number, epoch seconds) attribute to `streaks-activity` (e.g. now + 400 days) and enable DynamoDB TTL on that attribute. `streaks-players` is the live aggregate and would **never** get a TTL. `streaks-rewards` is a financial-ish audit trail and would also be retained (or archived to S3) rather than TTL'd. The calendar/heat-map only ever reads a bounded recent window, so a 400-day TTL on activity would not affect any in-scope access pattern.

---

## 11. Seed data plan (`scripts/seed-streaks.js` extension)

The current seed produces the **legacy single-streak shape** (§2). It must be **extended** to the new model so the dashboard renders the full feature against `docker compose --profile streaks up` + seed (NFR-5). Specification of the data to generate (not the code):

**Scale:** keep the existing **10 players** (`streak-001..010`, with their `consistency` weights) and **60 days** of history ending today (UTC).

**Per player, per day — generate two independent signals:**
- `loggedIn` ~ Bernoulli(`consistency`) — the login activity.
- `played` ~ Bernoulli(`consistency * playFactor`) where `playFactor ≈ 0.6` — play is rarer than login, and **only ever true on a day where `loggedIn` is true OR independently true** to produce realistic play-without-login-record cases. This yields the FR-1.3 independence (e.g. a long login streak with a shorter play streak).
- Compute `loginStreakAtDay` and `playStreakAtDay` by walking days forward, resetting each on a gap.

**Freeze usage + freeze-history rows:**
- Give each player a starting `freezesAvailable` (e.g. 1–2) and a realistic monthly grant: set `lastFreezeGrantDate` to the current `YYYY-MM`.
- For **some** single-day gaps (probabilistically, when `freezesAvailable > 0`), instead of breaking the streak, mark that day's activity row `freezeUsed=true` (and `streakBroken=false`), decrement `freezesAvailable`, bump `freezesUsedThisMonth`, and **write a `streaks-freeze-history` row** `{ playerId, date, source: "free_monthly" | "purchased", createdAt }` for that protected day. Carry the streak across it.
- For multi-day gaps (or single gaps with no freeze), mark the **break day** `streakBroken=true` and reset the running counters to 0 (FR-3 edge case: a freeze covers only one missed day).

**Reward rows when milestones are crossed:**
- While walking days, whenever `loginStreakAtDay` or `playStreakAtDay` **equals** a milestone (3/7/14/30/60/90, §9), write a `streaks-rewards` row: `{ playerId, rewardId: <sortable time-ordered id, §4>, type: "login_milestone"|"play_milestone", milestone, points: <from §9>, streakCount: <count>, createdAt: <that day's iso>, pointTxnType: "streak_bonus", notification: { title, body, deepLink, milestone, type, points, createdAt } }`.
- Re-award after a reset reaches the same milestone again (FR-2.2).

**Player aggregate fields (write last, derived from the walk):**
- `loginStreak` / `playStreak` = the streak counts as of **today** (day 0).
- `bestLoginStreak` / `bestPlayStreak` = max streak observed during the walk.
- `lastLoginDate` = most recent day with `loggedIn`; `lastPlayDate` = most recent day with `played`.
- `freezesAvailable`, `freezesUsedThisMonth`, `lastFreezeGrantDate` = final values from the walk.
- `createdAt` = ~60 days ago; `updatedAt` = now. Keep `username`.
- **Drop** the legacy `currentStreak` / `longestStreak` / `totalCheckIns` / `lastCheckIn` and the activity-row `checkedIn` field.

**Idempotency note:** the seed uses plain `PutCommand` (overwrite) and is safe to re-run; it does not use the `attribute_not_exists` conditions (those guard the live API, not the seeder).

---

## Appendix — canonical attribute lists (for API_CONTRACT.md & TS types)

**`streaks-players`:** `playerId`, `username`, `loginStreak`, `playStreak`, `bestLoginStreak`, `bestPlayStreak`, `lastLoginDate`, `lastPlayDate`, `freezesAvailable`, `freezesUsedThisMonth`, `lastFreezeGrantDate`, `createdAt`, `updatedAt`.

**`streaks-activity`:** `playerId`, `date`, `loggedIn`, `played`, `freezeUsed`, `streakBroken`, `loginStreakAtDay`, `playStreakAtDay`, `timestamp`.

**`streaks-rewards`:** `playerId`, `rewardId`, `type`, `milestone`, `points`, `streakCount`, `createdAt`, `pointTxnType`, `notification`.

**`streaks-freeze-history`:** `playerId`, `date`, `source`, `createdAt`.
