# Option A: Rewards Program

## Overview

Build a loyalty rewards system where players earn points from gameplay, progress through tiers, and view their status on a dashboard. The system has three surfaces: a NestJS backend API, a React web dashboard, and REST endpoints consumed by a Unity mobile client.

This challenge is **backend-heavy** — the core complexity is in the points engine, tier progression logic, and data modeling. The frontend is a dashboard that visualizes player rewards data.

---

## Functional Requirements

### FR-1: Tier System

Players progress through four tiers based on points earned within a rolling calendar month:

| Tier | Name | Monthly Points Threshold | Multiplier |
|------|------|-------------------------|------------|
| 1 | Bronze | 0 | 1.0x |
| 2 | Silver | 500 | 1.25x |
| 3 | Gold | 2,000 | 1.5x |
| 4 | Platinum | 10,000 | 2.0x |

**Rules:**
- Players start at Bronze
- Tier upgrades happen immediately when threshold is reached
- Tiers reset on the 1st of each month at 00:00 UTC
- A player's highest tier in the previous month determines their "floor" — they cannot drop more than one tier at reset (e.g., a Platinum player resets to at least Gold)
- Tier changes trigger a notification to the player

### FR-2: Points Engine

Players earn points from cash game play. Points are awarded per hand played, scaled by table stakes:

| Table Stakes (BB) | Base Points Per Hand |
|-------------------|---------------------|
| $0.10 – $0.25 | 1 |
| $0.50 – $1.00 | 2 |
| $2.00 – $5.00 | 5 |
| $10.00+ | 10 |

**Rules:**
- Points are awarded only for hands where the player was dealt cards (not sitting out)
- The player's current tier multiplier is applied: `earned = base × multiplier`
- Points are tracked per calendar month (for tier progression) and lifetime (for display)
- Points transactions are immutable — store a ledger, not a running balance

### FR-3: Leaderboard

A monthly leaderboard showing top point earners:

- Top 100 players by monthly points
- Each entry shows: rank, display name, tier, monthly points
- Leaderboard refreshes on read (no caching requirement, but bonus if you add it)
- Players can see their own rank even if outside top 100

### FR-4: Player Dashboard (Web)

A React web dashboard for authenticated players:

- **Summary card**: Current tier, tier badge, monthly points, points to next tier, progress bar
- **Points history**: Table showing recent point transactions (date, table, stakes, base points, multiplier, earned points)
- **Tier timeline**: Visual showing tier progression across previous months (last 6 months)
- **Leaderboard widget**: Top 10 + player's own rank

### FR-5: Notifications

When certain events occur, create a notification record:

- Tier upgrade ("Congratulations! You've reached Gold tier")
- Tier downgrade on monthly reset ("Your tier has been adjusted to Silver")
- Milestone achievements (500 points, 1000 points, etc. — define 3-5 milestones)

Notifications are stored and retrievable via API. The web dashboard shows a notification bell with unread count. Actual push delivery (email, mobile push) is **out of scope** — just store the notification and expose it via API.

### FR-6: Admin Endpoints

Backend-only endpoints (no UI required) for back-office operations:

- `GET /admin/players/:playerId/rewards` — Full rewards profile for a player
- `POST /admin/points/adjust` — Manually credit/debit points (with reason)
- `GET /admin/leaderboard` — Same as player leaderboard but with additional fields (player ID, email)
- `POST /admin/tier/override` — Manually set a player's tier (with expiry)

---

## Technical Requirements

### Backend (NestJS)

- **Runtime**: Node.js 22, NestJS framework
- **Language**: TypeScript (strict mode)
- **Database**: DynamoDB (via AWS SDK v3)
- **Validation**: `class-validator` + `class-transformer` for DTOs
- **Auth**: JWT-based authentication guard (stub the token verification — don't build a full auth system)
- **Testing**: Jest, with unit tests on services and integration tests on controllers

### Frontend (React)

- **Framework**: React 18+ with TypeScript
- **State Management**: Redux Toolkit (RTK Query for API calls preferred)
- **Styling**: Your choice — MUI, Tailwind, styled-components, whatever you're productive with
- **Testing**: React Testing Library for key components

### REST API for Unity Client

In addition to the web dashboard's BFF (Backend-for-Frontend) endpoints, expose a set of REST endpoints designed for consumption by a Unity mobile client:

- `GET /api/v1/player/rewards` — Current tier, points, progress
- `GET /api/v1/player/rewards/history?limit=20&offset=0` — Points transaction history
- `GET /api/v1/leaderboard?limit=10` — Leaderboard
- `GET /api/v1/player/notifications?unread=true` — Player notifications
- `PATCH /api/v1/player/notifications/:id/dismiss` — Dismiss a notification

These endpoints must be documented with request/response schemas. The Unity client will integrate these via HTTP — keep payloads lean and consistent.

---

## Suggested Architecture

This section describes one reasonable approach. You may deviate.

### Module Structure (NestJS)

```
src/
├── modules/
│   ├── auth/               # JWT guard, token validation stub
│   ├── points/             # Points engine, calculation rules
│   │   ├── points.service.ts
│   │   ├── points.controller.ts
│   │   └── points.module.ts
│   ├── tiers/              # Tier progression, monthly reset
│   │   ├── tiers.service.ts
│   │   ├── tiers.controller.ts
│   │   └── tiers.module.ts
│   ├── leaderboard/        # Leaderboard queries
│   ├── notifications/      # Notification CRUD
│   ├── dashboard/          # BFF endpoints for web dashboard
│   └── admin/              # Admin endpoints
├── shared/
│   ├── dynamo/             # DynamoDB client, table helpers
│   ├── dtos/               # Shared DTOs
│   └── interfaces/         # Shared TypeScript interfaces
└── config/                 # Environment config, constants
```

### Data Model (DynamoDB)

**Players Table** — `rewards-players`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `playerId` | String | PK | Player GUID |
| `currentTier` | Number | — | 1-4 |
| `monthlyPoints` | Number | — | Current month's point total |
| `lifetimePoints` | Number | — | All-time point total |
| `tierFloor` | Number | — | Minimum tier from previous month's protection |
| `lastTierChangeAt` | String | — | ISO timestamp |
| `createdAt` | String | — | ISO timestamp |
| `updatedAt` | String | — | ISO timestamp |

**Points Ledger Table** — `rewards-transactions`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `playerId` | String | PK | Player GUID |
| `timestamp` | Number | SK | Epoch milliseconds (ensures sort order) |
| `type` | String | — | `gameplay`, `adjustment`, `bonus` |
| `basePoints` | Number | — | Pre-multiplier points |
| `multiplier` | Number | — | Tier multiplier at time of earn |
| `earnedPoints` | Number | — | `basePoints × multiplier` |
| `tableId` | Number | — | Game table ID (nullable for adjustments) |
| `tableStakes` | String | — | e.g., "2/5" |
| `monthKey` | String | GSI-PK | `YYYY-MM` for monthly queries |
| `createdAt` | String | GSI-SK | ISO timestamp |
| `reason` | String | — | For manual adjustments |

**Leaderboard Table** — `rewards-leaderboard`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `monthKey` | String | PK | `YYYY-MM` |
| `playerId` | String | SK | Player GUID |
| `displayName` | String | — | Player display name |
| `tier` | Number | — | Current tier |
| `monthlyPoints` | Number | — | Sortable (consider GSI) |

**Notifications Table** — `rewards-notifications`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `playerId` | String | PK | Player GUID |
| `notificationId` | String | SK | ULID or UUID |
| `type` | String | — | `tier_upgrade`, `tier_downgrade`, `milestone` |
| `title` | String | — | Display title |
| `description` | String | — | Display body |
| `dismissed` | Boolean | — | Has player dismissed it |
| `createdAt` | String | — | ISO timestamp |

### Points Ingestion

In production, points would be awarded by the game processor after each hand. For this challenge, provide:

1. **A REST endpoint** `POST /api/v1/points/award` that the game processor would call:
   ```json
   {
     "playerId": "abc-123",
     "tableId": 456,
     "tableStakes": "2/5",
     "bigBlind": 5.00,
     "handId": "hand-789"
   }
   ```
   This endpoint calculates base points from stakes, applies the multiplier, writes the ledger entry, updates monthly/lifetime totals, and checks for tier advancement.

2. **A seed script** that generates sample point transactions for testing the dashboard and leaderboard.

---

## Acceptance Criteria

### Must Have (core — these determine pass/fail)

- [ ] Points awarded correctly based on table stakes and tier multiplier
- [ ] Tier progression works — player upgrades when threshold is reached
- [ ] Points ledger is immutable (append-only)
- [ ] Leaderboard returns top players sorted by monthly points
- [ ] Dashboard displays current tier, points, progress to next tier
- [ ] Dashboard displays points transaction history
- [ ] Notification created on tier change
- [ ] REST endpoints for Unity client return correct data shapes
- [ ] Admin can view a player's rewards profile
- [ ] Admin can manually adjust points
- [ ] Unit tests cover points calculation and tier progression logic
- [ ] Docker Compose starts all dependencies, `npm test` passes

### Should Have (expected for strong submissions)

- [ ] Points history pagination works correctly
- [ ] Leaderboard shows player's own rank
- [ ] Notification dismiss works, unread count is correct
- [ ] Monthly tier reset logic is implemented (even if triggered manually, not via cron)
- [ ] Dashboard has a tier timeline showing last 6 months
- [ ] Integration tests on at least the points award flow
- [ ] API response shapes are documented (OpenAPI, TypeDoc, or a markdown spec)

### Could Have (bonus, do only if time permits)

- [ ] Leaderboard caching (Redis or DynamoDB TTL)
- [ ] Real-time tier upgrade notification via WebSocket or SSE
- [ ] Rate limiting on points award endpoint
- [ ] Idempotency on points award (dedup by `handId`)
- [ ] GitHub Actions CI pipeline
- [ ] Monthly reset as a scheduled Lambda

---

## Out of Scope

- User registration / authentication system (stub the JWT guard)
- Email or push notification delivery
- Integration with the actual game engine or processor
- Unity client implementation
- Payment or real-money transactions
- Backoffice UI for admin endpoints
- Production deployment or infrastructure provisioning

---

## Getting Started

1. Review the skeleton repo's `serverless-v2/services/rewards-api/` and `serverless-v2/services/rewards-frontend/` directories
2. Set up DynamoDB Local via Docker Compose
3. Start with the points engine — it's the core of everything else
4. Build the tier logic on top of points
5. Add the dashboard once the API is working
6. Don't forget tests as you go — retrofitting them is painful

Good luck.
