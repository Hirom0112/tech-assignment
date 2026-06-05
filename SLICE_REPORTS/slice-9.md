# Slice S9 — Bonus: share-card (FR-9) — SLICE REPORT

**Status:** ✅ DONE (director re-verified host + live + rendered card)
**Date:** 2026-06-05 · **Dispatch:** 1 engineer (S9-1..S9-6). Director ran S9-7.

## What shipped
A zero-dep, on-brand SVG streak card endpoint + a dashboard Share affordance. Generation only (no social posting).

## DoD — evidence
| Check | Result | Evidence |
|---|---|---|
| backend `npm test` | ✅ | **161 passed / 19 suites** (+9), clean exit |
| frontend `npm test` + build | ✅ | **29 passed / 11 files** (+3); `tsc && vite build` clean |
| Live SVG card | ✅ | `streak-001` → `200`, `content-type: image/svg+xml; charset=utf-8`, body `<svg…>` with login 2 / play 2 / best 17, `HIJACK POKER`, `Hot Streak`; rendered in `SLICE_REPORTS/bonus-share-card.png` |
| Degrade never 500 | ✅ | zero-state/new player → `200` valid `<svg` (not 500); lib try/catch → `fallbackCard()` |
| `?format=png` honest | ✅ | `400 BadRequest` (no rasterizer built); other formats → 400; no auth → 401 |
| Zero-dep (STND-5) | ✅ | no `satori`/`resvg`; deps unchanged both packages |
| Inv 6/9, STND-3 | ✅ | thin handler (no docClient), strict TS, no console.log |

## Design
`src/lib/share-card.ts` — pure `renderShareCard(state)=>string`, 1200×630 standalone SVG, `safeCount` coercion (non-finite/neg/non-numeric → 0, clamp 365) + `xmlEscape`. Handler `src/handlers/share-card.ts` (player auth, `getPlayer`→`toStreaksResponse`→render; alias mounted). Frontend `ShareButton.tsx` fetches with the `X-Player-Id` header and previews the card in a `<Dialog>` (a bare new-tab nav can't send the auth header) + "open in new tab".

## Commits
- `37d3efe` feat: share-card SVG generator (red→green)
- `dc5a41e` feat: share-card endpoint (svg, degrade-never-500)
- `1cfb9b0` feat(frontend): dashboard Share affordance
