# Hijack Poker — Technical Challenge

## Introduction

Welcome to the Hijack Poker engineering challenge. You'll build a feature against a skeleton repository that mirrors our production architecture. This challenge evaluates your ability to ship working software across a polyglot stack, using whatever tools — including AI — you see fit.

Pick **one** of four feature options, each targeting a different part of the stack. All four are scoped to be achievable in roughly 30 hours of focused work.

---

## Challenge Options

| Option | Feature | Primary Stack | Difficulty Profile |
|--------|---------|---------------|-------------------|
| **A** | [Rewards Program](challenge-rewards.md) | NestJS + React + DynamoDB | Backend-heavy, CRUD + business logic |
| **B** | [Bomb Pots](challenge-bomb-pots.md) | Node.js + Lambda + SQS + Socket.IO | Real-time systems, event-driven |
| **C** | [Daily Streaks](challenge-streaks.md) | React + Lambda + DynamoDB + REST API | Full-stack, frontend-heavy |
| **D** | [Unity Game Client](challenge-unity-client.md) | Unity + C# + REST API | Frontend-heavy, game client |

Read each option's document before choosing. Pick the one that best matches your strengths — we're evaluating depth, not breadth.

---

## Platform Architecture

The skeleton repo mirrors our production platform. Here's what you need to know.

### System Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Game Client │────▶│  Game Engine  │────▶│  SQS Queues     │────▶│  Lambda          │
│  (Unity/Web) │◀────│  (Node.js    │     │  (per game type) │     │  Processors      │
│              │     │   Socket.IO) │     └─────────────────┘     │  (per game type)  │
└─────────────┘     └──────────────┘                              └────────┬─────────┘
       │                                                                   │
       │            ┌──────────────┐                              ┌────────▼─────────┐
       │            │  REST API    │                              │  EventBridge      │
       └───────────▶│  (Laravel)   │                              │  (poker-events)   │
                    └──────┬───────┘                              └────────┬─────────┘
                           │                                               │
                    ┌──────▼───────┐                              ┌────────▼─────────┐
                    │  MySQL (RDS) │                              │  Broadcast Lambda │
                    │  DynamoDB    │                              │  → WebSocket push │
                    │  Redis       │                              └──────────────────┘
                    └──────────────┘
```

### Repo Structure

```
platform/
├── apps/
│   ├── engine/                    # Game engine (Node.js, WebSocket/Socket.IO)
│   │   ├── texas/                 # Texas Hold'em game logic
│   │   ├── omaha/                 # Omaha game logic
│   │   └── games/common/          # Shared: betting, cards, rotations, constants
│   ├── api/                       # REST API (Laravel/PHP)
│   ├── backoffice/                # Admin panel (Laravel)
│   ├── rewards-api/               # Rewards service (Express, TypeScript)
│   └── rewards-frontend/          # Rewards web app (React, Redux, TypeScript)
├── serverless-v2/
│   ├── services/                  # Lambda services (Serverless Framework v4)
│   │   ├── holdem-processor/      # Processes Hold'em hands from SQS
│   │   ├── omaha-processor/       # Processes Omaha hands from SQS
│   │   ├── tournament-processor/  # Tournament lifecycle management
│   │   ├── cash-game-broadcast/   # Pushes game state to WebSocket clients
│   │   └── ...
│   └── shared/                    # Shared code across Lambda services
│       └── games/
│           ├── common/            # Betting, cards, charges (all game types)
│           ├── texas/             # Hold'em-specific logic
│           └── omaha/             # Omaha-specific logic
├── iac/                           # Pulumi infrastructure (TypeScript)
├── docker-compose.yml             # Local development environment
└── docs/                          # Documentation
```

### Key Patterns

**Game Processing Pipeline**

The engine runs game rounds via Socket.IO. When a hand completes a state transition, it sends a message to an SQS queue. A Lambda processor picks up the message, processes game logic (evaluate hands, calculate pots, determine winners), and publishes a `TABLE_UPDATE` event to EventBridge. A broadcast Lambda then pushes the updated state to all connected clients.

```
Engine → SQS → Lambda Processor → EventBridge → Broadcast Lambda → Clients
```

**Game Hand States** (the lifecycle of a single hand):

```
GAME_PREP → SETUP_DEALER → SETUP_SMALL_BLIND → SETUP_BIG_BLIND → DEAL_CARDS
→ PRE_FLOP_BETTING_ROUND → DEAL_FLOP → FLOP_BETTING_ROUND → DEAL_TURN
→ TURN_BETTING_ROUND → DEAL_RIVER → RIVER_BETTING_ROUND → FIND_WINNERS
→ PAY_WINNERS → RECORD_NEW_STATS_AND_START_NEW_HAND
```

**Shared Code via Symlinks**: Lambda services reference shared game logic through symlinks to `serverless-v2/shared/`.

**Table State**: Game tables store per-seat player data (up to 9 seats). Each seat tracks: player ID (GUID), stack, bet, status, action, cards, and more.

**Infrastructure**: AWS-native — SQS for decoupling, EventBridge for fan-out, Lambda for processing, DynamoDB and MySQL for storage, Redis for game state caching.

---

## Skeleton Repo

The skeleton repo provides:

- Stubbed service directories with `package.json` and basic configs
- Docker Compose for local MySQL, Redis, DynamoDB Local, and LocalStack
- Serverless Framework config templates
- Shared utility stubs (logging, Redis helpers, DB connection)
- Seed data for tables, players, and game state
- Example test files showing our testing patterns

You'll build your feature into this skeleton. You do **not** need to build the full platform — only the parts your chosen feature touches.

---

## Time Expectation

**~30 hours of focused work.** This is not a timed exam. Spread it over a week if you like.

The acceptance criteria for each option are scoped accordingly. We don't expect polish on every edge case. We do expect:

- Core functionality works end-to-end
- Tests cover the critical paths
- Code is structured for a team to extend later
- You can explain your decisions

---

## What We Mean by "AI-First Developer"

Use AI tools however you want — Copilot, ChatGPT, Claude, Cursor, whatever. We don't care. What we evaluate:

1. **Output quality over process purity**: The code you submit matters, not whether you typed every character. AI-generated code that's well-understood, well-tested, and well-integrated is great. AI-generated code that's pasted without comprehension is not.

2. **Judgment under ambiguity**: The requirements are intentionally not pixel-perfect specs. You'll need to make decisions. We want to see good decisions — or at least well-reasoned ones.

3. **Architecture that survives contact with reality**: Suggested architectures are provided but not prescribed. If you have a better idea, do it. Just be ready to explain why.

4. **Comfort with unfamiliar territory**: You may not know every tool in the stack. An AI-first developer uses AI to close knowledge gaps quickly. We'd rather see someone learn NestJS in a day with AI assistance and ship something solid than someone who avoids the unfamiliar parts.

---

## Evaluation Criteria

| Category | Weight | What We're Looking For |
|----------|--------|----------------------|
| **Working Software** | 30% | Does it work? Can we run it locally and see the feature? |
| **Code Quality** | 25% | Clean structure, appropriate abstractions, no obvious anti-patterns |
| **Testing** | 20% | Unit tests on business logic, integration tests on key flows |
| **Architecture Decisions** | 15% | Sensible data models, API design, separation of concerns |
| **Documentation** | 10% | README with setup instructions, brief ADRs for non-obvious choices |

### What Sets Submissions Apart

**Good submissions**: Feature works, tests pass, code is clean, README explains setup.

**Great submissions**: All of the above, plus thoughtful error handling, API contracts documented (especially the Unity-facing REST endpoints), observability hooks (logging, metrics), and a brief write-up of trade-offs made.

---

## Submission Requirements

### Deliverables

1. **Pull Request** against the skeleton repo's `main` branch
   - One PR with your feature. Commit history should be meaningful (not one giant squash, not 200 micro-commits).

2. **README.md** in the repo root (or your feature directory), covering:
   - Which option you chose and why
   - Setup instructions (should work with `docker-compose up` + a few commands)
   - What's implemented vs. what's stubbed/deferred
   - Key architectural decisions and trade-offs

3. **API Documentation** (if your feature includes REST endpoints)
   - Endpoint definitions, request/response shapes, error codes
   - Especially important for endpoints that would be consumed by a Unity mobile client

4. **Tests**
   - Run with a single command (`npm test` or similar)
   - Cover the business logic, not just happy paths

### Optional Bonus Deliverables

- A short Loom/video walkthrough of the feature (5 min max)
- Load testing results or performance analysis
- CI pipeline config (GitHub Actions)
- Infrastructure as Code for any new AWS resources

---

## Getting Started

```bash
# Clone the skeleton repo
git clone <skeleton-repo-url>
cd hijack-tech-challenge

# Start local infrastructure
docker-compose up -d

# Read the challenge doc for your chosen option
# Start building
```

---

## Questions?

If something in the requirements is genuinely ambiguous (not "intentionally open-ended"), reach out to **sam@hijackpoker.com**. We'll clarify functional requirements but not architectural decisions — those are part of the challenge.

---

## Important Notes

- **Don't over-scope.** Each challenge doc lists clear "in scope" and "out of scope" sections. Stick to scope. A complete, clean implementation of the core requirements beats a half-finished implementation with bonus features.
- **Document what you'd do next.** If you see improvements you'd make with more time, write them down. This tells us more about your engineering judgment than trying to cram them in.
- **The suggested architecture is a suggestion.** You can follow it, adapt it, or replace it. Just be prepared to justify your approach.
