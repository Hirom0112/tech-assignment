# RESEARCH.md — Hijack Poker "Daily Streaks" (Option C)

**Date:** 2026-06-05
**Purpose:** Ground the facts before building the Option C *Daily Streaks* feature (React + Lambda + DynamoDB + REST) against the Hijack Poker skeleton repo.
**Standard:** every claim is **VERIFIED** (primary/authoritative source + URL), **INFERRED** (reasoning chain stated), or **UNVERIFIED/UNKNOWN** (couldn't confirm / aggregator-only).

---

## Decision questions

1. How do proven apps (Duolingo, Snapchat, casino apps) define a streak "day," activity, increment/reset — and what maps to *independent* login vs. play streaks?
2. How should **streak freezes** behave (limits, auto-consume, repair) based on proven designs?
3. What are the right patterns for an **idempotent check-in** + **UTC day-boundary** math, covering the PRD's edge cases?
4. What's the right **DynamoDB data model** (PRD's 4 tables vs. single-table) and how do we query a month for the heat map?
5. **Frontend:** `react-calendar-heatmap` vs. build-from-scratch, against React 18 + MUI + Redux Toolkit + Vite? What's the idiomatic data-fetching layer?
6. Is the **company/PRD context** accurate enough to tie the README to Hijack's real engagement strategy, and is the skeleton stack as described?

---

## Q1 — Streak mechanics: how the leaders define a "day"

### Verified
- **Duolingo** = "consecutive days you've completed a lesson." They deliberately *decoupled* the streak from the daily XP goal — a single lesson extends it; this raised 7+ day streaks >40% and day-14 retention +3.3%. → *Lesson for us: keep the bar to "extend the streak" low and unambiguous (one login / one completed hand).* Sources: https://blog.duolingo.com/improving-the-streak/ , https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- **Duolingo day boundary** is evaluated at **midnight in the device's current time zone** (vacation guidance + the documented clock-change exploit). Sources: https://blog.duolingo.com/how-to-keep-your-streak-on-vacation/ , https://duolingo.fandom.com/wiki/Streak (rung-3, corroborates the rule + the exploit).
- **Snapchat Snapstreak** uses a **rolling ~24-hour "every day"** window (both users must exchange a *photo/video* Snap; text doesn't count); an **hourglass** warns of imminent expiry; only **recently-expired** streaks can be restored. Sources: https://help.snapchat.com/hc/en-us/articles/7012394193684 , https://help.snapchat.com/hc/en-us/articles/7012318024852
- **Casino/poker apps** use a *different* shape: a **short fixed ladder** (Zynga = 7 days + a "Final Reward"), escalating daily payouts, and an **all-or-nothing hard reset** on any miss ("If you skip a day, you won't be able to claim any previous rewards or the Final Reward"). Source: https://store.zyngapoker.com/daily-streak . WSOP app: "Claim daily chip rewards just for logging in. The longer your streak, the bigger the daily rewards." Source (rung-2 editorial): https://www.pokernews.com/free-online-games/play-wsop/wsop-rewards.htm
- **Milestone celebration design** (Duolingo): discrete celebrated thresholds (7 / 30 / 50 / 100 / 365) with an outsized terminal payoff and a **shareable card** over a claim button. Source: https://blog.duolingo.com/streak-milestone-design-animation/

### Inferred
- Our PRD sits **between** the two models: open-ended counters with freeze/repair safety valves (Duolingo-style) **but** poker-flavored milestone *point* rewards (casino-style). The PRD's milestone ladder (3/7/14/30/60/90) and "claim-once-per-milestone-per-streak" semantics are the casino "earn it again after reset" pattern — consistent with both worlds.
- The PRD **fixes the ambiguity these apps leave open**: it mandates a **UTC calendar day** (00:00–23:59 UTC), not device-local midnight and not a rolling 24h window. This is *simpler and exploit-resistant* (no device-clock attack), and is the single most important invariant to enforce everywhere. **Build to UTC calendar day, full stop.**
- Independent login vs. play streaks have no direct public precedent in one app; modeling them as **two parallel counters over the same daily-activity record** is the clean approach (one `loggedIn` + one `played` boolean per UTC day).

### Unverified / open
- Duolingo's exact streak-freeze caps, repair pricing, and "Streak Society" perks — official help pages are JS-rendered and not machine-fetchable; only third-party (rung-3) numbers exist. Not needed for our build (our freeze rules are PRD-specified).
- Snapchat's numeric grace period / restore window — not published by Snapchat.

---

## Q2 — Streak freeze design

### Verified
- **Duolingo Streak Freeze** = "hit pause on your streak for a day"; you can **equip up to two**; purchased *in advance* with gems and **auto-consumed** on a missed day (it preserves, doesn't advance, the streak). Sources: https://blog.duolingo.com/how-duolingo-streak-builds-habit/ ; freeze-purchase phrasing via the official help page (JS-rendered, rung-2 extract) https://www.duolingo.com/help/what-is-a-streak
- **Streak Repair/Restore** exists as a *paid, after-the-fact* recovery (distinct from a pre-equipped freeze). Snapchat's equivalent only restores *recently* expired streaks. Sources above + https://help.snapchat.com/hc/en-us/articles/7012318024852
- **Pitfall — streak anxiety / confirmshaming:** documented dark-pattern risk; endorsed mitigations are exactly *freeze amulets, grace periods with no hidden penalties, and effort-based "Earn Back."* Source (rung-3 design analysis): https://uxmag.com/articles/the-psychology-of-hot-streak-game-design-how-to-keep-players-coming-back-every-day-without-shame

### Inferred / implications
- The PRD's freeze rules are a **simpler, fairer subset** of Duolingo's model and we should implement them verbatim: **1 free freeze/month**, additional via admin grant, **auto-consumed on a missed day**, protects **1 missed day**, applies to **both** streaks simultaneously, consumed at **01:00 UTC next day** if no activity — with **lazy evaluation on next check-in being explicitly acceptable** (scheduled Lambda is bonus).
- Duolingo's "equip up to 2 / auto-consume" precedent **validates** the PRD's auto-consume design — we're not inventing mechanics, we're following an established, retention-positive pattern.
- Edge case the PRD calls out and precedent confirms: a freeze covers **one** missed day only; **two** missed days → freeze covers the first, streak still resets on the second.

---

## Q3 — Idempotent check-in + UTC day math

### Verified
- **Conditional write is the idempotency primitive.** `PutItem`/`UpdateItem` with `ConditionExpression "attribute_not_exists(SK)"` succeeds only if the item doesn't exist; AWS states conditional writes are **idempotent when the condition is on the attribute being written** (safe to retry after an unknown-outcome network error). Source: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html
- **Atomic counters (`ADD` / `x = x + :n`) are NOT idempotent** — a retried increment double-counts. Use a **conditional UpdateItem** instead for an exact streak count. Source: same page.
- **Powertools idempotency** (`@aws-lambda-powertools/idempotency` + `@aws-sdk/lib-dynamodb`) wraps a handler with `makeIdempotent(...)`, keys off a payload hash or an `eventKeyJmesPath` subset, with TTL/`status`(INPROGRESS/COMPLETE) tracking. Source: https://docs.aws.amazon.com/powertools/typescript/2.1.1/utilities/idempotency/ and https://aws.amazon.com/blogs/compute/implementing-idempotent-aws-lambda-functions-with-powertools-for-aws-lambda-typescript/
- **Luxon handles UTC cleanly:** `DateTime.utc()` constructs in UTC, `.toISODate()` → `'2026-02-20'`, `.minus({days:1})` is DST/leap-safe, `.diff(other,'days')` for spans. Source: https://moment.github.io/luxon/api-docs/index.html . **date-fns base operates in local time** — needs `date-fns-tz` for zone-correct math (more error-prone for pure-UTC logic). Source: https://www.npmjs.com/package/date-fns-tz

### Inferred — the recommended design
- **The UTC date string *is* the idempotency key.** Make the daily activity item `PK=playerId`, `SK=YYYY-MM-DD` (UTC). First check-in of the day writes with `ConditionExpression: attribute_not_exists(SK)`; duplicates fail the condition → **idempotent per UTC calendar day with zero extra infra.** Same pattern for `hand-completed` (idempotent per day per player).
- **Streak counter advance** = conditional UpdateItem on the player record, condition `lastLoginDate = :yesterday` (or no prior date) so it increments **once** and **only** when prior active day was exactly yesterday. Don't use a bare atomic counter.
- **Compute the UTC day once at the edge of the request** with `DateTime.utc().toISODate()`, pass it down; never recompute "today" at multiple call sites (classic midnight-boundary bug). Use **Luxon** (or zero-dep `new Date().toISOString().slice(0,10)` for UTC-only logic — INFERRED, standard ECMAScript `Date` semantics, no single authoritative URL fetched).
- **Powertools idempotency is complementary, not the source of truth** — good for swallowing API-Gateway/SQS *request* retries (returns cached response); not for the "once per calendar day" *business* rule (its key is payload/TTL-based, not calendar-aligned). The PRD's "idempotent per calendar day" is best served by the conditional write.

### PRD edge cases → resolution (all UTC)
| Edge case | Resolution |
|---|---|
| Timezone boundary (player UTC-8 plays 11pm local = 07:00 UTC next day) | Counts for the **UTC** day. All math UTC. |
| Multiple hands in a day | First hand sets `played=true`; subsequent are no-ops (conditional write already there). |
| Check-in at midnight (`...T00:00:00Z`) | Belongs to that UTC date via `toISODate()`. |
| Freeze after 2 missed days | Freeze covers first missed day; streak resets on the second. |
| Monthly free freeze | Granted on the **1st of the month** (compare `lastFreezeGrantDate` = `YYYY-MM`), not every 30 days. |
| New player first check-in | No "yesterday"; `loginStreak = 1`. |

---

## Q4 — DynamoDB data model

### Verified
- **Composite key + range query is the correct shape.** Query needs PK equality; SK supports `BETWEEN`, `begins_with`, comparisons; results sorted by SK (lexical), `ScanIndexForward=false` to reverse; ≤1MB/Query. Source: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.KeyConditionExpressions.html
- **ISO-8601 sort keys are AWS's stated time-series recommendation** (lexical order = chronological); also recommends per-item **TTL** and pre-aggregated summary items. Source: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-time-series.html
- **AWS explicitly sanctions multi-table:** "it's fine to skip single-table design if multi-table design is easier for you to reason about." Source: https://aws.amazon.com/blogs/database/single-table-vs-multi-table-design-in-amazon-dynamodb/ . DeBrie: single-table's main payoff is fetching **heterogeneous items in one Query**; downsides are learning curve + inflexibility to new access patterns. Source: https://www.alexdebrie.com/posts/dynamodb-single-table/
- **Cross-table atomic writes** are available via `TransactWriteCommand` (DocumentClient form of `TransactWriteItems`), so multi-table doesn't lose write atomicity. `BatchWriteCommand` = ≤25 puts/deletes, **not** atomic, no updates. Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-lib-dynamodb/
- **SDK v3 `DynamoDBDocumentClient`** marshals native JS; **must set `marshallOptions.removeUndefinedValues = true`** (v3 no longer drops `undefined` by default). Sources: https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-dynamodb/README.md , https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-dynamodb-doc-client.html
- **Local dev:** `serverless-dynamodb` (maintained fork) listed **before** `serverless-offline`; `custom.serverless-dynamodb.start` with `inMemory/migrate/seed`; CLI `start|migrate|seed`. Source: https://github.com/raisenational/serverless-dynamodb

### Inferred — recommendation
- **Keep the PRD's 4 tables** (`streaks-players`, `streaks-activity`, `streaks-rewards`, `streaks-freeze-history`). These entity types are **never co-retrieved heterogeneously** — each has its own key pattern — so single-table's marquee benefit doesn't apply, and 4 tables stay junior-readable (aligns with our "junior-friendly repo" standard). Multi-table here is the *defensible, documented* choice, not a shortcut. Note this as an ADR.
- **AWS's "one table per time period" advice does NOT apply** — that targets hot partitions when all writes hit today's `date` PK; our PK is `playerId`, so writes spread naturally. No write-sharding needed.
- **Heat map = one Query:** `playerId = :p AND SK BETWEEN :start AND :end` (trailing-30/35-day window crossing month boundaries) or `begins_with(SK, :ym)` for a whole calendar month. PRD's calendar endpoint takes `?month=YYYY-MM` → `begins_with` is cleanest; the dashboard's "last 30 days" → `BETWEEN`.
- **Write atomicity where it matters:** check-in that simultaneously updates player record + writes activity row + (on milestone) writes a reward row + notification should use `TransactWriteCommand` so a partial failure can't leave an awarded-but-unrecorded reward.

### Unverified
- Exact Powertools default hash function (version-dependent — pin & confirm).
- Legacy `serverless-dynamodb-local` maintenance status (prefer the `raisenational` fork).

---

## Q5 — Frontend: heat map + data fetching

### Verified (npm registry, 2026-06-05)
- `react-calendar-heatmap` v1.10.0 (2025-02-23), peer `react ">=0.14.0"` → installs on 18 but **React-18-by-tolerance only**, still uses `prop-types`. SVG; coloring via `classForValue` → CSS `fill` classes (maps cleanly to our 5 states); **no built-in tooltip** (`titleForValue`/`tooltipDataAttrs`). https://github.com/kevinsqi/react-calendar-heatmap
- `react-activity-calendar` v3.2.0 (**2026-04-15**, most actively maintained), peer `react ^18 || ^19` (**explicit 18**), data points carry `{date,count,level}` with configurable **0–4 levels = our 5 states**, built-in tooltips + `theme` prop. Caveat: GitHub-contributions week-column semantics; a strict 30-day row needs tuning. https://github.com/grubersjoe/react-activity-calendar
- `@nivo/calendar` v0.99.0 — heaviest (d3 + lodash), overkill for 30 cells. `cal-heatmap` v4.2.4 (**2023-12-29**, stale, **not a React lib**) — avoid.
- **RTK Query ships inside Redux Toolkit** (`@reduxjs/toolkit` v2.x), so it adds zero new top-level deps; `createApi()` + `fetchBaseQuery()` auto-generate hooks with caching/loading/refetch. Idiomatic when already using Redux. Sources: https://redux-toolkit.js.org/rtk-query/overview , https://redux-toolkit.js.org/rtk-query/comparison
- **MUI** current major is **v9** (`@mui/material` 9.0.1, 2026-05-07), needs `@emotion/react` + `@emotion/styled`; dark theme via `createTheme({ palette:{ mode:'dark', primary:{main:'#F5923E'}, background:{default:'#0C181B'} }})` + `CssBaseline`. Source: https://mui.com/material-ui/customization/dark-mode/ **→ verify the version the skeleton actually pins before using v9-specific Pigment guidance.**
- **Testing:** RTL (16.x) + **MSW** (2.x) is the standard — mock at the network layer (`setupServer`, `server.listen/resetHandlers/close`), render with the real Redux `<Provider>` so RTK Query runs end-to-end. Sources: https://mswjs.io/docs/integrations/node
- **Fire-icon animation:** pure CSS `transform: scale(1 + min(streak,30)*0.02)` with a transition (zero-dep); upgrade to `motion` (formerly `framer-motion`, now `motion` v12, `import {motion} from "motion/react"`) only for a spring "pop." Source: https://motion.dev/docs/react-upgrade-guide

### Recommendation
- **Build the 30-day heat map from scratch** — CSS grid (`Box gridTemplateColumns`) + MUI `sx` for the 5-state colors + MUI `<Tooltip>` for accessible hovers. 30 cells is too small to justify a dependency and it avoids the libraries' week-column semantics while giving exact control over the orange-on-near-black theme. **Fallback library: `react-activity-calendar`** (actively maintained, explicit React 18, native 0–4 levels). Record this as an ADR.
- **Data fetching: RTK Query** (already bundled; don't add TanStack Query alongside Redux).

### Unverified
- All bundle-size numbers (bundlephobia unreachable).
- MUI version pinned in the skeleton (could be v5/v6, not v9) — **check `package.json` first.**

---

## Q6 — Company / PRD context (verification of the dossier)

### Verified
- **Hijack Poker = TCH's online arm**, geofenced to Texas, **no-rake / membership + time-charge** model, cash out at TCH locations. Sources: https://www.hijackpoker.com/ , https://help.hijackpoker.com/introduction-to-hijack-poker
- **It's launched/live, not beta** (daily tournaments, live promos, iOS app id6464543286 sold by "RCrow Consulting LLC DBA Hijack Poker", Android via sideload APK). Sources: https://apps.apple.com/us/app/hijack-poker/id6464543286 , https://help.hijackpoker.com/how-do-you-download-the-hijack-poker-app — **UPDATE to dossier ("beta" is stale).**
- **The "Hot Streak" promo is live now:** "June $100K Hot Streak Freeroll," play **35+ hrs in a qualifying week (Mon–Sun CT, resets Monday)** → escalating bonus chips. Source: https://www.hijackpoker.com/promos — **this is the real engagement feature our Daily Streaks extends.** Note: dossier said Sunday-reset; live promo is **Monday-reset**.
- **Challenge options A–D confirmed** (A Rewards = **NestJS**, B Bomb Pots, C Daily Streaks = React + Lambda + DynamoDB + REST, D Unity). Source: https://raw.githubusercontent.com/hijack-poker/tech-assignment/main/docs/README.md
- **Option C ports/stack confirmed:** Vite React frontend + serverless API + DynamoDB; **Streaks API :5001, Streaks Frontend :4001**; core infra MySQL 3306 / Redis 6379 / DynamoDB Local 8000.
- **Skeleton repo is public:** github.com/hijack-poker → **`tech-assignment`** (JavaScript, active, last updated May 29 2026). Org also has `pomelo-*`, `coinbase-php`, `descope-react-sdk` forks → hints at real stack (Pomelo game server, Coinbase payments, **Descope auth**). Source: https://github.com/hijack-poker
- **People:** Sam(uel) Von Kennel (founder; contact **sam@hijackpoker.com** for *functional* clarifications only), Ryan Crow (CEO since Jan 2017; his RCrow Consulting LLC is the iOS seller), Darren Brown (co-owner). Sources: https://www.cardplayer.com/poker-players/366021-samuel-von-kennel , https://theorg.com/org/texas-card-house

### Updates / corrections to the dossier
- "beta" → **launched/live**.
- Hot Streak resets **Monday**, not Sunday.
- "~$2M seized" = the **civil-forfeiture** amount (April 8 filing); raid **cash** was ~$1.35M. Lodge grand jury **no-billed Apr 28 2026** (Polk cleared); reopened ~**May 26 2026**. Sources: https://www.pokernews.com/news/2026/04/lodge-card-club-poker-room-to-reopen-51144.htm , https://www.casino.org/news/texas-poker-club-the-lodge-cleared-of-money-laundering-but-not-illegal-gambling/
- **"Texas Supreme Court pending question" is misframed** — the Court already *declined* review of the Dallas case (2024-25), a procedural win; the live 2026 risk is **political (AG primary → possible binding AG opinion against seat fees)**, not a pending SCOTX ruling. Sources: https://www.cardplayer.com/poker-news/texas-supreme-court-ruling-dallas-poker-club-stays-open
- **WSOP Circuit @ TCH Social Austin Apr 23–May 4 2026** confirmed; as of June 5 it has concluded. Source: https://www.texascardhouse.com/wsop

### Unverified — flag before relying on in the README
- **Laravel / Pulumi / Serverless Framework v4** in the prod stack — *not surfaced in the rendered challenge doc*; plausible but unconfirmed (org repos suggest Pomelo + Descope + Coinbase). Don't assert these as fact.
- **MUI / Redux Toolkit / serverless-offline** for Option C — strongly implied by the local-dev guide but **confirm against the skeleton's actual `package.json`** once cloned.
- **Brand specifics:** "dark teal" background and **Poppins** typeface unconfirmed (homepage read as orange/green/blue gradients, "modern sans-serif"). Western motif is strongest in promo/social assets, lighter in the core web app. **Re-check visually before hardcoding brand tokens.**

---

## Implications for build decisions

| # | Question | Answer | Confidence | What it changes |
|---|---|---|---|---|
| 1 | Streak "day" definition | **UTC calendar day**, low bar to extend (1 login / 1 completed hand), two independent counters over one daily record | High (PRD + precedent) | Core streak logic; one daily-activity item carries both `loggedIn`+`played` |
| 2 | Freeze design | Implement PRD verbatim (1 free/mo, auto-consume, 1-day protection, both streaks, lazy-eval OK); Duolingo precedent validates it | High | `freeze.service` + lazy evaluation on check-in; scheduled Lambda = bonus |
| 3 | Idempotency + UTC math | Conditional write (`attribute_not_exists(SK)`) per UTC day is the source of truth; Luxon `DateTime.utc().toISODate()` at the edge; no bare atomic counters | High | Repository layer + a single shared `utcDay()` util; Powertools optional |
| 4 | Data model | **Keep 4 tables**; `TransactWriteCommand` for atomic check-in+reward; month query via `begins_with`/`BETWEEN`; `removeUndefinedValues:true` | High | repository design + an ADR justifying multi-table |
| 5 | Frontend heat map + fetch | **Build heat map from scratch** (CSS grid + MUI `sx` + `Tooltip`); fallback `react-activity-calendar`; **RTK Query** for data | High (verify MUI version) | component design + ADR; no heavy deps added |
| 6 | Company/PRD framing | Frame README around extending the **live "Hot Streak"** promo; it's a real strategy, not hypothetical | High | README narrative + positioning |

---

## Status: which questions are closed

- **High confidence / closed:** Q1, Q2, Q3, Q4 — design and AWS patterns are well-sourced and map directly to the PRD.
- **High confidence pending one repo check:** Q5 — recommendation firm, but **confirm the skeleton's pinned MUI/RTK/React versions** in `package.json` after cloning (MUI could be v5/v6/v9).
- **Mostly closed, a few flags:** Q6 — company premise solid; **do not assert** Laravel/Pulumi/Serverless-v4 or specific brand tokens (teal/Poppins) without confirming against the skeleton/app.

### What would close the remaining gaps
1. **Clone the skeleton** (`github.com/hijack-poker/tech-assignment`) and read `streaks-api/` + `streaks-frontend/package.json`, the docker-compose `streaks` profile, the DynamoDB-init table definitions, and the example test files → confirms exact versions, table schemas, JWT-stub convention, and the existing route stubs.
2. **Visually re-check** hijackpoker.com for the real brand tokens before hardcoding theme colors/fonts.

---

## Source log (all accessed 2026-06-05)

**Streak mechanics:** blog.duolingo.com/improving-the-streak · /how-duolingo-streak-builds-habit · /streak-milestone-design-animation · /how-to-keep-your-streak-on-vacation · duolingo.com/help/what-is-a-streak (JS-rendered, rung-2 extract) · help.snapchat.com articles 7012394193684 & 7012318024852 · store.zyngapoker.com/daily-streak · pokernews.com/free-online-games/play-wsop/wsop-rewards.htm (rung-2) · uxmag.com (rung-3) · duolingo.fandom.com/wiki/Streak (rung-3)

**DynamoDB / Lambda:** docs.aws.amazon.com → Query.KeyConditionExpressions, bp-time-series, WorkingWithItems · aws.amazon.com/blogs/database/single-table-vs-multi-table-design · alexdebrie.com/posts/dynamodb-single-table · docs.aws.amazon.com/powertools/typescript/2.1.1/utilities/idempotency · aws.amazon.com/blogs/compute/implementing-idempotent-aws-lambda-functions · moment.github.io/luxon/api-docs · npmjs.com/package/date-fns-tz · github.com/aws/aws-sdk-js-v3 lib-dynamodb README · docs.aws.amazon.com/sdk-for-javascript/v3 migrate-dynamodb-doc-client · github.com/raisenational/serverless-dynamodb

**Frontend:** github.com/kevinsqi/react-calendar-heatmap · github.com/grubersjoe/react-activity-calendar · registry.npmjs.org (@nivo/calendar, cal-heatmap, @reduxjs/toolkit, @mui/material, @testing-library/react, msw, motion) · redux-toolkit.js.org/rtk-query/overview & /comparison · mui.com/material-ui/customization/dark-mode · mswjs.io/docs/integrations/node · motion.dev/docs/react-upgrade-guide

**Company:** hijackpoker.com · help.hijackpoker.com (introduction, download) · hijackpoker.com/promos · apps.apple.com/us/app/hijack-poker/id6464543286 · raw.githubusercontent.com/hijack-poker/tech-assignment/main/docs/README.md · github.com/hijack-poker · cardplayer.com/poker-players/366021 · theorg.com/org/texas-card-house · pokernews.com & casino.org & yogonet (Lodge coverage) · texascardhouse.com/wsop · businesswire / wsop.com (WSOP Circuit)
