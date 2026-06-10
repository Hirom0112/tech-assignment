# Option C: Daily Streaks

## Overview

Build a daily engagement system that tracks player login and play activity, maintains streak counters, awards streak-based rewards, and displays everything in a React UI. The system also exposes REST endpoints for a Unity mobile client to consume.

This challenge is **full-stack** — roughly equal weight between the backend tracking service, the frontend UI components, and the API contract that ties them together. The frontend is the most visible deliverable.

---

## Functional Requirements

### FR-1: Daily Activity Tracking

Track two types of daily activity:

**Login streak**: Player opens the app/site on consecutive calendar days (UTC).
**Play streak**: Player completes at least one hand of poker on consecutive calendar days (UTC).

Both streaks are independent. A player could have a 30-day login streak but only a 5-day play streak.

**Rules:**
- A "day" is a UTC calendar day (00:00 – 23:59 UTC)
- Login streak increments when the player authenticates on a new calendar day
- Play streak increments when the player completes at least one hand on a new calendar day (dealt cards + hand reaches showdown or fold resolution)
- Streaks reset to 0 if a day is missed
- Maximum streak display: 365 days (cap for UI purposes)
- Track both current streak and longest-ever streak (personal best)

### FR-2: Streak Rewards

Players earn rewards at specific streak milestones:

| Milestone (days) | Login Streak Reward | Play Streak Reward |
|-------------------|--------------------|--------------------|
| 3 | 50 bonus points | 100 bonus points |
| 7 | 150 bonus points | 300 bonus points |
| 14 | 400 bonus points | 800 bonus points |
| 30 | 1,000 bonus points | 2,000 bonus points |
| 60 | 2,500 bonus points | 5,000 bonus points |
| 90 | 5,000 bonus points | 10,000 bonus points |

**Rules:**
- Rewards are claimed once per milestone per streak (if a player reaches 7 days, resets, and reaches 7 again, they earn the reward again)
- Rewards are awarded automatically when the milestone is reached
- A notification is created when a reward is earned
- "Bonus points" are recorded as point transactions with type `streak_bonus` (these would integrate with a rewards system; for this challenge, just write the transaction record)

### FR-3: Streak Protection (Freeze)

Players can "freeze" their streak to protect it:

- Each player gets 1 free freeze per calendar month
- Additional freezes can be purchased (track the balance, but payment is out of scope — provide an admin endpoint to grant freezes)
- A freeze protects against 1 missed day — the streak does not reset
- Freezes are consumed automatically if the player misses a day
- Freezes apply to both login and play streaks simultaneously
- A freeze is consumed at the start of the next day (01:00 UTC) if no activity was recorded

### FR-4: Streak Dashboard (React)

A React component (or page) showing the player's streak status:

**Main display:**
- Current login streak (number + flame/fire icon that grows with streak length)
- Current play streak (number + cards icon)
- Calendar heat map showing the last 30 days — each day colored by activity level:
  - No activity: gray
  - Login only: light green
  - Played: dark green
  - Freeze used: blue
  - Streak broken: red
- Next milestone and reward amount ("Play 2 more days to earn 300 bonus points!")
- Personal best streak display

**Streak freezes:**
- Available freeze count
- "Freeze active" indicator when a freeze is protecting today
- Freeze history (last used dates)

**Reward history:**
- List of streak rewards earned (date, milestone, reward type, points)

### FR-5: REST API for Unity Client

Expose endpoints for the Unity mobile client:

- `GET /api/v1/player/streaks` — Current streak state (login streak, play streak, freezes available, next milestones)
- `POST /api/v1/player/streaks/check-in` — Record a login for today (idempotent — multiple calls on same day = one check-in)
- `GET /api/v1/player/streaks/calendar?month=2026-02` — Calendar data for heat map (array of days with activity type)
- `GET /api/v1/player/streaks/rewards` — Streak rewards history
- `GET /api/v1/player/streaks/freezes` — Freeze balance and history

The `/check-in` endpoint is called when the player opens the app. The play streak is updated server-side when a hand completes (via an internal endpoint or event, not called by the client).

### FR-6: Internal API for Game Events

An internal endpoint (or event handler) for the game processor to notify that a player completed a hand:

```
POST /internal/streaks/hand-completed
{
  "playerId": "abc-123",
  "tableId": 456,
  "handId": "hand-789",
  "completedAt": "2026-02-20T14:30:00Z"
}
```

This updates the player's play streak for the given day. Like the check-in, it's idempotent per calendar day.

---

## Technical Requirements

### Backend

- **Runtime**: Node.js 22
- **Framework**: Your choice — Express, Fastify, NestJS, or a Lambda handler with API Gateway
- **Language**: TypeScript
- **Database**: DynamoDB (via AWS SDK v3) for streak data
- **Auth**: JWT-based authentication (stub the verification)
- **Testing**: Jest

### Frontend (React)

- **Framework**: React 18+ with TypeScript
- **State Management**: Your choice (Redux, Zustand, React Query, etc.)
- **Calendar component**: Build the 30-day heat map. You can use a library (e.g., `react-calendar-heatmap`) or build from scratch.
- **Styling**: Your choice
- **Testing**: React Testing Library for key components

### Local Development

- DynamoDB Local via Docker
- Seed script to generate streak data (so the dashboard has something to show)
- All services runnable locally

---

## Suggested Architecture

### Service Structure

```
streaks-service/
├── src/
│   ├── handlers/          # API route handlers
│   │   ├── check-in.ts    # POST /streaks/check-in
│   │   ├── streaks.ts     # GET /streaks
│   │   ├── calendar.ts    # GET /streaks/calendar
│   │   ├── rewards.ts     # GET /streaks/rewards
│   │   ├── freezes.ts     # GET /streaks/freezes
│   │   └── internal.ts    # POST /internal/streaks/hand-completed
│   ├── services/
│   │   ├── streak.service.ts     # Core streak logic
│   │   ├── freeze.service.ts     # Freeze management
│   │   ├── reward.service.ts     # Milestone reward logic
│   │   └── calendar.service.ts   # Calendar data assembly
│   ├── repositories/
│   │   └── dynamo.repository.ts  # DynamoDB operations
│   ├── models/
│   │   └── streak.model.ts       # Data types and interfaces
│   └── config/
│       ├── milestones.ts          # Milestone definitions
│       └── constants.ts
├── __tests__/
└── package.json

streaks-frontend/
├── src/
│   ├── components/
│   │   ├── StreakDashboard.tsx     # Main container
│   │   ├── StreakCounter.tsx       # Login/Play streak display
│   │   ├── CalendarHeatMap.tsx     # 30-day calendar view
│   │   ├── MilestoneProgress.tsx   # Next milestone + progress
│   │   ├── FreezeStatus.tsx        # Freeze indicator + count
│   │   ├── RewardHistory.tsx       # List of earned rewards
│   │   └── PersonalBest.tsx        # Best streak display
│   ├── hooks/
│   │   ├── useStreaks.ts           # Streak data fetching
│   │   └── useCalendar.ts         # Calendar data fetching
│   ├── api/
│   │   └── streaks.api.ts         # API client
│   └── types/
│       └── streaks.types.ts       # TypeScript interfaces
└── package.json
```

### Data Model (DynamoDB)

**Player Streaks Table** — `streaks-players`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `playerId` | String | PK | Player GUID |
| `loginStreak` | Number | — | Current consecutive login days |
| `playStreak` | Number | — | Current consecutive play days |
| `bestLoginStreak` | Number | — | Personal best login streak |
| `bestPlayStreak` | Number | — | Personal best play streak |
| `lastLoginDate` | String | — | `YYYY-MM-DD` UTC date of last login |
| `lastPlayDate` | String | — | `YYYY-MM-DD` UTC date of last hand played |
| `freezesAvailable` | Number | — | Current freeze balance |
| `freezesUsedThisMonth` | Number | — | Freezes used in current month |
| `lastFreezeGrantDate` | String | — | `YYYY-MM` when free monthly freeze was last granted |
| `updatedAt` | String | — | ISO timestamp |

**Daily Activity Table** — `streaks-activity`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `playerId` | String | PK | Player GUID |
| `date` | String | SK | `YYYY-MM-DD` |
| `loggedIn` | Boolean | — | Did player log in this day |
| `played` | Boolean | — | Did player complete a hand this day |
| `freezeUsed` | Boolean | — | Was a freeze consumed this day |
| `streakBroken` | Boolean | — | Did a streak break this day |
| `loginStreakAtDay` | Number | — | Login streak count on this day |
| `playStreakAtDay` | Number | — | Play streak count on this day |

**Streak Rewards Table** — `streaks-rewards`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `playerId` | String | PK | Player GUID |
| `rewardId` | String | SK | ULID or UUID |
| `type` | String | — | `login_milestone` or `play_milestone` |
| `milestone` | Number | — | Days (3, 7, 14, 30, 60, 90) |
| `points` | Number | — | Bonus points awarded |
| `streakCount` | Number | — | Actual streak when earned |
| `createdAt` | String | — | ISO timestamp |

**Freeze History Table** — `streaks-freeze-history`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `playerId` | String | PK | Player GUID |
| `date` | String | SK | `YYYY-MM-DD` when freeze was consumed |
| `source` | String | — | `free_monthly` or `purchased` |

### Core Logic: Check-In Flow

```
POST /streaks/check-in:

1. Get current player streak record
2. Get today's date (UTC)
3. If already checked in today → return current state (idempotent)
4. If lastLoginDate === yesterday:
     loginStreak += 1
   Else if lastLoginDate < yesterday:
     // Missed a day — check for freeze
     If missedDays === 1 AND freezesAvailable > 0:
       Consume freeze
       loginStreak stays (protected)
       Record freeze in daily activity
     Else:
       loginStreak = 1 (reset)
       Record streak break in daily activity
5. Update lastLoginDate = today
6. Check if loginStreak hits a milestone → award reward
7. Update bestLoginStreak if current > best
8. Write daily activity record
9. Return updated streak state
```

### Core Logic: Freeze Auto-Consumption

At 01:00 UTC, a scheduled job (or lazy evaluation on next check-in) checks:

```
For each player with an active streak:
  If lastLoginDate < yesterday AND freezesAvailable > 0:
    Consume freeze
    Mark daily activity as freeze_used
    Decrement freezesAvailable
```

For this challenge, lazy evaluation (checking on next login) is perfectly acceptable. A scheduled Lambda is bonus.

### API Response Shapes

**GET /api/v1/player/streaks:**
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

**GET /api/v1/player/streaks/calendar?month=2026-02:**
```json
{
  "month": "2026-02",
  "days": [
    { "date": "2026-02-01", "activity": "played", "loginStreak": 8, "playStreak": 3 },
    { "date": "2026-02-02", "activity": "login_only", "loginStreak": 9, "playStreak": 0 },
    { "date": "2026-02-03", "activity": "freeze", "loginStreak": 9, "playStreak": 0 },
    { "date": "2026-02-04", "activity": "none", "loginStreak": 0, "playStreak": 0 },
    ...
  ]
}
```

---

## Acceptance Criteria

### Must Have (core)

- [ ] Login check-in endpoint works and is idempotent
- [ ] Login streak increments on consecutive days
- [ ] Login streak resets when a day is missed (and no freeze)
- [ ] Play streak increments when a hand is completed on a new day
- [ ] Play streak resets when a day is missed
- [ ] Milestone rewards are awarded at correct thresholds (3, 7, 14, 30 days minimum)
- [ ] Streak rewards are recorded as transactions
- [ ] REST API returns correct streak state
- [ ] Calendar API returns daily activity data for a given month
- [ ] Dashboard shows current streaks (login + play) with visual indicators
- [ ] Dashboard shows 30-day calendar heat map
- [ ] Dashboard shows next milestone and progress
- [ ] Unit tests cover streak increment, reset, and milestone logic
- [ ] Docker Compose starts dependencies, `npm test` passes

### Should Have

- [ ] Streak freeze works — consumes a freeze on missed day, preserves streak
- [ ] Monthly free freeze grant logic works
- [ ] Freeze status shown on dashboard
- [ ] Reward history list on dashboard
- [ ] Personal best streak display
- [ ] Internal hand-completed endpoint works and updates play streak
- [ ] Integration test for the check-in → streak update → milestone reward flow
- [ ] API documentation for Unity client endpoints

### Could Have (bonus)

- [ ] Scheduled freeze consumption (Lambda on cron vs. lazy evaluation)
- [ ] Streak animation — the fire/flame icon grows bigger for longer streaks
- [ ] Admin endpoint to grant freezes to a player
- [ ] Admin endpoint to view a player's streak history
- [ ] Push notification content for streak milestones (just the message payload, not delivery)
- [ ] Streak sharing — generate a shareable image/card of the player's streak
- [ ] GitHub Actions CI pipeline

---

## Out of Scope

- User authentication system (stub the JWT guard)
- Payment for freeze purchases (just the balance tracking)
- Integration with the actual game engine (use the internal API endpoint)
- Unity client implementation
- Push notification delivery (just store the notification)
- Production deployment

---

## Key Edge Cases to Consider

1. **Timezone boundaries**: A player in UTC-8 plays at 11 PM local time (07:00 UTC next day). This counts for the UTC day, not the player's local day. All calculations are UTC.
2. **Multiple hands in a day**: Only the first hand increments the play streak. Subsequent hands are no-ops.
3. **Check-in right at midnight**: Handle the boundary carefully — `2026-02-20T00:00:00Z` belongs to Feb 20.
4. **Freeze on day after streak breaks**: Freezes protect against missing *one* day. If a player misses two days, the freeze covers the first missed day but the streak still resets on the second.
5. **Monthly freeze reset**: The free monthly freeze should be granted on the 1st of each month, not every 30 days. If a player uses their free freeze on Jan 2, they get a new one on Feb 1.
6. **New player first check-in**: Login streak starts at 1. No "yesterday" to compare — just start the streak.

---

## Getting Started

1. Start with the data model — create the DynamoDB tables locally
2. Build the check-in endpoint and streak logic first (this is the core)
3. Add a seed script that generates 60 days of activity data
4. Build the calendar API using seeded data
5. Build the React dashboard against the API
6. Add milestones and rewards last — they build on the working streak logic
7. Write tests alongside each piece

Good luck.
