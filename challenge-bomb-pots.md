# Option B: Bomb Pots

## Overview

Build a bomb pot variant for cash game tables. A bomb pot is a special hand where every seated player posts a predetermined ante, no pre-flop betting occurs, and the flop is dealt immediately. Action begins on the flop. Bomb pots add excitement and build larger pots — they're a popular feature at live poker rooms.

This challenge is **systems-heavy** — you're modifying a real-time game processing pipeline that spans a Node.js WebSocket engine, SQS queues, Lambda processors, EventBridge, and Socket.IO client updates. Getting the state machine transitions right is the core challenge.

---

## Functional Requirements

### FR-1: Bomb Pot Triggering

Bomb pots are triggered between hands (after one hand completes and before the next begins). Two trigger mechanisms:

**Random Trigger:**
- Configurable probability per table (e.g., 1 in every N hands, default N=10)
- Only triggers when the table has 3+ active players (not sitting out)
- The engine decides at `RECORD_NEW_STATS_AND_START_NEW_HAND` whether the next hand is a bomb pot
- Bomb pot frequency is configurable per table via a backoffice setting

**Player Vote (stretch):**
- Any player can request a bomb pot vote
- If 2/3+ of seated players vote yes within 15 seconds, the next hand is a bomb pot
- Voting is optional — skip this if time is tight (see acceptance criteria)

### FR-2: Bomb Pot Ante

When a bomb pot is triggered:

- Every active player (not sitting out, not waiting for BB) posts an ante
- Ante amount is configurable per table, typically 2x–5x the big blind
- Default: 2x BB
- The ante is deducted from each player's stack
- If a player cannot afford the full ante, they are all-in for their remaining stack
- Players who are sitting out, leaving, or waiting for BB do not participate

### FR-3: Modified Hand Flow

A bomb pot hand follows a different state sequence than a normal hand:

**Normal hand:**
```
SETUP_DEALER → SETUP_SB → SETUP_BB → DEAL_CARDS → PRE_FLOP_BETTING →
DEAL_FLOP → FLOP_BETTING → DEAL_TURN → TURN_BETTING → DEAL_RIVER →
RIVER_BETTING → FIND_WINNERS → PAY_WINNERS → NEW_HAND
```

**Bomb pot hand:**
```
SETUP_DEALER → BOMB_POT_ANTE → DEAL_CARDS → DEAL_FLOP → FLOP_BETTING →
DEAL_TURN → TURN_BETTING → DEAL_RIVER → RIVER_BETTING → FIND_WINNERS →
PAY_WINNERS → NEW_HAND
```

Key differences:
- No small blind or big blind posting
- A new `BOMB_POT_ANTE` step collects antes from all players
- Cards are dealt, but pre-flop betting is **skipped entirely**
- The flop is dealt immediately after cards
- Action begins at the flop betting round — first to act is first active player left of the dealer
- All subsequent betting rounds (flop, turn, river) proceed normally
- Winner determination and payout proceed normally

### FR-4: Pot Calculation

- The initial pot is the sum of all bomb pot antes
- Side pots work normally — if a short-stacked player goes all-in for less than the full ante, a side pot is created
- Rake/charges apply normally to bomb pot hands (use the existing charge logic)

### FR-5: Client Communication

The engine must communicate bomb pot state to connected clients via Socket.IO events:

**New events:**
- `bombPotAnnounced` — Sent to all players at the table when a bomb pot is triggered. Includes: ante amount, participating player count. Clients use this to show a visual announcement (animation, banner, etc.)
- `bombPotAnteCollected` — Sent after all antes are posted. Includes: pot total, per-player ante amounts, updated stacks

**Modified events:**
- The existing `tableUpdate` event should include a `isBombPot: true` flag on bomb pot hands so clients can adjust their UI (e.g., skip showing blind posts, show "Bomb Pot" label)
- The `gameState` within `tableUpdate` should reflect the skipped states — hand goes from `BOMB_POT_ANTE` directly to `DEAL_FLOP` with no `PRE_FLOP_BETTING` step

### FR-6: Table Configuration

Each table has bomb pot settings (stored in the game table record):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `bombPotEnabled` | Boolean | `false` | Whether bomb pots can trigger |
| `bombPotFrequency` | Number | `10` | Average hands between bomb pots (1 in N) |
| `bombPotAnteMultiplier` | Number | `2` | Ante as multiple of BB |
| `bombPotMinPlayers` | Number | `3` | Minimum active players to trigger |

These should be settable via the admin API (you'll create a simple endpoint) and readable when the engine processes a table.

---

## Technical Requirements

### Game Engine (Node.js)

- Modify the hand state machine to support bomb pot flow
- Add the `BOMB_POT_ANTE` game hand step (a new constant alongside existing `GAME_HAND` values)
- Implement bomb pot trigger logic in the inter-hand processing
- Emit new Socket.IO events to clients
- The engine determines if the next hand is a bomb pot and stores this in the table state before sending to SQS

### Lambda Processor

- The processor must handle bomb pot hands correctly:
  - Recognize bomb pot hands from the table state
  - Skip pre-flop betting logic
  - Process ante collection
  - Correctly calculate pots with bomb pot antes (not blinds)
- Published `TABLE_UPDATE` events via EventBridge should include bomb pot metadata

### SQS Message Format

The existing SQS message includes `gameTable` state. For bomb pots, the table state includes:

```json
{
  "gameID": 123,
  "game": "texas",
  "isBombPot": true,
  "bombPotAnte": 10.00,
  "hand": 17,
  ...
}
```

Where `hand: 17` (or whatever constant you assign) represents the `BOMB_POT_ANTE` step.

### Database

Add bomb pot tracking fields to the game table record:
- Configuration fields (see FR-6)
- Per-hand: `isBombPot` flag, `bombPotAnte` amount
- For hand history: bomb pot hands should be distinguishable in records

### Testing

- **Unit tests**: Bomb pot trigger probability, ante calculation (including short-stack edge cases), state machine transitions
- **Integration tests**: Full bomb pot hand flow from trigger through winner payment
- Mock SQS/EventBridge for Lambda processor tests

---

## Suggested Architecture

### New Game Hand Constants

Add to the existing `GAME_HAND` constants:

```javascript
export const GAME_HAND = {
  // ... existing values (0-16)
  BOMB_POT_ANTE: 17,          // Collect antes from all players
  BOMB_POT_DEAL_AND_FLOP: 18, // Deal cards + flop in one step (optional)
};
```

You may choose to reuse the existing `DEAL_CARDS` (4) and `DEAL_FLOP` (6) steps and simply skip the intervening betting round, or introduce new constants. Both approaches are valid — pick one and document why.

### Engine Modifications

**Inter-hand processing** (around `RECORD_NEW_STATS_AND_START_NEW_HAND`):

```
After normal hand completes:
  1. Check if bombPotEnabled for this table
  2. Check if enough active players (>= bombPotMinPlayers)
  3. Roll random: Math.random() < (1 / bombPotFrequency)
  4. If triggered, set table state: isBombPot = true, bombPotAnte = BB * multiplier
  5. Next hand flow uses bomb pot path
```

**Bomb pot ante collection:**

```
For each active player at table:
  - If stack >= ante: deduct ante, record
  - If stack < ante: player goes all-in for remaining stack
  - Update pot with total antes
  - Create side pots if needed (same logic as existing side pot calculation)
```

**Hand flow override:**

The processor's main loop checks the current `hand` value and routes to the appropriate handler. For bomb pots, the routing should:
1. After `BOMB_POT_ANTE`: jump to `DEAL_CARDS`
2. After `DEAL_CARDS`: jump to `DEAL_FLOP` (skip `PRE_FLOP_BETTING`)
3. After `DEAL_FLOP`: proceed normally to `FLOP_BETTING`

### Processor Modifications

The processor reads table state from the DB, processes the current hand step, and advances to the next step. For bomb pots:

```
processTable(gameTable):
  if gameTable.isBombPot:
    switch(gameTable.hand):
      case BOMB_POT_ANTE:
        collectAntes(gameTable)
        gameTable.hand = DEAL_CARDS
      case DEAL_CARDS:
        dealCards(gameTable)
        gameTable.hand = DEAL_FLOP    // Skip pre-flop betting
      case DEAL_FLOP:
        dealFlop(gameTable)
        gameTable.hand = FLOP_BETTING  // Normal from here
      default:
        // Normal hand processing for remaining steps
  else:
    // Existing hand processing
```

### Socket.IO Events

```javascript
// Bomb pot announced (engine → clients)
socket.emit('bombPotAnnounced', {
  tableId: 123,
  anteAmount: 10.00,
  participatingPlayers: 6,
  message: "Bomb Pot! All players ante $10.00"
});

// Bomb pot antes collected (processor → EventBridge → broadcast → clients)
// Included in the TABLE_UPDATE event payload
{
  detailType: "TABLE_UPDATE",
  detail: {
    tableId: 123,
    isBombPot: true,
    bombPotAnte: 10.00,
    pot: 60.00,
    players: [
      { seatId: 1, ante: 10.00, stack: 190.00 },
      { seatId: 3, ante: 5.50, stack: 0, isAllIn: true },
      // ...
    ]
  }
}
```

---

## Acceptance Criteria

### Must Have (core)

- [ ] Bomb pots trigger randomly based on configurable frequency
- [ ] All active players post the ante amount
- [ ] Short-stacked players go all-in for their remaining stack
- [ ] Pre-flop betting is skipped — flop is dealt immediately after cards
- [ ] Flop, turn, and river betting rounds work normally
- [ ] Winner determination and payout work correctly on bomb pot hands
- [ ] Pot calculation is correct (antes, not blinds, form the initial pot)
- [ ] `tableUpdate` events include `isBombPot` flag
- [ ] New Socket.IO events are emitted for bomb pot announcement and ante collection
- [ ] Table configuration (enable/disable, frequency, ante multiplier) is settable via admin API
- [ ] Unit tests cover: trigger logic, ante collection, state machine routing, pot calculation
- [ ] Integration test: full bomb pot hand from trigger to payout

### Should Have

- [ ] Side pots work correctly when short-stacked players go all-in on the ante
- [ ] Bomb pot hands are distinguishable in hand history
- [ ] Edge case: bomb pot with exactly 2 players remaining (should not trigger, or handle gracefully)
- [ ] Edge case: player sits out or leaves between bomb pot trigger and ante collection
- [ ] EventBridge event includes bomb pot metadata
- [ ] Admin API endpoint to configure bomb pot settings per table

### Could Have (bonus)

- [ ] Player vote mechanism for triggering bomb pots
- [ ] Bomb pot statistics (frequency, average pot size, per table)
- [ ] Bomb pot support for Omaha (same logic, 4 hole cards instead of 2)
- [ ] Visual test harness — a simple web page that shows game state transitions for a bomb pot hand
- [ ] Configurable bomb pot ante cap (max ante regardless of multiplier)

---

## Out of Scope

- Tournament bomb pots (cash games only)
- Omaha bomb pots (Hold'em only, unless you tackle the bonus)
- Unity client implementation (just define the events/API)
- Actual WebSocket server setup (mock the Socket.IO emissions in tests)
- Player vote UI (backend logic only, if you implement it)
- Production deployment

---

## Key Edge Cases to Consider

These aren't all required to handle, but thinking about them shows engineering depth:

1. **All players are short-stacked**: Every player goes all-in on the ante. The hand still plays out (no betting rounds will have action, go straight to showdown).
2. **Player disconnects during ante collection**: Treat as if they posted the ante (don't cancel the bomb pot).
3. **Table drops below minimum players between trigger and execution**: Cancel the bomb pot and play a normal hand.
4. **Bomb pot triggers on the very first hand of a new table**: Should work — just check active player count.
5. **Concurrent processing**: Two SQS messages for the same table — the existing deduplication key (`table:game:no:processing:{gameType}:{tableId}`) should prevent double processing. Verify your bomb pot logic works with this.

---

## Getting Started

1. Study the existing `GAME_HAND` constants and the processor's hand step routing
2. Trace a normal hand through the processor to understand the flow
3. Start with the state machine changes — add `BOMB_POT_ANTE` and the skip logic
4. Implement ante collection (reuse existing betting/pot logic where possible)
5. Add the trigger logic last (it's the simplest part)
6. Socket.IO events can be the final piece

Good luck.
