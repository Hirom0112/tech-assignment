# Tavern Dashboard — Complete Asset Manifest (exact-match)

Target: the wood-and-brass poker-parlor concept art (`Gemini_Generated_Image_ncgch7ncgch7ncgc.png`).
This lists **every** visual element in that mockup. It's split into:

- **§A — Art you must provide** (textures, ornate frames, painted icons, props). I
  cannot generate these; they're what makes it look hand-crafted.
- **§B — I build in code to match** (CSS/SVG). Send art for these *only* if you want
  pixel-exact; otherwise I'll reproduce them from the palette.

### Where to drop everything
Raw high-res originals → **`~/Desktop/HIJACK_ASSETS/dashboard/`** (this folder is
open). Use the filenames below. I then optimize + vendor them into
`public/assets/dashboard/{bg,frames,icons,deco}/` and wire them up.

**Transparency:** every item marked "transparent PNG" needs a real alpha channel
(cut out, no baked background), exported PNG-32.

Priority: **MUST** = needed for the look · **SHOULD** = strong polish · **DECOR** = scatter/optional.

---

## §A — ART ASSETS YOU PROVIDE

### A1. Backgrounds & surfaces → `dashboard/bg/`
| # | Pri | Filename | What it is | Format / size |
|---|---|---|---|---|
| 1 | MUST | `bg-wood.jpg` | The wood-plank backdrop the whole page sits on | JPG 2560×1440 (or seamless 512² tile) |
| 2 | SHOULD | `panel-leather.png` | Burnished leather/wood fill inside each panel | PNG, seamless 512² |
| 3 | DECOR | `felt-green.png` | Green poker-felt strip seen along the bottom edge | PNG, seamless 512² |
| 4 | DECOR | `bg-vignette.png` | Soft dark edge vignette over the whole board | transparent PNG 2560×1440 |

### A2. Panel frames → `dashboard/frames/`
| # | Pri | Filename | What it is | Format / size |
|---|---|---|---|---|
| 5 | MUST | `frame-panel.png` | The ornate riveted-metal corners + gold edge, **transparent center** (9-slice to every card) | transparent PNG ~900×600, even border inset ≈64px |
| 6 | SHOULD | `frame-toast.png` | The dark teal/navy "Milestone reached!" banner background | transparent PNG ~720×120 |
| 7 | DECOR | `frame-corner.png` | A single corner bracket (alt to #5 — I mirror it ×4) | transparent PNG ~200×200 |

### A3. Hero icons (inside the streak cards) → `dashboard/icons/`
| # | Pri | Filename | What it is | Format / size |
|---|---|---|---|---|
| 8 | MUST | `icon-fire.png` | Flaming brazier/cauldron = **login streak** (the gold number overlays in code) | transparent PNG 512² |
| 9 | MUST | `icon-cards.png` | Fanned hand of aces = **play streak** | transparent PNG 512² |

### A4. Heat-map cell icons (one per state) → `dashboard/icons/`  · all 64×64 transparent PNG
| # | Pri | Filename | State |
|---|---|---|---|
| 10 | MUST | `cell-login.png` | login only — bronze person/bust |
| 11 | MUST | `cell-played.png` | played — bronze fanned-cards |
| 12 | MUST | `cell-freeze.png` | freeze used — **blue flame** |
| 13 | MUST | `cell-broken.png` | streak broken — **red broken-heart** |

### A5. Other glyphs → `dashboard/icons/`
| # | Pri | Filename | What it is | Format / size |
|---|---|---|---|---|
| 14 | SHOULD | `icon-snowflake.png` | Blue **snowflake** (the toast + "Streak freezes" card — note: distinct from the blue *flame* in #12) | transparent PNG 128² |
| 15 | SHOULD | `badge-new.png` | The gold beveled "NEW" badge on reward rows | transparent PNG ~96×48 |
| 16 | DECOR | `emblem-keys.png` | Crossed-keys medallion/brand glyph (header) | transparent PNG 128² |
| 17 | DECOR | `badge-rank.png` | The little leather rank plaque with the gold key (top of header) | transparent PNG ~220×90 |

### A6. Decorative scatter (margins/corners) → `dashboard/deco/` · all transparent PNG
| # | Pri | Filename | What it is | Size |
|---|---|---|---|---|
| 18 | DECOR | `chips-red.png` | Stack of red poker chips | ~256² |
| 19 | DECOR | `chips-green.png` | Stack of green poker chips | ~256² |
| 20 | DECOR | `chips-black.png` | Stack of black/navy poker chips | ~256² |
| 21 | DECOR | `coins-gold.png` | Pile of gold coins | ~256² |
| 22 | DECOR | `coin-single.png` | A single coin (the ones scattered loosely) | ~128² |
| 23 | DECOR | `cards-fan-deco.png` | Loose fanned cards prop | ~300×220 |
| 24 | DECOR | `crossed-keys.png` | Crossed-keys prop (bottom margin) | ~300×220 |
| 25 | DECOR | `crossed-cues.png` | Crossed cue-sticks / tool prop (bottom margin) | ~300×220 |

---

## §B — I BUILD THESE IN CODE (send art only if you want pixel-exact)

These I reproduce from the palette in CSS/SVG; no asset required:

- **Segmented progress bars** (orange glossy fill + ✓ check per segment, dark track,
  "90" end label) — the "Next milestone" bars. *(Optional art: `progress-fill.png`
  glossy-orange pill if you want the exact gloss.)*
- **Freeze toggle dots** (orange glowing "on" + dark "off" radios).
- **Reward-row strips** (rounded leather rows + alternating striping).
- **Scroll arrows** (◄ ►), **tooltip** popup, **heat-map cell slots** (rounded inset
  wells) and the **no-activity** empty cell, the **section labels/dividers**.
- **Fonts** — Cinzel (engraved headings) + Spectral (body) are already wired from
  Google Fonts and match the signage. Only send `.woff2` if you want the exact
  mockup faces, into `public/assets/fonts/`.

---

## The MUST list, distilled (send these 9 first → it reads as the tavern)
`bg-wood.jpg` · `frame-panel.png` · `icon-fire.png` · `icon-cards.png` ·
`cell-login.png` · `cell-played.png` · `cell-freeze.png` · `cell-broken.png`
*(+ `frame-toast.png` / `icon-snowflake.png` close behind for polish)*

Drop them in `~/Desktop/HIJACK_ASSETS/dashboard/` and tell me — I'll vendor + wire the full reskin.
