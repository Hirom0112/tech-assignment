# Handoff — 4-persona demo cast (date-stable) + PI-1
STATUS: OPEN · 2026-06-07 ~16:02 · branch: main · last commit: e045417

> Extends (does NOT supersede) `HANDOFF.md` (core S0–S10 + BL COMPLETE, 190 tests)
> and the two prior HANDOFFS. This session: a leftover-bug fix (PI-1) and a
> deliberate demo-data redesign. Backend service code untouched; changes are the
> seed script + one frontend label. **Nothing pushed.**

## What shipped this session (2 commits, tree clean)
1. **`0657c04` — PI-1 closed.** `scripts/init-dynamodb.sh` now creates all 4 streaks
   tables (added `streaks-rewards` + `streaks-freeze-history` with the compose-
   matching frozen key schema). Verified on a clean DynamoDB Local: all 4 created,
   idempotent re-run reports `Exists:`. TODO.md ticked; README "what we'd do next"
   updated. (The live stack/CI always had all 4 via docker-compose; this only fixed
   the standalone helper.)
2. **`e045417` — 4-persona demo cast, date-stable.** Replaced the 10 random-walk
   seed players with 4 curated personas (audit-driven: a 3-agent robustness map
   found the old 10 were mostly redundant). Each persona = an explicit per-day
   SCRIPT over the demo month, interpreted by the same streak/freeze/reward math as
   the live service. Verified live (API + in-browser screenshots of all 4).
   - `streak-001` **The Grinder** — all 5 calendar states, populated rewards+freeze, login 12/play 3.
   - `streak-002` **The Legend** — login 95/play 90 (max milestone both axes), full reward ladder 3→90.
   - `streak-003` **The Newcomer** — empty rewards/freeze states, "1 day to first reward".
   - `streak-004` **The Comeback** — best 47 ≫ current 6, a break, login ≫ play, glory-day milestones.
   - Ids kept `streak-001..004` so the demo default + 190 tests stay green; only
     `username` + the login picker labels changed. Legacy `streak-005..010` are
     wiped on re-seed. Frontend typecheck clean, 37/37 vitest pass.

## ⚠️ OPEN CAVEAT TO ADDRESS LATER — demo "Check in today" button is date-sensitive
**What:** the dashboard is fully date-STABLE for *viewing* (all data anchored to
`2026-04`, `SEED_ANCHOR_DATE=2026-04-30`, calendar defaults to `VITE_DEMO_MONTH=
2026-04`). BUT the **"Check in today"** button is a LIVE mutation: it computes the
streak gap from the persona's stored `lastLoginDate` (April) to the **real** UTC
day. Since real "today" is June+, clicking it sees a huge gap → the streak **resets
to 1 / shows broken**. So a live check-in on camera looks bad.

**Why it's not fixed now:** it's a demo-ergonomics issue, not a correctness bug —
the live streak/freeze logic is behaving exactly as designed (gap → reset). Fixing
it means deciding HOW we want the demo to behave, which is a product call.

**Options when we address it (pick one):**
1. **Don't click it in the video** (zero code; the static dashboard is the deliverable). Simplest.
2. **Freeze "today" for the demo** — add a `STREAKS_NOW`/`X-Demo-Date` override read
   by the single `utcDay()` helper (`streaks-api/src/lib/utc.ts`) so the whole API
   treats `2026-04-30` as today. Then a check-in advances The Grinder 12→13 cleanly
   on camera. Cleanest demo, but touches the live day-source (Inv. 1 — keep it the
   ONE helper, env-gated, off by default so prod/tests are unaffected).
3. **Re-anchor the seed to the real current date at seed time** — makes check-in
   work today but RE-BREAKS date-stability (the thing we just fixed). Rejected
   unless the demo is recorded and viewed same-day.

Recommendation: **#1 for the video now**, **#2** if we want a live check-in moment.

## State / how to run
- Stack was up this session (dynamodb:8000, api:5001, frontend:4001). Re-seed:
  `node scripts/seed-streaks.js` (idempotent, wipes legacy ids).
- Demo target: any of the 4 personas via the login picker; The Grinder (`streak-001`,
  the default) is the all-5-states showcase. Calendar opens on `2026-04`.
- Screenshots taken this session were `/tmp/persona-*.png` (not committed).

## Still open (unchanged from prior handoffs)
- **PUSH + deliver** — nothing pushed; deliverable is one clean PR vs the skeleton's
  `main`. This skeleton's only remote is `origin` = github.com/hijack-poker/tech-
  assignment; the "push to both remotes" memory does NOT apply here. Needs user go-ahead.
- **Real-Safari autoplay check** (from `2026-06-07-1530` handoff) — verify in the
  actual Safari app; add a poster/"tap to start" fallback if it still won't autoplay.
- **More login art** may arrive (`[[hijack-poker-asset-sources]]`).

## Pointers
- Memory: `[[hijack-poker-demo-personas]]` (NEW, captures the cast + date-anchor),
  `[[hijack-poker-streaks]]`, `[[hijack-poker-login-themes-backlog]]`.
- Seed logic: `scripts/seed-streaks.js` (persona scripts + interpreter at top; day
  codes P/L/F/X/.). Login picker: `streaks-frontend/src/components/LoginScreen.tsx`.
