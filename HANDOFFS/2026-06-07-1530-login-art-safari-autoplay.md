# Handoff — Login art polish + Safari/autoplay fixes
STATUS: OPEN · 2026-06-07 ~15:30 · branch: main · last commit: a10607f

> Extends (does NOT supersede the content of) `HANDOFF.md` (core build S0–S10 + BL
> COMPLETE, 190 tests) and `HANDOFFS/2026-06-05-2230-cinematic-intro-and-login-redesign.md`.
> This session was entirely **frontend art + intro/video behavior**, driven live by the
> user with headless-browser verification. Backend untouched.

## What was worked on (with evidence)
All in ONE commit `a10607f` ("feat(streaks-frontend): cinematic login art + Safari/autoplay fixes"). Tree clean. **Nothing pushed.** Frontend: typecheck clean, **37/37 vitest tests pass** (was 38 — removed one obsolete sound-toggle test). Stack still up (frontend:4001, api:5001, dynamodb — `docker compose ps` shows 4h uptime).

**Login art (`src/components/LoginScreen.tsx` + `public/assets/login/`):**
- New **plaque** = tin-frame transparent art (`plaque.png`, 1000×1378), aspectRatio updated to `1000/1378`.
- New **Sign Up pill** (`btn-signup.png`) and new ornate **lounge banner** (`lounge-banner.png`, NEW file). Sign In/Sign Up PNGs re-padded to **identical footprint** (860×166 canvas, 844×150 content, 8px gaps) → both render the same size.
- **Layout baked from the live `?edit` tool** (which was added then fully removed this session). Current baked values in LoginScreen.tsx: plaque `left36.9% top8.6% w30.5%`; chips `4.8%/72.9%/26%`; cards `73.2%/83.2%/24%`; signin `21%/55%/61.5%`; signup `21%/70%/61.5%`; banner `31.7%/89.4%/42.1% rotate(-2deg) scaleX(1.2)`; picker `84.6%/1.8%`.
- **Both buttons rotated −0.75°** (same value) so they look identical + match the plaque's perspective tilt.
- **Plaque de-haloed**: the PNG had a baked near-black feathered alpha ring (team-confirmed ~31k partial-alpha px, mean RGB ~17,14,14). Removed via 2× ffmpeg alpha `erosion`. Also softened the container `filter` from `drop-shadow(0 24px 50px rgba(0,0,0,0.6))` → `drop-shadow(0 5px 14px rgba(0,0,0,0.28))`.
- **Hover glow** rewritten from a square `box-shadow` to a shape-hugging `drop-shadow` filter (colored only, no black blob); `plaqueButtonSx(accent, framed, rot)` now takes a rotation arg.

**Intro (`src/components/intro/`):**
- **All audio removed**: deleted `useIntroSound.ts`, the sound toggle button, and `public/assets/audio/*.mp3` (3 files). Video was already muted → intro is silent, no audio control.
- **Deterministic race-free autoplay** in `HorseGallop.tsx`: one idempotent `tryPlay()` (no-ops if `!v.paused`), `cancelled` guard so StrictMode double-mount can't leave a stale `play()` racing, retries on `canplay`/`loadeddata`, first-gesture fallback, `muted` set in a **ref callback** (before Safari's autoplay gate), `preload="auto"`. Verified **6/6 plays in Chromium AND 6/6 in WebKit** across cold loads.
- **Back button → intro**: `OpenSequence` finish changed from `navigate('/login', {replace:true})` → `navigate('/login')` (push). Verified headless: skip→login→Back→/intro replays; sign-in→dashboard→Back→/intro replays; reload-on-login→Back→/intro replays.

**Assets housekeeping (outside repo):** consolidated all high-res source originals into `~/Desktop/HIJACK_ASSETS/` (added tin-8K plaque, sign_up v2, highrollers plate). Trashed 4 superseded Downloads sources + 1 redundant intro video. See memory `[[hijack-poker-asset-sources]]`.

## What's still needed — and WHY
- **PUSH + deliver.** Nothing is pushed; deliverable is "one clean PR vs the skeleton's `main`" (CLAUDE.md). WHY not done: outward-facing, needs user go-ahead. NOTE the skeleton's only remote is `origin` = github.com/hijack-poker/tech-assignment — the standing "push to both remotes" memory does NOT apply to this skeleton (confirm before pushing).
- **User to verify in REAL Safari** (hard-refresh / new tab). WHY it matters: every Safari fix this session was verified in Playwright **WebKit (the engine)**, which CANNOT reproduce the Safari *app's* Low Power Mode or per-site Auto-Play setting. If the video still won't autoplay after a clean reload, those OS/app settings are the cause — the agreed next step is a poster + "tap to start" fallback so the cinematic never depends on autoplay.
- **PI-1** (pre-existing): `scripts/init-dynamodb.sh` creates 2 of 4 tables. Trivial, not used by CI/compose.
- **More login assets coming** (user said so) — `HIJACK_ASSETS/` stays on Desktop during dev; vendor into repo + `.gitignore` at project end (`[[hijack-poker-asset-sources]]`).

## Next actions (exact)
1. If user says push: confirm remote(s), then `git push origin main` (pre-push hook runs tsc + tests via `core.hooksPath .githooks` — never `--no-verify`).
2. If Safari still fails after a real hard-refresh: in `HorseGallop.tsx`, add a visible poster/"tap to start" affordance gated on an autoplay-blocked state (detect via the `play()` rejection being `NotAllowedError`), so playback never requires autoplay.
3. When new art arrives: drop in `~/Desktop/HIJACK_ASSETS/`, web-optimize into `public/assets/login/`, and (for plaque-anchored items) position via the same %/rotation pattern in `LoginScreen.tsx`.

## Gotchas / environment state
- **The `?edit` drag-to-position tool was added and fully REMOVED this session** — don't look for it; values are already baked into LoginScreen.tsx. Re-adding it is documented in this conversation if needed again.
- **WebKit headless ≠ Safari app.** It autoplays video fine; it does NOT model Low Power Mode / Auto-Play site settings. Don't claim "Safari works" from WebKit alone.
- **Repeated "still broken" reports were stale browser bundles.** Vite HMR can leave a long-open tab partially updated (esp. router push/replace + filter changes). Tell the user to fully close the tab / `Cmd+Shift+R`, not just refresh.
- **ffmpeg can't write its own input file** — process to a temp path then `mv`.
- **Transparent-PNG preview trap** (from prior handoff still true): the Read image tool composites alpha on black; verify alpha with `ffprobe`/sampling before declaring a bg opaque.
- **Stack is up** (4h). Intro/login don't need backend; Sign In → dashboard does (api + seeded dynamodb). Reseed: `node scripts/seed-streaks.js`.
- **Dev server sends `Cache-Control: no-cache`** for assets → per-load revalidation adds variable latency (was a red herring in the autoplay investigation; the readiness-retry now absorbs it). Range support is fine (206).
- Headless screenshot/automation: playwright at `/Users/hirom/.npm/_npx/5e2e484947874241/node_modules/playwright`; chromium uses `channel:'chrome'` + `--autoplay-policy=no-user-gesture-required`; webkit needs no flag.

## Pointers
- TODO.md: core S0–S10 `[x]`; BL login/themes block is the area in play (heavily iterated this session). PI-1 still open.
- Prior handoffs: `HANDOFF.md` (core-complete) and `HANDOFFS/2026-06-05-2230-...` (intro/login redesign) — this extends both, supersedes neither.
- Memory: `[[hijack-poker-asset-sources]]` (NEW), `[[hijack-poker-login-themes-backlog]]`, `[[hijack-poker-streaks]]`.
- Two multi-agent investigations this session (read-only) diagnosed: (a) the plaque frame shadow = CSS drop-shadow + baked PNG halo; (b) intermittent autoplay = StrictMode double-mount + swallowed play() promises + media-readiness race. Both fixes are in `a10607f`.
