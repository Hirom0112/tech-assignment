# Handoff — Cinematic app-open + login redesign (frontend polish)
STATUS: OPEN · 2026-06-05 ~22:30 · branch: main · last commit: bbcf07d

> Supersedes nothing in content but EXTENDS `HANDOFF.md` (commit 64c02a4), which records the
> **core build S0–S10 + BL = COMPLETE, 190 tests**. That is still true. This session was all
> **frontend bonus/polish** driven live by the user: the redesigned cinematic intro and a
> from-real-assets login rebuild. Backend untouched this session (still 161 green).

## What was worked on (with evidence)
All commits on `main`, tree clean, nothing pushed.

**Cinematic app-open (`serverless-v2/services/streaks-frontend/src/components/intro/`):**
- `2531b1b` first 3-beat open (horse video → logo+chip → login).
- `00e6bd7` re-cut the horse clip to gallop-only with a 1.2× punch-in; added `resolve.dedupe:['react','react-dom']` in `vite.config.ts` to kill a "more than one copy of React" warning from the lazy framer-motion chunk.
- `1daf14d` restructured into an **interactive staged ride** (idle → logo → tap-wait → run-off).
- `dfbece6` a direct/refreshed `/intro` always replays (refresh = restart); `introSeen` now only governs the auto-redirect.
- `95877c2` **app starts logged-out** so `localhost:4001` (root) opens the cinematic from the top (was auto-login as streak-001 → straight to dashboard). `store.ts` initial auth = `{playerId:null, isAuthenticated:false}`; `App.tsx` `RequireAuth` → `/intro` when unauth.
- `389d9f4` Beat 1 became ONE looping gallop video.
- `f33dc7e` **killed the teleport**: the clip is a gallop-in-and-arrive shot (decelerates to a stand by ~2.3s, 2.6s long) so looping snapped it back — now plays ONCE + holds last frame, and **replays on tap** (sets currentTime=0, play) while the recede transform carries it off. Verified via headless: currentTime climbs to 2.67 then holds, never resets.
- `519d704` **Safari fix**: MP4 `<source>` before WebM in `HorseGallop.tsx` (Safari stalls on VP9 webm).
- `3ca309b` logo lockup moved to **top-right, stacked (wordmark over chip), bigger**; **Skip button removed** (advance via tap/Enter/Space, Esc silent accelerator); **sound toggle moved to top-left**.
- Component shape: `OpenSequence.tsx` (orchestrator, renders LoginScreen underneath and dissolves to it), `HorseGallop.tsx` (the single `<video>` — idle/logo/await/exit), `LogoReveal.tsx`, `useSequencer.ts` (idle→logo→await→exit machine, 12s safety auto-advance, reduced-motion), `useIntroSound.ts`. Framer Motion lazy-isolated (~28KB gzip in `OpenSequence-*.js`, **0 in the dashboard `index-*.js`** — verified each commit).

**Login rebuild from the user's real art (`src/components/LoginScreen.tsx`):**
- `2cfe879` rebuilt from real assets: `wall.jpg` full-bleed → CSS lamp glow/vignette → centered `plaque.png` hero (HIJACK POKER + ace pip + "Est. 2023" footer baked in) → real gold **Sign In** + silver **Sign Up** image-buttons on the plaque's blank panel → "Signing in as <select>" picker (default streak-001). **Theme switcher removed from login** (stays on dashboard). Alive-button CSS: hover lift+glow+gleam-sweep, active press, offset idle `bob`, reduced-motion guard, focus ring.
- `e1ac622` login polish: fixed buttons shoving right (the `bob` keyframe was overriding `translateX(-50%)` — now baked into the keyframe); plaque shrunk (`height:68vh, maxHeight:610`) for a bigger room; both button PNGs normalized to identical 860×200 so Sign In/Sign Up are the **exact same rendered size** (259×60).
- `bebeded` (then reverted by `bbcf07d`) — I WRONGLY removed the chips/cards props thinking they had black backgrounds.
- `bbcf07d` **re-added chips/cards props** — they ARE transparent (corner alpha=00); the image-preview tool composited them on black and fooled me. Verified by sampling alpha + compositing over felt. chips bottom-left, cards bottom-right, `zIndex:1` behind the plaque, `pointer-events:none`.

## What's still needed — and WHY
- **Sign Up button asset, correct proportions** — the user's `sign_up_button_hd.png` is 3.3:1 but Sign In is 5.5:1, so to be the same size the Sign Up is currently **stretched** (and silver-on-silver-metal reads a bit faint). WHY not done: needs a re-generated 5.5:1 transparent asset from the user — a generation prompt was given to them (see Gotchas). Drop replacement in `~/Desktop/HIJACK_ASSETS/`, re-stage to `public/assets/login/btn-signup.png` at the SAME dims as btn-signin, done.
- **Pendant lamp** — currently a CSS radial glow stand-in; WHY: no lamp asset provided. A transparent lamp PNG would replace the glow (top-center).
- **`COLORS.txt` blank** — I sampled brand hex from the art (gold `#D9A441`/`#F1D98C`, brass `#C9A24B`, parchment `#F3E6CC`/`#C9B68F`, dark `#1B130C`). WHY: user left it blank; only matters for exact picker/focus accents.
- **Safari "white blank page" — UNRESOLVED/UNREPRODUCED** — user reported it; headless WebKit renders the scene fine (no JS errors), so it's likely Safari catching the dev server **mid-restart** (restarted ~20×) or stale cache. WHY open: couldn't reproduce; advised a hard reload. If it recurs: get the Safari version, and/or `vite build` + `vite preview` to test prod (rules out the dev server).
- **Truly continuous gallop** — the current clip CAN'T loop (travel-and-arrive, teleports). WHY: needs a **seamless in-place gallop-loop** clip from the user; noted as a `// SWAP` in `HorseGallop.tsx`.
- **Final chip + wordmark for the intro** — still the traced `chip-hj.svg` placeholder + a Rye/Smokum Google-font wordmark; `// SWAP` markers in place. Real `chip-hj.png`/sprite + `wordmark-hijack-poker.svg` go in `~/Desktop/HIJACK_ASSETS/intro/`.

## Next actions (exact)
1. **When the user drops a 5.5:1 transparent `sign_up` asset** in `~/Desktop/HIJACK_ASSETS/`: `ffmpeg -i <new> -vf scale=860:200 public/assets/login/btn-signup.png` (same dims as btn-signin so they stay identical), then render `localhost:4001/login` headless to confirm no distortion. No code change needed.
2. **Intro final art** when provided: replace `public/assets/intro/`… actually chip is `public/assets/chip-hj.svg` (swap the `<img src>` in `LogoReveal.tsx`) and the wordmark block (LogoReveal) — `// SWAP:` markers mark both.
3. **If Safari blank recurs**: `cd serverless-v2/services/streaks-frontend && npm run build && npx vite preview --port 4100` and load in real Safari; if prod works, it's a dev-server/Safari issue (document, low priority for the deliverable).

## Gotchas / environment state
- **Transparent-PNG preview trap (important):** the Read image tool composites transparent PNGs on BLACK, so an alpha PNG looks like it has a black background. ALWAYS verify with `ffprobe`/alpha-sample before declaring a background opaque — I burned two commits (`bebeded`→`bbcf07d`) on this.
- **Asset drop folder:** `~/Desktop/HIJACK_ASSETS/` (intro/, login/, fonts/, audio/, README.md checklist, COLORS.txt). The user's provided login art (6 files) is in the folder root; I web-optimized copies into `streaks-frontend/public/assets/login/` (wall.jpg, plaque.png, btn-signin/up.png, chips.png, cards.png). Intro assets in `public/assets/` (horse-intro.mp4/.webm/-poster.jpg, audio/*.mp3, chip-hj.svg). **The user's Desktop "Screenshot …" files are transient — some got cleared mid-session.**
- **Generation prompt already given to the user** for: matched 5.5:1 transparent Sign Up button, transparent poker-chips, transparent card-deck (in the chat; re-give if asked). Key rule drilled in: "transparent background, PNG with alpha, no baked shadow."
- **Audio is CC0** (BigSoundBank): `public/assets/audio/{horse-gallop,chip-settle,intro-sound}.mp3`. Sound is muted-by-default; toggle (now top-LEFT). Autoplay video is muted (no audio track) so it autoplays.
- **Headless screenshot workflow** (no MCP browser): playwright is at `/Users/hirom/.npm/_npx/5e2e484947874241/node_modules/playwright`; require it with a CommonJS path. Use `chromium.launch({channel:'chrome', args:['--autoplay-policy=no-user-gesture-required']})` to force video autoplay in headless (real browsers don't need it). WebKit channel reproduces Safari engine BUT headless WebKit won't autoplay video (inconclusive for Safari video). Use a **quoted heredoc** for the script — `$(` in selectors triggers bash command-substitution.
- **Stack state:** only `skeleton-streaks-frontend-1` is currently Up. The intro+login don't need the backend; but Sign In → dashboard DOES (needs streaks-api + DynamoDB seeded). Bring the full stack back with `docker compose --profile streaks up -d` then `node scripts/seed-streaks.js`. The docker frontend container HMRs source changes on :4001; **a `vite.config.ts` change needs `docker compose restart streaks-frontend`** (HMR won't re-read config / re-optimize deps).
- **Nothing pushed.** Deliverable is still a PR vs the skeleton's `main` (see prior HANDOFF.md) — awaiting user go-ahead + remote.

## Pointers
- TODO.md: core slices S0–S10 all `[x]`; the **BL-1/2/3 "Login experience + themes" backlog block** is the area in play (now largely built + heavily iterated beyond the original spec this session). PI-1 (init-dynamodb.sh) still open, unrelated.
- Prior handoff: `HANDOFF.md` (root, commit 64c02a4) — the core-complete handoff; this file extends it, does not supersede its content.
- Slice reports: `SLICE_REPORTS/bonus-login-themes.md` + screenshots (`bonus-login.png`, `bonus-theme-*.png`, `bonus-share-card.png`) capture the original BL state before this session's redesign.
- Memory: `[[hijack-poker-login-themes-backlog]]` and `[[hijack-poker-streaks]]` (status = BUILD COMPLETE) in the user's auto-memory.
