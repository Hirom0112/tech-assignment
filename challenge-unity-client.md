# Option D: Unity Game Client

## Overview

Build a poker table client in Unity that connects to the existing holdem-processor REST API. The application renders a 6-seat poker table, steps through hands one state at a time, and visually displays cards, stacks, bets, community cards, winners, and hand history.

This is the Unity equivalent of the vanilla JS hand viewer (`ui/index.html`) included in the skeleton repo — but built as a proper Unity application with real architecture, animations, and polish. Think of it as the foundation for a real poker game client.

This challenge is **frontend-heavy** — you're building a game client that consumes an existing API. The core challenge is clean Unity architecture, responsive UI, state management, and visual polish.

---

## Functional Requirements

### FR-1: Table View

Render a poker table with 6 player seats arranged around an oval felt surface.

Each seat displays:
- Player name
- Stack amount (formatted as currency, e.g., `$150.00`)
- Hole cards (2 cards per player)
- Current bet amount
- Last action (check, call, bet, raise, fold, allin)
- Position badge: Dealer (D), Small Blind (SB), Big Blind (BB)

Center of the table displays:
- Community cards (up to 5)
- Total pot amount

**Rules:**
- Folded players are visually dimmed or grayed out
- All-in players are visually distinct (e.g., highlighted name or border)
- Empty/unoccupied seats are not shown (the API only returns seated players)
- The table layout should be visually clean and readable at a glance

### FR-2: Hand Playback

Step through a poker hand one state machine step at a time by calling `POST /process`.

**Next Step button:**
- Calls `POST /process` with `{"tableId": 1}`
- Fetches updated state via `GET /table/1`
- Renders the new state

**Auto-play mode:**
- Automatically advances steps on a timer
- Configurable speed (e.g., 0.25s, 0.5s, 1s, 2s intervals)
- Toggle on/off with a single button
- Visual indicator when auto-play is active

**State transitions:**
- Each API call advances exactly one step in the 16-step state machine
- After step 15 (`RECORD_STATS_AND_NEW_HAND`), the next call starts a new hand
- The UI should reflect each transition clearly — the player should understand what just happened

### FR-3: Card Rendering

Display playing cards with rank and suit visuals.

**Card format from API:** Cards are strings like `"AH"` (Ace of Hearts), `"10D"` (Ten of Diamonds), `"2C"` (Two of Clubs). The last character is the suit (`H`, `D`, `C`, `S`), everything before it is the rank.

**Display rules:**
- Hole cards are face-down during active play (before showdown)
- Hole cards are revealed at showdown (`AFTER_RIVER_BETTING_ROUND` step 12 and beyond)
- Winners' cards are always shown (if `winnings > 0`)
- Community cards appear incrementally:
  - After `DEAL_FLOP` (step 6): 3 cards
  - After `DEAL_TURN` (step 8): 4 cards
  - After `DEAL_RIVER` (step 10): 5 cards
- Empty community card slots show as placeholders before they're dealt
- Hearts and Diamonds are red; Clubs and Spades are black

### FR-4: Game State HUD

Display current game state information:

- **Phase label**: Human-readable name for the current step (e.g., "Pre-Flop Betting", "Dealing Flop", "Evaluating Hands")
- **Hand number**: From `game.gameNo`
- **Dealer position**: Seat number with the dealer button
- **Blind positions**: Small blind and big blind seat indicators
- **Whose action**: During betting rounds, indicate which seat is to act (from `game.move`)

The 16 steps and their labels:

| Step | Name | Label |
|------|------|-------|
| 0 | `GAME_PREP` | Preparing Hand |
| 1 | `SETUP_DEALER` | Setting Up Dealer |
| 2 | `SETUP_SMALL_BLIND` | Posting Small Blind |
| 3 | `SETUP_BIG_BLIND` | Posting Big Blind |
| 4 | `DEAL_CARDS` | Dealing Hole Cards |
| 5 | `PRE_FLOP_BETTING_ROUND` | Pre-Flop Betting |
| 6 | `DEAL_FLOP` | Dealing Flop |
| 7 | `FLOP_BETTING_ROUND` | Flop Betting |
| 8 | `DEAL_TURN` | Dealing Turn |
| 9 | `TURN_BETTING_ROUND` | Turn Betting |
| 10 | `DEAL_RIVER` | Dealing River |
| 11 | `RIVER_BETTING_ROUND` | River Betting |
| 12 | `AFTER_RIVER_BETTING_ROUND` | Showdown |
| 13 | `FIND_WINNERS` | Evaluating Hands |
| 14 | `PAY_WINNERS` | Paying Winners |
| 15 | `RECORD_STATS_AND_NEW_HAND` | Hand Complete |

### FR-5: Winner Presentation

When winners are determined (steps 13–15):

- Highlight winning player(s) visually (glow, border, color change)
- Display hand rank text (e.g., "Full House", "Two Pair") from `player.handRank`
- Show winnings amount (e.g., `+$24.00`) from `player.winnings`
- Show pot distribution — how the pot was split if multiple winners
- Stack amounts update to reflect payouts

### FR-6: Hand History

Maintain a log of actions across the current session:

- Step-by-step log showing what happened at each state (e.g., "Posting Small Blind", "Dealing Flop", "Paying Winners")
- Track completed hands with summary (hand number, winner(s), pot size)
- Show running stack changes across multiple hands for each player
- Scrollable history panel (UI Toolkit ScrollView or uGUI ScrollRect)

---

## Technical Requirements

### Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Unity** | 2022.3+ LTS or Unity 6 | Game engine |
| **C#** | .NET Standard 2.1 | Application code |
| **UnityWebRequest** | Built-in | REST API communication |
| **TextMeshPro** | Built-in | Text rendering |
| **UI System** | UI Toolkit or uGUI | Candidate's choice |
| **Newtonsoft JSON** | Via Unity Package Manager | JSON deserialization |

### Architecture

Your Unity project should demonstrate clean separation of concerns:

- **API Layer**: HTTP client that talks to the holdem-processor REST API
- **Data Models**: C# classes that match the API response shapes
- **Game State Manager**: Tracks current table state, manages transitions
- **UI Layer**: Renders the table, cards, players, HUD, and history
- **Event System**: Decouples state changes from UI updates

You're free to use any Unity architecture pattern (MVC, MVP, MVVM, ECS-like, ScriptableObject events, etc.). We care about consistency and intentionality, not which specific pattern you pick.

### API Endpoints

The holdem-processor exposes three endpoints:

**`GET /health`** — Service health check
```json
{
  "service": "holdem-processor",
  "status": "ok",
  "timestamp": "2026-02-21T12:00:00.000Z"
}
```

**`POST /process`** — Advance one hand step
```
Request:  { "tableId": 1 }
Response: { "success": true, "result": { "status": "processed", "tableId": 1, "step": 6, "stepName": "DEAL_FLOP" } }
```

**`GET /table/{tableId}`** — Full table state
```json
{
  "game": {
    "id": 1,
    "tableId": 1,
    "tableName": "Starter Table",
    "gameNo": 3,
    "handStep": 6,
    "stepName": "DEAL_FLOP",
    "dealerSeat": 2,
    "smallBlindSeat": 3,
    "bigBlindSeat": 4,
    "communityCards": ["JH", "7D", "2C"],
    "pot": 3.00,
    "sidePots": [],
    "move": 0,
    "status": "in_progress",
    "smallBlind": 1.00,
    "bigBlind": 2.00,
    "maxSeats": 6,
    "currentBet": 0,
    "winners": []
  },
  "players": [
    {
      "playerId": 1,
      "username": "Alice",
      "seat": 1,
      "stack": 150.00,
      "bet": 0,
      "totalBet": 0,
      "status": "1",
      "action": "",
      "cards": ["AH", "KD"],
      "handRank": "",
      "winnings": 0
    }
  ]
}
```

### Player Status Codes

The `status` field is a string:

| Code | Meaning |
|------|---------|
| `"1"` | Active |
| `"2"` | Sitting Out |
| `"3"` | Leaving |
| `"4"` | Show Cards |
| `"5"` | Post Blind |
| `"6"` | Wait for BB |
| `"11"` | Folded |
| `"12"` | All-In |

### Testing

- **Unit tests** on the API client (mock HTTP responses, verify deserialization)
- **Unit tests** on data models (verify JSON parsing, edge cases like empty arrays, missing fields)
- **Unit tests** on game state logic (phase detection, showdown logic, winner identification)
- Use Unity Test Framework (NUnit-based) — tests should run in Edit Mode without requiring Play Mode

### Skeleton Scripts

The `unity-client/Scripts/` directory provides starter files:

| File | Purpose |
|------|---------|
| `Api/PokerApiClient.cs` | REST client with endpoint methods — fill in the implementation |
| `Models/GameState.cs` | C# classes for the `game` portion of the API response |
| `Models/PlayerState.cs` | C# class for the `players` array items |

These are **starting points**, not final implementations. Extend, refactor, or replace them as needed.

---

## Suggested Architecture

### Project Structure

```
Assets/
├── Scripts/
│   ├── Api/
│   │   └── PokerApiClient.cs       # REST client (UnityWebRequest)
│   ├── Models/
│   │   ├── GameState.cs             # Game data model
│   │   ├── PlayerState.cs           # Player data model
│   │   └── TableResponse.cs         # Top-level API response wrapper
│   ├── Managers/
│   │   ├── GameManager.cs           # Orchestrates game flow
│   │   └── TableStateManager.cs     # Tracks and manages state
│   ├── UI/
│   │   ├── TableView.cs             # Renders the table felt and layout
│   │   ├── SeatView.cs              # Per-seat UI (name, stack, cards, bet)
│   │   ├── CardView.cs              # Single card rendering
│   │   ├── CommunityCardsView.cs    # Center community cards
│   │   ├── HudView.cs              # Phase label, hand number, pot
│   │   ├── ControlsView.cs         # Next Step, Auto Play, Speed buttons
│   │   └── HandHistoryView.cs      # Scrollable action log
│   └── Utils/
│       ├── CardUtils.cs             # Parse "AH" → rank + suit, color mapping
│       └── MoneyFormatter.cs        # Format floats as "$150.00"
├── Scenes/
│   └── PokerTable.unity             # Main scene
├── Resources/                        # Card sprites, fonts, etc.
└── Tests/
    └── EditMode/
        ├── ApiClientTests.cs
        ├── GameStateTests.cs
        └── CardUtilsTests.cs
```

### State Flow

```
User clicks "Next Step"
  → PokerApiClient.ProcessStepAsync(tableId)
  → PokerApiClient.GetTableStateAsync(tableId)
  → TableStateManager updates current state
  → Event fires: OnTableStateChanged(TableResponse)
  → All UI views update from the new state
```

### Card Parsing

Cards from the API are strings. Parse them:

```csharp
// "AH" → rank="A", suit="H"
// "10D" → rank="10", suit="D"
string suit = card[^1..];           // last character
string rank = card[..^1];           // everything before last
bool isRed = suit == "H" || suit == "D";
```

### Showdown Detection

Cards should be face-down until showdown:

```csharp
bool isShowdown = game.HandStep >= 12; // AFTER_RIVER_BETTING_ROUND
bool showCards = isShowdown || player.Winnings > 0;
```

---

## Acceptance Criteria

### Must Have (core)

- [ ] Poker table renders with 6 player seats arranged around a felt surface
- [ ] API client connects to holdem-processor at `localhost:3030`
- [ ] `POST /process` advances the hand by one step
- [ ] `GET /table/{tableId}` fetches and displays current state
- [ ] Community cards appear incrementally (3 flop, 1 turn, 1 river)
- [ ] Hole cards are face-down during play, revealed at showdown
- [ ] Player name, stack, bet, and action display correctly at each seat
- [ ] Pot amount updates in the center of the table
- [ ] Dealer / SB / BB position badges display correctly
- [ ] Winner highlighting with hand rank text and payout amount
- [ ] Stack amounts reflect winnings after payout
- [ ] Next Step button triggers one state advance
- [ ] Phase label shows current hand step in human-readable text
- [ ] Unit tests on API client and data model deserialization
- [ ] Docker Compose `engine` profile starts the backend, Unity project connects to it

### Should Have

- [ ] Auto-play mode with configurable speed (at least 3 speed options)
- [ ] Card flip or reveal animation at showdown
- [ ] Smooth transitions on stack and pot amount changes (tween/lerp)
- [ ] Phase label animates or highlights on step change
- [ ] Multiple consecutive hands play through seamlessly
- [ ] Hand history log showing step-by-step actions
- [ ] Error handling for API failures (connection refused, timeout, server error) with user-visible feedback
- [ ] Hand number display

### Could Have (bonus)

- [ ] Card sprites or custom card rendering (not just text on rectangles)
- [ ] Chip stack visualization (stacked chip graphics proportional to stack size)
- [ ] Sound effects (card deal, chip clink, winner fanfare)
- [ ] Responsive layout for different resolutions / aspect ratios
- [ ] Player avatar placeholders (colored circles, initials, or icons)
- [ ] Deal animation (cards fly from deck to seats)
- [ ] Shuffle animation between hands
- [ ] WebSocket integration with cash-game-broadcast for real-time updates (instead of polling)
- [ ] Reset button to start a fresh hand
- [ ] Configurable table ID (connect to different tables)

---

## Out of Scope

- Betting UI / player input (the hand auto-plays all betting decisions)
- Multiplayer networking / real-time game client
- Authentication / lobby / table selection
- Mobile deployment / platform-specific builds (Editor play is sufficient)
- Game engine or processor modifications
- Production deployment
- Omaha support (Hold'em only)

---

## Key Considerations

These aren't all required, but thinking about them shows engineering depth:

1. **Async/await vs. Coroutines**: Unity's `UnityWebRequest` is coroutine-based. You can wrap it in `async/await` using `TaskCompletionSource` or use UniTask. Either approach is fine — pick one and be consistent.

2. **JSON deserialization**: `JsonUtility` doesn't support nested arrays or nullable types well. Newtonsoft JSON (`com.unity.nuget.newtonsoft-json`) is the recommended approach and matches our production client.

3. **UI system choice**: UI Toolkit is Unity's modern approach but has less community support. uGUI (Canvas-based) is battle-tested. Either is acceptable — justify your choice in the README.

4. **Card face-down logic**: The API always returns card data in the `cards` array. It's the client's responsibility to decide when to show or hide them based on the current `handStep`.

5. **API failure resilience**: The Docker containers take a few seconds to start. Handle the case where the API isn't ready yet — show a connection status, retry, or display an error.

6. **Separation of data and display**: Don't put API call logic in MonoBehaviour `Update()`. Keep the data layer clean and testable independently from Unity's rendering lifecycle.

---

## Getting Started

1. Start the backend: `docker compose --profile engine up -d`
2. Verify the API: `curl http://localhost:3030/health`
3. Create a new Unity project (2022.3+ LTS or Unity 6)
4. Copy the skeleton scripts from `unity-client/Scripts/` into your project's `Assets/Scripts/`
5. Install Newtonsoft JSON: Window > Package Manager > Add by name > `com.unity.nuget.newtonsoft-json`
6. Build the scene: create a Canvas, add the table layout, wire up the API client
7. Hit Play, click Next Step, and watch the hand progress
8. Study `ui/index.html` for reference — it does exactly what you're building, just in vanilla JS

Good luck.
