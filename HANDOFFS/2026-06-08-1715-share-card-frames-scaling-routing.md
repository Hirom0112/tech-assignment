# Handoff — share card, new card frames, uniform scaling, routing/auth, streak-card redesign
STATUS: OPEN · 2026-06-08 17:15 · branch: main · last commit: 4ad85e4

> Extends `HANDOFF.md` (core S0–S10 complete) and supersedes nothing — it continues
> `HANDOFFS/2026-06-07-2120-tavern-reskin-and-visual-editor.md`. This was an entirely
> frontend + share-card + demo-plumbing session. **Nothing was committed** — every
> change below is in the working tree, uncommitted. Branch is 104 commits ahead of origin.

## What was worked on (with evidence)
All verified live in a headless browser (playwright at
`/Users/hirom/.npm/_npx/5e2e484947874241/node_modules/playwright`). Last test runs:
**backend 161/161 (jest), frontend 34/34 (vitest), tsc clean both packages.**

**Asset vendoring (handoff #4)** — uncommitted, files present:
- `design-assets/` ← `~/Desktop/HIJACK_ASSETS` (111M raw originals) + `hijack-poker-company-dossier.md` copied in, both **gitignored** (`.gitignore` M).
- `RESEARCH.md` copied into repo root, **tracked** (resolves the doc-suite's `RESEARCH.md Q3/Q6` citations).

**Dashboard streak cards (`components/StreakCounter.tsx`)** — redesigned to FILL the card:
big uppercase label (26px), hero number (104px, value≥100→78), motif beside it, "Best: N days"
at the bottom, distributed via flex `space-between` over `height:100%`. Removed the duplicate
"12" that was embossed on the flame. Login flame enlarged + livelier (`flameScale(12)`≈1.0,
`flameFlicker` keyframes + stronger ember pulse). Play card: number+ace centered as a group
(`justifyContent: isFlame ? 'space-between' : 'center'`), ace enlarged 88→108.

**New High-Rollers card frames (`components/Panel.tsx`)** — added `variant` prop. 4-corner
frame default; top-2-corner (`frame-2corner.png`) on Next Milestone + Streak Freezes. Vendored
`public/assets/dashboard/frames/frame-4corner.png` + `frame-2corner.png` (downscaled 1600w from
the `-2` clean versions in ~/Downloads), 9-slice `border-image` slice 160 fill, borderWidth 38.

**Reference-driven polish:** freeze status lights (`FreezeStatus.tsx` — amber=available,
blue/grey=active/none; rewritten + its test updated); calendar icon colored glows
(`CalendarHeatMap.tsx`, `GLOW_COLORS`); thicker login/play bars (`MilestoneProgress.tsx` 12→20)
+ thicker gold `Rule.tsx` (2→4px); **ice-flame** icon on Streak Freezes (52px) + **fire-shield**
on Personal Best (90px = 1.5×). Background brightened (`theme.ts`); HIJACK+shield nudged toward
center (ml on header); "June 2026" centered; calendar day-numbers made persistent (fixed a real
`position:absolute`-without-positioned-parent bug).

**Calendar month navigation** — `StreakDashboard.tsx` lifts month to state; prev/next arrows in
`CalendarHeatMap.tsx`; clamps to [current−90d, current], no future; defaults to current UTC month.
`VITE_DEMO_MONTH` emptied (`.env` + `.env.example`) — now an optional initial-month pin only.

**Seed re-anchored to TODAY (`scripts/seed-streaks.js`)** — was fixed `2026-04-30`; now anchors to
`new Date()` over a 95-day range (`RANGE_DAYS`), per-persona code arrays built by generator fns
(`grinderScript()` etc.). Grinder: login=12 play=6 best=30, freeze used in current month;
`lastLoginDate`=today. Freeze "used this month" now month-scoped.

**Demo-safe check-in (`handlers/check-in.ts`)** — env-gated `DEMO_SAFE_CHECKIN` (set `"true"` in
`docker-compose.yml` streaks-api): forces an idempotent no-op for any seeded player so check-in is
safe on ANY day. Real path untouched when off. Verified: POST check-in → streakAdvanced:false,
streak stays 12.

**Auto-seed service (`docker-compose.yml` `streaks-seed`)** — waits for API health, seeds, then
re-seeds nightly ~00:10 UTC. Verified it seeded all 4 personas on `up`.

**Photoreal share card** — `src/lib/hot-streak-plate.ts` (NEW, ~212KB: blank Hot-Streak plate as a
base64 JPEG data URI) embedded in `src/lib/share-card.ts` rewrite (`<image>` + overlaid login/play/
best numbers). Bronze-metallic gradient for login+play, glowing gold for best (glow later
lightened to flood-opacity 0.55). Numbers slanted `+2.6°` to match the card's 3D tilt
(`streakTransform`), streak numbers stretched `scaleY 1.12` (looked compressed). Slot positions
measured off a grid overlay. `share.service.test.ts` rewritten to the new contract (9/9 pass).

**Snackbar fix (`StreakDashboard.tsx`)** — the "already checked in" toast never dismissed (bound to
the mutation's persistent `isSuccess`). Now driven by local `snackMsg` state + `disableWindowBlurListener`.
Verified: auto-dismisses at ~4.3s.

**Routing/auth** — dashboard moved to its own URL `/dashboard` (`App.tsx`, `RootRedirect`); auth
rehydrated from localStorage (`store.ts` `loadAuth()`) so REFRESH stays on dashboard; logout clears
localStorage; intro→login (`OpenSequence.tsx`) and login→dashboard (`LoginScreen.tsx`) now `replace`
so Back doesn't replay the cinematic. Verified: URL=/dashboard, reload stays. `LoginScreen.test.tsx`
route updated.

**Uniform scale-to-fit (`components/ScaleToFit.tsx` NEW)** — wraps the dashboard (designWidth 1440,
`transform: scale()` to viewport, maxScale 1.2). Whole dashboard shrinks/grows as one unit, no
reflow. `StreakDashboard` Container → ScaleToFit + fixed-width Box. Verified at 1000/1440px.

## What's still needed — and WHY
- **Commit + push, then open the PR.** WHY it matters: the deliverable (CLAUDE.md §4) is one clean
  PR vs the skeleton's `main`. WHY not done: everything this session is uncommitted and it's
  outward-facing — needs the user's go-ahead. NOTE: this skeleton's only remote is `origin` =
  github.com/hijack-poker/tech-assignment (the "push to both remotes" memory does NOT apply here).
- **Docs-align pass.** WHY: README/ASSUMPTIONS still say "calendar defaults to 2026-04", describe the
  old freeze panel, and don't mention the new frames, share-card plate, month nav, auto-seed,
  `DEMO_SAFE_CHECKIN`, or scale-to-fit. A reviewer will notice the drift. Owed before delivery.
- **Re-seed before any demo.** WHY: data is now anchored to the seed day (drifts with the clock).
  The auto-seed service + `DEMO_SAFE_CHECKIN` cover most of it, but a fresh `node scripts/seed-streaks.js`
  right before recording keeps the current month un-stale.
- **Demo video + (optional) live link.** WHY: the user plans to record a local demo into the README
  and submit the PR (decided this session). Not yet recorded. Deployment was discussed but NOT built:
  AWS (`serverless deploy`) for the API + Vercel for the frontend is the architecturally-correct path;
  an MSW-baked static build (reuse `src/test/mocks/handlers.ts`) is the zero-backend "merge → live"
  option. A "Deployment notes" README section was offered, not written.
- **3-digit streak numbers are tight** on both the share card (Legend 175 vs the flame) and the
  dashboard cards. WHY deferred: the demo default is the Grinder (12/6/30) which is pixel-clean;
  edge persona only. Shrink-further logic is easy if needed.
- **Login vs play card internal alignment now differ** (login = number-left/flame-right spread;
  play = centered group). WHY: done per explicit user request for the play card only. The user may
  want login to match — confirm before "fixing".
- **Manual "use freeze" button** — decided NOT to build (freezes are automatic per FR-3); the README
  "what we'd do next" note for it isn't written yet.

## Next actions (exact)
1. If delivering: run both suites to reconfirm green (`cd serverless-v2/services/streaks-api && npm test`;
   `cd ../streaks-frontend && npx vitest run`), then commit the working tree in a few logical commits
   (frames+icons; streak-card redesign; share card; routing+scale; seed/check-in/compose; asset vendoring),
   then `git push origin main` (pre-push hook runs tsc+tests; never `--no-verify`), then open the PR.
2. If docs-align first: invoke the `docs-align` skill — sweep README + ASSUMPTIONS for the April
   default, freeze-panel copy, and the missing share-card/frames/nav/scale/auto-seed features.
3. If more visual polish: continue in `components/StreakCounter.tsx` (login/play layout) and
   `src/lib/share-card.ts` (number positions are constants `LOGIN_NUM/PLAY_NUM/BEST_NUM`, `TILT`,
   `SY_STREAK`, `numFontSize`). Re-render with `/tmp/rendercard.mjs` after each change.

## Gotchas / environment state
- **API code changes need a container restart:** `docker compose --profile streaks restart streaks-api`
  (serverless-offline does NOT reliably hot-reload TS). Then poll `curl :5001/api/v1/health` for 200
  (~5–10s). This applies to `share-card.ts`, `check-in.ts`, `seed-streaks.js` effects.
- **Frontend Vite HMR works** (confirmed it serves fresh code by grepping the served module), but
  `docker compose --profile streaks restart streaks-frontend` if it looks stale; playwright does full
  reloads so it gets fresh bundles.
- **Stack:** `docker compose --profile streaks up` → dynamodb-local:8000, api:5001, frontend:4001,
  streaks-seed (auto-seeds). `DEMO_SAFE_CHECKIN: "true"` is set on streaks-api in compose.
- **Share-card rendering:** the SVG embeds a base64 JPEG + `feDropShadow`/gradients, so rasterize it in
  a real browser — `/tmp/rendercard.mjs` reads `/tmp/card.svg` and screenshots `/tmp/card.png`. Measure
  slot positions with an ffmpeg `drawgrid` crop of `/tmp/plate/plate1344.jpg`.
- **Plate regeneration:** `sips -s format jpeg -Z 1344 <plate>.png --out p.jpg && base64 p.jpg` →
  paste into `hot-streak-plate.ts` (it's auto-generated; the regen command is in its header).
- **`ScaleToFit` guards `ResizeObserver`** (absent in jsdom) — don't remove the guard or vitest breaks.
- **Bash cwd resets** to the repo root between some tool calls — use absolute paths or re-`cd`.
- **Seed override:** `SEED_ANCHOR_DATE=YYYY-MM-DD` pins the dataset for reproducible runs.
- **Don't click "Check in today" expecting a streak bump** — with `DEMO_SAFE_CHECKIN` it's an
  idempotent "already checked in today" by design.

## Pointers
- TODO.md: core S0–S10 `[x]`; this session's work is the BL frontend/polish track (not formally in TODO).
- Memory updated this session: `[[hijack-poker-demo-personas]]` (now anchored-to-today + re-seed +
  DEMO_SAFE_CHECKIN note). Also relevant: `[[hijack-poker-streaks]]`, `[[hijack-poker-asset-sources]]`,
  `[[hijack-poker-login-themes-backlog]]`.
- Prior handoffs: `HANDOFF.md` (core complete), `HANDOFFS/2026-06-07-2120-...` (tavern reskin + editor),
  `HANDOFFS/2026-06-07-1602-...` (personas/PI-1). This handoff continues them; none superseded.
- Key files this session: `components/{StreakCounter,Panel,FreezeStatus,PersonalBest,MilestoneProgress,
  Rule,CalendarHeatMap,StreakDashboard,ScaleToFit}.tsx`, `App.tsx`, `store.ts`, `theme.ts`,
  `intro/OpenSequence.tsx`, `LoginScreen.tsx`; `src/lib/{share-card,hot-streak-plate}.ts`,
  `handlers/check-in.ts`; `scripts/seed-streaks.js`; `docker-compose.yml`.
