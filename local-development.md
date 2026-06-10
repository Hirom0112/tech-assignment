# Local Development Guide

This guide walks through setting up and working with the skeleton repo locally. It covers what each service does, how to interact with them, and how to develop against them.

## How It Works

The skeleton repo uses **Docker Compose profiles** to run different sets of services depending on which challenge option you're working on. Every profile includes the `core` infrastructure (MySQL, Redis, DynamoDB Local), plus the services specific to your challenge.

All Lambda-based services run locally via [serverless-offline](https://github.com/dherault/serverless-offline), which emulates AWS API Gateway + Lambda on your machine. No AWS account needed.

```
┌──────────────────────────────────────────────────────────────────┐
│  Docker Compose                                                  │
│                                                                  │
│  core:    MySQL 8.0 (:3306)                                      │
│           Redis 7 (:6379)                                        │
│           DynamoDB Local (:8000)                                  │
│                                                                  │
│  engine:  core + ElasticMQ (:9324) + EventBridge Mock (:4010)    │
│           + Holdem Processor (:3030) + Broadcast (:3032)         │
│                                                                  │
│  rewards: core + Rewards API (:5000) + React Frontend (:4000)    │
│                                                                  │
│  streaks: core + Streaks API (:5001) + React Frontend (:4001)    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Starting Up

```bash
# 1. Copy environment config
cp .env.example .env

# 2. Start your profile
docker compose --profile engine up     # Option B
docker compose --profile rewards up    # Option A
docker compose --profile streaks up    # Option C

# Add -d for detached mode (runs in background)
docker compose --profile engine up -d
```

### What happens on first start

1. **Core infrastructure** boots: MySQL (with schema + seed data), Redis, DynamoDB Local
2. **DynamoDB init container** creates all required DynamoDB tables, then exits
3. **Service containers** run `npm install` then start serverless-offline
4. Health checks gate startup order — services wait for databases to be ready

First boot takes 2–3 minutes for npm installs. Subsequent starts skip this.

### Checking status

```bash
docker compose ps              # See what's running
docker compose logs -f         # Stream all logs
docker compose logs holdem-processor --tail 50  # Specific service
```

---

## Option B: Engine Pipeline

This is the most complex profile — a full game processing pipeline.

### Services

| Service | Port | Purpose |
|---------|------|---------|
| **holdem-processor** | 3030 | Processes poker hands step-by-step via a state machine |
| **cash-game-broadcast** | 3032 | Receives EventBridge events, pushes to WebSocket clients |
| **elasticmq** | 9324 | Local SQS emulation |
| **eventbridge-mock** | 4010 | Simple HTTP server that logs EventBridge events |

### The Hand State Machine

The holdem processor runs a **16-step state machine**. Each call to the `/process` endpoint advances the current hand by one step:

```
 Step 0:  GAME_PREP                 → Shuffle deck, reset player state
 Step 1:  SETUP_DEALER              → Rotate dealer button
 Step 2:  SETUP_SMALL_BLIND         → Post small blind
 Step 3:  SETUP_BIG_BLIND           → Post big blind
 Step 4:  DEAL_CARDS                → Deal 2 hole cards to each player
 Step 5:  PRE_FLOP_BETTING_ROUND    → Pre-flop betting
 Step 6:  DEAL_FLOP                 → Deal 3 community cards
 Step 7:  FLOP_BETTING_ROUND        → Flop betting
 Step 8:  DEAL_TURN                 → Deal turn card
 Step 9:  TURN_BETTING_ROUND        → Turn betting
 Step 10: DEAL_RIVER                → Deal river card
 Step 11: RIVER_BETTING_ROUND       → River betting
 Step 12: AFTER_RIVER_BETTING_ROUND → Prepare for showdown
 Step 13: FIND_WINNERS              → Evaluate hands (pokersolver)
 Step 14: PAY_WINNERS               → Distribute pot to winner(s)
 Step 15: RECORD_STATS_AND_NEW_HAND → Mark hand complete
```

After step 15, the next `/process` call creates a new game and starts the cycle again.

### API Endpoints

```bash
# Health check
curl http://localhost:3030/health

# Advance one hand step
curl -X POST http://localhost:3030/process \
  -H 'Content-Type: application/json' \
  -d '{"tableId": 1}'

# Read current table state (game + all players)
curl http://localhost:3030/table/1
```

The `/table/{tableId}` endpoint returns the full game state including:
- Game info: hand step, pot, community cards, dealer/blind positions, winners
- Player info: seat, stack, cards, bets, action, hand rank, winnings

### Hand Viewer UI

A visual poker table that calls the API and renders each step:

```bash
cd ui && python3 -m http.server 8080
# Open http://localhost:8080
```

Use **Next Step** to advance manually, or **Auto Play** to watch hands play through continuously. Cards are face-down until showdown, then revealed with hand rankings and payouts.

### Where to add Bomb Pots

The challenge is to add a bomb pot variant to this pipeline. Key files:

| File | What to modify |
|------|----------------|
| `shared/games/common/constants.js` | Add new `GAME_HAND` constants (e.g., `BOMB_POT_ANTE: 17`) |
| `holdem-processor/lib/process-table.js` | Add new steps to the switch statement and implement bomb pot logic |
| `holdem-processor/lib/table-fetcher.js` | Add bomb pot fields to game save/load if needed |
| `holdem-processor/lib/event-publisher.js` | Include `isBombPot` flag in TABLE_UPDATE events |
| `infrastructure/mysql-init/01-schema.sql` | Add bomb pot config columns to `game_tables` or `games` |

The state machine in `process-table.js` is the core of the engine. Study the existing step implementations to understand the pattern, then add your bomb pot flow.

### MySQL Access

```bash
# Interactive MySQL shell
docker compose exec mysql mysql -uhijack -phijack_dev hijack_poker

# Useful queries
SELECT id, game_no, hand_step, pot, status FROM games ORDER BY id DESC LIMIT 5;
SELECT gp.seat, p.username, gp.stack, gp.hand_rank, gp.winnings
  FROM game_players gp JOIN players p ON gp.player_id = p.id
  WHERE gp.game_id = (SELECT MAX(id) FROM games) ORDER BY gp.seat;

# Reset game state (start fresh)
DELETE FROM game_players; DELETE FROM games;
```

---

## Option A: Rewards System

### Services

| Service | Port | Purpose |
|---------|------|---------|
| **rewards-api** | 5000 | Express-in-Lambda API (serverless-offline) |
| **rewards-frontend** | 4000 | Vite + React 18 + MUI + Redux Toolkit |

### API Endpoints (stub)

```bash
# Health (working)
curl http://localhost:5000/api/v1/health

# These return 501 "Not Implemented" — your job to build them:
curl http://localhost:5000/api/v1/player/rewards \
  -H 'X-Player-Id: p1-uuid-0001'

curl -X POST http://localhost:5000/api/v1/points/award \
  -H 'Content-Type: application/json' \
  -H 'X-Player-Id: p1-uuid-0001' \
  -d '{"amount": 100, "reason": "hand_played"}'
```

### Seed Data

```bash
# Requires @aws-sdk/client-dynamodb installed locally
cd scripts && npm install
node seed-rewards.js
```

### Key Files

| File | Purpose |
|------|---------|
| `rewards-api/handler.js` | Express app with route mounting |
| `rewards-api/src/routes/` | Route handlers (health, points, player) |
| `rewards-api/src/services/dynamo.service.js` | DynamoDB CRUD helpers |
| `rewards-api/src/config/constants.js` | Tier definitions, point rules |
| `rewards-frontend/src/App.tsx` | React router with placeholder pages |
| `rewards-frontend/src/api/client.ts` | Axios client pointed at localhost:5000 |

---

## Option C: Daily Streaks

### Services

| Service | Port | Purpose |
|---------|------|---------|
| **streaks-api** | 5001 | Express-in-Lambda API (serverless-offline) |
| **streaks-frontend** | 4001 | Vite + React 18 + MUI + Redux Toolkit |

### API Endpoints (stub)

```bash
# Health (working)
curl http://localhost:5001/api/v1/health

# These return 501 — your job to build them:
curl http://localhost:5001/api/v1/streaks \
  -H 'X-Player-Id: p1-uuid-0001'

curl -X POST http://localhost:5001/api/v1/streaks/check-in \
  -H 'Content-Type: application/json' \
  -H 'X-Player-Id: p1-uuid-0001'
```

### Key Files

Same structure as rewards-api — see `streaks-api/src/routes/` for the stub endpoints to implement.

---

## Option D: Unity Game Client

This option uses the same `engine` Docker profile as Option B for the backend API. The Unity application runs natively in the Unity Editor — not in a container.

### Services

| Service | Port | Purpose |
|---------|------|---------|
| **holdem-processor** | 3030 | Processes poker hands step-by-step (same as Option B) |

The Unity client communicates with the holdem-processor via three REST endpoints: `GET /health`, `POST /process`, and `GET /table/{tableId}`.

### Setup

```bash
# 1. Start the engine backend
docker compose --profile engine up -d

# 2. Verify the API is running
curl http://localhost:3030/health
```

Then in Unity:

1. Create a new Unity project (2022.3+ LTS or Unity 6)
2. Copy `unity-client/Scripts/` into your project's `Assets/Scripts/`
3. Install Newtonsoft JSON: Window > Package Manager > Add by name > `com.unity.nuget.newtonsoft-json`
4. Create a scene with a Canvas and add a `PokerApiClient` component to a GameObject
5. Set the `Base Url` field to `http://localhost:3030` in the Inspector
6. Hit Play, wire up a button to call `ProcessStepAsync` → `GetTableStateAsync`, and render the result

### API Interaction

The workflow is the same as the vanilla JS hand viewer (`ui/index.html`):

1. Call `POST /process` with `{"tableId": 1}` to advance one step
2. Call `GET /table/1` to fetch the updated state
3. Render the game and player data in your Unity UI
4. Repeat — after step 15 the next call starts a new hand automatically

### Skeleton Scripts

The `unity-client/Scripts/` directory contains starter C# files:

| File | Purpose |
|------|---------|
| `Api/PokerApiClient.cs` | REST client stub with `TODO` methods to implement |
| `Models/GameState.cs` | C# models for the game state, side pots, winners, and API response wrappers |
| `Models/PlayerState.cs` | C# model for player state with status code constants |

See `unity-client/README.md` for full setup instructions and API response documentation.

---

## Working with the Code

### Code changes

Service code is **volume-mounted** into Docker containers, so your file edits are immediately visible inside the container. However, **serverless-offline doesn't hot-reload** — you need to restart the service:

```bash
docker compose restart holdem-processor
# or restart all services:
docker compose --profile engine restart
```

### Running tests locally

Tests run outside Docker (directly on your machine):

```bash
cd serverless-v2/services/holdem-processor
npm install   # first time only
npm test
```

### Adding dependencies

If you add an npm package to a service, you need to restart the container so it runs `npm install` again:

```bash
# After editing package.json:
docker compose up holdem-processor -d --force-recreate
```

### Shared code

The `serverless-v2/shared/` directory is mounted into each service container at `/app/shared`. Locally, each service has a symlink (`shared -> ../../shared`).

If you need to add shared dependencies:

1. Add them to `serverless-v2/shared/package.json`
2. **Also** add them to the consuming service's `package.json` (Docker containers need deps in the service's own `node_modules` for module resolution to work)

---

## Troubleshooting

### Port conflicts

If ports are already in use, remap them in `.env`:

```bash
MYSQL_EXTERNAL_PORT=3307
REDIS_EXTERNAL_PORT=6380
DYNAMODB_EXTERNAL_PORT=8001
```

### Full reset

```bash
docker compose --profile engine down -v   # remove volumes
docker compose --profile engine up         # fresh start
```

### Container keeps restarting

Check its logs:

```bash
docker compose logs <service-name> --tail 30
```

Common causes:
- **MySQL not ready** — wait for health check, or restart just the service
- **npm install failed** — network issue, try again
- **Syntax error in your code** — check the log output

### Lambda timeout (504)

The Lambda timeout is 30 seconds. If you hit this:
- Check if MySQL is reachable (`docker compose ps` — is it healthy?)
- Check if your function is hanging on an external HTTP call
- View logs: `docker compose logs holdem-processor --tail 50`

### Tests fail with "Cannot find module"

Run `npm install` in the service directory first. Docker installs deps inside the container, but local test runs need local `node_modules`.
