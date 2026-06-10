# TECH_STACK.md — Hijack Poker Daily Streaks (Option C)

**Status:** Locked. This is the single source of truth for what we build with and which versions. No hedging — every choice below is decided.
**Grounding:** [`PROJECT.md`](./PROJECT.md), [`RESEARCH.md`](RESEARCH.md) (cited inline by question ID: Q3 idempotency/UTC, Q4 DynamoDB/SDK v3, Q5 frontend), and the **real** skeleton files (versions below are copied verbatim from the pinned `package.json` files — not guessed).
**Precedence:** governed by `PROJECT.md` and `CLAUDE.md §Doc precedence`. ARCHITECTURE.md, API_CONTRACT.md, and DATA_MODEL.md inherit these versions and the env list in §4; they must not redefine them.
**Convention:** facts sourced from RESEARCH.md cite the question ID. Anything not verified against the skeleton or RESEARCH.md is tagged **ASSUMPTION:**.

---

## 1. Locked decisions

Versions are exact specifiers from the skeleton `package.json` files. "NEW" marks a top-level dependency we add (counted against the §2 budget).

| Concern | Decision | Version (exact) | Rejected alternative + why |
|---|---|---|---|
| **Backend language** | **TypeScript** (convert the JS/CommonJS skeleton to TS) | `typescript ^5.4.0` (NEW backend — matches the version the frontend already pins) | *Stay JS.* Rejected: rubric weights code-quality 25% and NFR-9 mandates type safety; typed domain (streak counts, UTC date strings, milestone tables, freeze state) catches the exact bugs this feature is prone to. Conversion friction against CommonJS `shared/` is handled in §3. |
| **Backend runtime — local** | Node 22 (docker `node:22-alpine` container) | `node:22-alpine` (docker-compose, `streaks-api` service) | n/a — fixed by skeleton. |
| **Backend runtime — Lambda provider** | `nodejs20.x` | `nodejs20.x` (`serverless.yml` provider.runtime) | **Honest mismatch:** the container runs Node 22 but the Serverless provider targets `nodejs20.x`. We do **not** change either — both are skeleton-pinned. TS compiles to a syntax level both runtimes accept. Build target is set to the lower bound: **ASSUMPTION:** `tsconfig target: ES2022` / esbuild `--target=node20` to stay safe for `nodejs20.x`. Documented as the one intentional version skew. |
| **Web framework** | **Express + serverless-http** (keep skeleton's `handler.js` pattern) | `express ^4.18.0`, `serverless-http ^3.2.0` | *Fastify / NestJS / raw Lambda handler.* Rejected: the skeleton already wires Express through `serverless-http` (`handler.js` exports `serverless(app)`); rewriting the HTTP layer is pure churn with zero rubric payoff. NestJS is Option A's stack, not ours. |
| **Serverless framework** | **Serverless Framework v3** (keep) | `serverless ^3.39.0`, `frameworkVersion: '3'` (`serverless.yml`) | *v4.* The original challenge prose mentioned v4 — **the skeleton is v3**, and we follow the skeleton, not the prose. v4 introduces auth/licensing and config changes that would break the committed `serverless.yml` / `serverless.offline.yml` for zero feature gain. Locked at v3. |
| **DynamoDB client** | **AWS SDK v3 `DynamoDBDocumentClient`** with `marshallOptions.removeUndefinedValues: true` | `@aws-sdk/client-dynamodb ^3.500.0`, `@aws-sdk/lib-dynamodb ^3.500.0` | *Raw `DynamoDBClient` (manual AttributeValue marshalling)* — verbose, error-prone. The DocumentClient is already configured in `shared/config/dynamo.js` with `removeUndefinedValues:true` (v3 no longer drops `undefined` by default — RESEARCH.md Q4). Reuse it as-is. |
| **Date library** | **Luxon** for all UTC day math | `luxon ^3.4.0` (NEW backend), `@types/luxon ^3.4.0` (NEW backend) — **ASSUMPTION:** version (latest 3.x; no skeleton pin to copy) | *date-fns-tz* — date-fns base operates in **local** time and needs the `-tz` add-on for zone-correct math, more error-prone for pure-UTC logic (RESEARCH.md Q3). *Zero-dep `new Date().toISOString().slice(0,10)`* — works for UTC-only but loses `.minus({days})` / `.diff(...,'days')` ergonomics that the streak/gap math leans on (RESEARCH.md Q3). Luxon's `DateTime.utc().toISODate()` is the canonical `utcDay()` per NFR-1. |
| **Idempotency approach** | **DynamoDB conditional write** (`ConditionExpression: attribute_not_exists(...)`), the UTC date string *is* the idempotency key | (no new dep — uses the SDK above) | *AWS Lambda Powertools idempotency* — keyed on payload hash + TTL, good for swallowing API-Gateway/SQS *request* retries but **not** for the "once per UTC calendar day" *business* rule, which is calendar-aligned, not payload-aligned (RESEARCH.md Q3). Conditional write is the source of truth; Powertools would be a complementary extra dep we don't need. **No bare atomic counters** — a retried `ADD` double-counts (RESEARCH.md Q3). |
| **Backend test** | **Jest + ts-jest** | `jest ^29.7.0` (kept), `ts-jest ^29.1.0` (NEW backend) — **ASSUMPTION:** ts-jest version (29.x line, matches jest 29) | *Vitest.* Rejected for the backend only: the skeleton already pins Jest 29 with a committed `jest` config and `health.test.js`; ts-jest lets those run typed with one transformer, no migration. (Frontend uses Vitest — see below — because Vite is its native test runner.) |
| **TS build / bundle for Lambda** | **esbuild via `serverless-esbuild`** | `serverless-esbuild ^1.55.0` (NEW backend; **reconciled per ASSUMPTIONS A-4** — the planning literal `^0.8.0` does not exist on npm and cannot transpile `.ts` for current serverless-offline; the 1.x line ships, with esbuild 0.28 transitively) | *Plain `tsc` then deploy the JS tree.* Rejected: `serverless-esbuild` bundles + transpiles TS per-function at `sls package`/`offline` time, tree-shakes, and is the de-facto TS path for Serverless v3 — keeps `serverless-offline` working with `.ts` handlers and produces a small Lambda artifact. `tsc`-only would ship `node_modules` and need a separate build step glued into the serverless lifecycle. |
| **Frontend framework** | **React 18 + Vite** | `react ^18.3.0`, `react-dom ^18.3.0`, `vite ^5.4.0`, `@vitejs/plugin-react ^4.2.0`, `typescript ^5.4.0` | n/a — fixed by skeleton (RESEARCH.md Q5 said verify the pins; pins confirmed React 18 / Vite 5). |
| **UI library** | **MUI v5** (+ Emotion) | `@mui/material ^5.15.0`, `@mui/icons-material ^5.15.0`, `@emotion/react ^11.11.0`, `@emotion/styled ^11.11.0` | *MUI v9 (current major).* RESEARCH.md Q5 notes MUI's current major is v9, but **the skeleton pins v5** — we stay on v5. v9-specific guidance (Pigment CSS, new theming) does **not** apply. Dark/orange brand theme is built with the v5 `createTheme({ palette:{ mode:'dark', ... }})` API + `CssBaseline`. |
| **State / data fetching** | **Redux Toolkit + RTK Query** (RTK Query ships *inside* `@reduxjs/toolkit` — zero new top-level dep) | `@reduxjs/toolkit ^2.1.0`, `react-redux ^9.1.0` | *Add TanStack Query alongside Redux* — redundant when RTK Query is already bundled and idiomatic with the existing store (RESEARCH.md Q5). *Plain `axios` + manual thunks* — reinvents caching/loading/refetch that `createApi()`+`fetchBaseQuery()` generate for free. `axios ^1.6.0` stays available for any non-RTK call but RTK Query is the default data layer. |
| **Calendar heat map** | **Build from scratch** — CSS grid (MUI `Box` `gridTemplateColumns`) + `sx` for the 5 state colors + MUI `<Tooltip>` | (no new dep) | *`react-calendar-heatmap`* — React-18-by-tolerance only, still uses `prop-types`, no built-in tooltip (RESEARCH.md Q5). *`react-activity-calendar`* — actively maintained, explicit React 18, native 0–4 levels, but carries GitHub week-column semantics that fight a strict 30-day row; **kept as documented fallback** (RESEARCH.md Q5). *`@nivo/calendar`* — d3+lodash, far too heavy for 30 cells (RESEARCH.md Q5). 30 cells don't justify a dependency and from-scratch gives exact control of the orange-on-near-black theme. ADR in ARCHITECTURE.md. |
| **Frontend test** | **Vitest + React Testing Library + MSW** | `vitest ^1.6.0` (NEW), `@testing-library/react ^16.0.0` (NEW), `@testing-library/jest-dom ^6.4.0` (NEW), `jsdom ^24.1.0` (NEW), `msw ^2.3.0` (NEW) — **ASSUMPTION:** all versions (no skeleton pins; chosen as current 2.x/16.x/1.x lines per RESEARCH.md Q5) | *Jest on the frontend* — Vitest is Vite's native runner (shares the `vite.config`, no separate Babel/transform setup). RTL 16 + MSW 2 mock at the network layer (`setupServer`) so RTK Query runs end-to-end against the real `<Provider>` (RESEARCH.md Q5). |
| **Animation** | **CSS `transform: scale()` + transition** for the flame-grows effect (zero-dep) | (no new dep) | *`motion` (formerly framer-motion) v12* — only justified for a spring "pop"; deferred. The flame scale (`scale(1 + min(streak,30)*0.02)`) is pure CSS and in scope (RESEARCH.md Q5; PROJECT.md §8 keeps the flame animation cheap and in scope). Adding `motion` is **not** approved under the §2 budget. |
| **Scheduled freeze job (FR-10)** | **Serverless Framework v3 `schedule` event** (cron) invoking the **same** `freeze.service` consume function the lazy path uses | (no new dep — built into Serverless v3 `functions.*.events: [{ schedule: ... }]`) | *Hand-wired EventBridge rule.* Rejected: Serverless v3's `schedule` event **is** the EventBridge integration, declared in one line of `serverless.yml`; wiring a raw `aws.events.Rule` + target by hand is redundant config for zero gain. Reuses the lazy-eval consume function so there is one source of truth (PROJECT.md FR-10.2; idempotent against lazy eval via the per-day freeze-history conditional write — CLAUDE.md Inv. 5). |
| **Share-card rendering (FR-9)** | **Server-side SVG string templating** — handler returns `Content-Type: image/svg+xml` from a typed template module (zero new dep). **Locked default.** | (no new dep — template literals + the brand tokens) | *`node-canvas`* — native build pain on alpine/Lambda (RESEARCH.md Q4 toolchain notes); a system-dependency we refuse to add. *Client-only `html-to-image`* — runs in the browser, **can't** back a server endpoint (FR-9.2 requires an endpoint). SVG templating is lean, themeable with the same brand tokens as the dashboard, and renders fine for a share card. **OPTIONAL PNG upgrade** (only if a raster is required): `satori` (JSX/HTML → SVG) + `@resvg/resvg-js` (SVG → PNG) — see §2 optional table; tradeoff: both are heavier and native-ish, so they stay opt-in while SVG is the default. |
| **Push-notification payload (FR-7)** | **Plain typed object** (`{ title, body, deepLink, milestone, type }`) built in `reward.service`, stored on the reward item and returned in the reward / `milestoneEarned` shapes | (no new dep — content only) | *Any push-provider SDK* (FCM/APNs/Expo/OneSignal). Rejected: **delivery is hard out of scope** (PROJECT.md §8, FR-7.1); we generate and persist the message *content* only. No delivery SDK, no transport, no credentials. |
| **CI pipeline (NFR-10)** | **GitHub Actions** — one workflow yaml (`.github/workflows/ci.yml`) running `tsc --noEmit` typecheck + both test suites (backend Jest, frontend Vitest) on push/PR | (no new dep — a workflow file, not an npm install) | *No CI / local-hook only.* Rejected: NFR-10 ratifies CI into scope and the rubric rewards a green pipeline; the workflow mirrors the §4/CLAUDE.md pre-push hook so red CI == red push. **ASSUMPTION:** `actions/setup-node@v4` with **Node 22** (matches the docker `node:22-alpine` local runtime, §1). |

---

## 2. Dependency budget

**Hard ceiling: 11 new top-level REQUIRED dependencies total** (5 backend prod/dev + 6 frontend dev) — plus explicitly-optional deps that must be justified at PR time before they count. This is a junior-friendly repo (per the standing repo standard); every dep below earns its place, and nothing heavy (no nivo, no framer/motion, no calendar-heatmap lib, no TanStack Query) gets in.

**The now-in-scope Could-Haves add ZERO required deps.** Every Could-Have decision in §1 was deliberately chosen to lean on what's already here: the scheduled freeze job is a built-in Serverless `schedule` event; the push-notification payload is a plain typed object; CI is a workflow yaml (not an npm package); and the **locked** share-card path is server-side SVG templating (zero deps). The only deps any Could-Have *could* pull in are the **optional** share-card PNG path (`satori` + `@resvg/resvg-js`), which stay opt-in and are **not counted unless PNG is actually built**. So the hard ceiling for required deps is **unchanged at 11**.

### Backend — 5 new (all required)
| Dep | Type | Why it fits |
|---|---|---|
| `typescript ^5.4.0` | dev | The language. NFR-9. |
| `ts-jest ^29.1.0` | dev | Run the existing Jest 29 suite typed, no test-runner migration. |
| `serverless-esbuild ^1.55.0` | dev | Bundle/transpile `.ts` handlers for `serverless offline` + `sls package` on Serverless v3. (Reconciled per ASSUMPTIONS A-4 — `^0.8.0` was unsatisfiable.) |
| `luxon ^3.4.0` | prod | Canonical UTC day math (`utcDay()`), gap/diff logic (RESEARCH.md Q3). |
| `@types/luxon ^3.4.0` | dev | Types for luxon (luxon ships JS only). |

> `@types/*` for the CommonJS `shared/` modules and stdlib are **not** counted as new top-level installs — they're either bundled (`@types/node` arrives with the toolchain) or replaced by a hand-written `.d.ts` declaration (§3). If `@types/express`/`@types/serverless` prove necessary they are dev-only type packages, not runtime deps, and still fit the spirit of the ceiling.

### Backend — 4 OPTIONAL (do not install unless the slice needs them; each needs a one-line PR justification)
| Dep | When it earns its slot |
|---|---|
| `ulid ^2.3.0` | Only if reward IDs (`streaks-rewards.rewardId`) need sortable, collision-resistant IDs. A timestamp-prefixed string can substitute zero-dep; prefer ULID only if the sortable-by-time property is used by a query. |
| `zod ^3.23.0` | Only for input validation on the internal `hand-completed` and admin-grant bodies (FR-6, FR-3.3) if hand-rolled guards get unwieldy. Hand-rolled validation is acceptable for the small payloads here. |
| `satori ^0.10.0` | **Share-card PNG path only (FR-9).** Only if the share card must be a raster **PNG** rather than the locked-default SVG. Renders JSX/HTML → SVG. Heavier + native-ish; skip it while SVG templating (zero-dep) satisfies FR-9. **ASSUMPTION:** version (latest 0.x line; no skeleton pin). |
| `@resvg/resvg-js ^2.6.0` | **Share-card PNG path only (FR-9), paired with `satori`.** Converts the satori SVG → PNG. Native binding; same opt-in caveat — only earns its slot if a true PNG is required. **ASSUMPTION:** version (latest 2.x line; no skeleton pin). |

### Frontend — 6 new (all dev; all required for NFR-4 testing)
| Dep | Type | Why it fits |
|---|---|---|
| `vitest ^1.6.0` | dev | Native Vite test runner. |
| `@testing-library/react ^16.0.0` | dev | Component testing against the real Redux `<Provider>`. |
| `@testing-library/jest-dom ^6.4.0` | dev | DOM matchers (`toBeInTheDocument`, etc.). |
| `jsdom ^24.1.0` | dev | DOM environment for Vitest. |
| `msw ^2.3.0` | dev | Network-layer mocking so RTK Query runs end-to-end in tests (RESEARCH.md Q5). |
| `@testing-library/user-event ^14.5.0` | dev | Simulate the check-in button click / interactions (FR-4) in component tests. |

> RTK Query, the heat map, and the animation add **zero** new top-level deps — they reuse `@reduxjs/toolkit`, MUI `Box`/`sx`/`Tooltip`, and CSS respectively. That is the whole point of those three decisions.

**Net new top-level installs if zero optionals are used: 11** — and the Could-Haves keep it at 11 (their locked decisions are zero-dep). The optional `satori` + `@resvg/resvg-js` count only if the PNG share-card path is actually built; the locked SVG default keeps the share card at zero deps. Anything beyond this list requires reopening this doc.

---

## 3. Engineering conventions

**TypeScript strictness.** `tsconfig.json` with `strict: true` (implies `noImplicitAny`, `strictNullChecks`, etc.). Also `esModuleInterop: true`, `forceConsistentCasingInFileNames: true`, `skipLibCheck: true`. Build target **ES2022 / `--target=node20`** (the lower runtime bound — see §1 runtime mismatch).

**CommonJS vs ESM (the load-bearing interop note).**
- The backend handler is **CommonJS today** (`require`, `module.exports.api = serverless(app)` in `handler.js`) and the shared modules (`shared/config/dynamo.js`) are CommonJS. We keep the **emitted module format CommonJS** (`module: CommonJS` in tsconfig) so `serverless-http`, the `serverless.yml` `handler.api` export contract, and the `shared/` requires all keep working unchanged. `serverless-esbuild` outputs CJS for `nodejs20.x` by default.
- Authoring is TS with ESM `import` syntax; `esModuleInterop: true` makes `import serverless from 'serverless-http'` interop with the CJS default export. The compiled output is still CJS.
- **Consuming the CommonJS `shared/` modules from TS:** these JS files have no types. Resolution order: (1) preferred — add a small hand-written declaration `shared/config/dynamo.d.ts` exporting `{ docClient, ddbClient }` typed as `DynamoDBDocumentClient` / `DynamoDBClient`; this keeps the budget clean and documents the contract. (2) Fallback — `allowJs: true` + `checkJs: false` to let TS import the `.js` as `any`. We use option (1) for `dynamo.js` (it's the one hot dependency) and option (2) only if more untyped shared files appear.
- **serverless-offline bundling of shared native deps (the §3 interop risk made concrete — ASSUMPTIONS A-5).** The shared logger pulls `require('winston')` into the esbuild bundle, which esbuild cannot resolve from the `shared/` dir. Fix is **config-only** (no app-code change, no new dep): add `winston` to `custom.esbuild.exclude` in `serverless.offline.yml` + `serverless.yml` so it resolves from `streaks-api/node_modules` at runtime (same pattern as the auto-external `@aws-sdk/*`). Additionally, because serverless-offline overrides process AWS creds at invocation, the offline `provider.environment` declares `DYNAMODB_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (with `${env:…, default}` fallbacks) so the lambda authoritatively points at DynamoDB Local with the literal `local`/`local` creds. If more handlers import other shared native deps (`ioredis`/`mysql2`/`sequelize`), add them to `exclude` too.

**Frontend module format.** Frontend `package.json` already has `"type": "module"`; Vite/Vitest are ESM-native. No interop concern there.

**File / naming conventions.**
- Backend layers (matches the layered design PROJECT.md §4/§5 and the forthcoming ARCHITECTURE.md §3): `src/routes/*.ts` (handlers) → `src/services/*.service.ts` → `src/repositories/*.repository.ts`. Config in `src/config/*.ts`, middleware in `src/middleware/*.ts`, shared domain types in `src/types/*.ts`, UTC/util helpers in `src/utils/*.ts` (the single `utcDay()` lives here, NFR-1).
- Files: `kebab-case.ts` for modules already kebab in the skeleton (`check-in.ts`), `*.service.ts` / `*.repository.ts` suffixes for layers. Tests in `__tests__/**/*.test.ts` (the skeleton's existing `testMatch` updates from `.js` to `.ts`).
- Frontend: `PascalCase.tsx` for components, `camelCase.ts` for hooks/slices/api (`streaksApi.ts`), `useXxx` for hooks.
- **Could-Have handlers obey the same layering** (Inv. 6): the scheduled freeze handler is a thin event entry point that calls `freeze.service` (no logic inline); the share-card handler does HTTP only and delegates to a service. The **share-card SVG template lives in its own module** (`src/lib/share-card.ts` or `src/templates/share-card.svg.ts`) — a pure `(state) => string` renderer — **never** inlined in the handler, so it stays unit-testable like any other pure function.

**Error-shape convention.** Every error response is JSON `{ error, message }` (NFR-7) — `error` = short machine code/category, `message` = human string. HTTP codes: 400 bad input, 401 missing/invalid auth, 404 not found, 409 conflict (e.g. idempotency/condition-failed surfaced as conflict), 501 not-yet-implemented. The existing `auth.js` middleware already returns this exact shape; all new code conforms to it. A single error-handling middleware normalizes thrown errors into this shape.

**Logging convention.** Structured **winston** (`winston ^3.11.0`, already pinned) at every write path — check-in, hand-completed, reward award, freeze consume (NFR-6) — emitting JSON with at minimum `playerId` and a correlation id. No `console.log` in committed backend code.

**Folder conventions** mirror ARCHITECTURE.md §3 (handlers → services → repositories), with `shared/` consumed read-only via the symlink the skeleton already provides (`streaks-api/shared -> ../../shared`).

---

## 4. Environment variables — THE canonical list

Every other doc points **here** for env vars; do not redefine them elsewhere. Local values come from `docker-compose.yml` (`streaks-*` services) and `.env.example`; rows marked **ADD** are net-new for this feature.

| Name | Purpose | Local / default value | Where set |
|---|---|---|---|
| `STAGE` | Deploy stage; gates local vs cloud behavior | `local` | docker-compose `streaks-api` env; `serverless.offline.yml` provider.environment; `.env.example` |
| `DYNAMODB_ENDPOINT` | DynamoDB Local endpoint; presence switches `shared/config/dynamo.js` to local creds | `http://dynamodb-local:8000` | docker-compose; `.env.example` |
| `AWS_REGION` | AWS region for the SDK v3 client | `us-east-1` | docker-compose; `serverless.yml` provider.region; `.env.example` |
| `AWS_ACCESS_KEY_ID` | Local DynamoDB credential (dummy locally) | `local` | docker-compose; `.env.example` |
| `AWS_SECRET_ACCESS_KEY` | Local DynamoDB credential (dummy locally) | `local` | docker-compose; `.env.example` |
| `STREAKS_PLAYERS_TABLE` | Player streak-state table name | `streaks-players` | docker-compose `streaks-api` env |
| `STREAKS_ACTIVITY_TABLE` | Daily activity table (PK=playerId, SK=date) | `streaks-activity` | docker-compose `streaks-api` env |
| `STREAKS_REWARDS_TABLE` **(ADD)** | Earned-reward records (PK=playerId, SK=rewardId) | `streaks-rewards` | **ADD** to docker-compose `streaks-api` env + `.env.example` (table already created by `dynamodb-init`) |
| `STREAKS_FREEZE_HISTORY_TABLE` **(ADD)** | Freeze grant/consume history (PK=playerId, SK=date) | `streaks-freeze-history` | **ADD** to docker-compose `streaks-api` env + `.env.example` (table already created by `dynamodb-init`) |
| `INTERNAL_API_SECRET` **(ADD)** | Shared secret guarding the internal `POST /internal/streaks/hand-completed` endpoint (FR-6.3, NFR-3) **and reused by the admin endpoints** — no new secret needed | `dev-internal-secret` (dev default; reconciled per ASSUMPTIONS A-1 to match API_CONTRACT.md §2.2) | **ADD** to docker-compose `streaks-api` env + `.env.example`; checked by the internal-auth middleware |
| `FREEZE_CRON_ENABLED` **(ADD)** | Toggles the scheduled freeze-consumption job (FR-10). Defaults **off** locally so background mutations don't surprise local dev; the `serverless.yml` `schedule` event reads `enabled: ${env:FREEZE_CRON_ENABLED, 'false'}` so the cron is wired but dormant until explicitly turned on | `false` (**ASSUMPTION:** dev default — off) | **ADD** to docker-compose `streaks-api` env + `.env.example`; read by `serverless.yml` schedule event + the scheduled handler |
| `VITE_API_URL` | Frontend → API base URL (RTK Query `fetchBaseQuery` baseUrl) | `http://localhost:5001` | docker-compose `streaks-frontend` env (already present) |

> The two streaks tables (`streaks-rewards`, `streaks-freeze-history`) already exist in `dynamodb-init` (docker-compose) but are **not yet exported as env vars to the `streaks-api` service** — wiring them in is part of S0. `INTERNAL_API_SECRET` is entirely new.
>
> **Could-Have env footprint:** the only new var the Could-Haves add is `FREEZE_CRON_ENABLED` (above). The share-card endpoint (FR-9) is unauthenticated player-facing or `X-Player-Id`-scoped and the admin view-history endpoint (FR-8) reuses `INTERNAL_API_SECRET` — **neither introduces a new secret**. The push-notification payload (FR-7) and CI (NFR-10) need no env vars at all (CI sets Node 22 in the workflow, not via app env).

---

## 5. Cost model

**Challenge cost: $0.** Everything runs locally — DynamoDB Local (`amazon/dynamodb-local`, in-memory), MySQL, Redis, and the Lambda/Express services all in docker-compose. There are **no metered external APIs and no LLM calls** anywhere in this feature (the streak engine is deterministic UTC math; "notifications" store a payload record only, no delivery; `streak_bonus` writes a transaction record only, no rewards-system call). Nothing bills.

**Could-Haves add no cost.** Still **$0 local**: the scheduled freeze job (FR-10) is dormant locally (`FREEZE_CRON_ENABLED=false`, §4) and is plain UTC math when it does run; the share-card (FR-9) renders an SVG string in-process (or, if the optional PNG path is built, raster locally via `@resvg/resvg-js` — still no network); the push-notification payload (FR-7) is an in-memory object written to an existing table; CI (NFR-10) runs on GitHub Actions' free tier for the repo. **No new metered external APIs, no LLM calls.**

**Production (out of scope, for the README "what we'd do next"):** the only metered services would be **DynamoDB on-demand** (4 small tables, `playerId` PK spreads writes — no hot-partition surcharge per RESEARCH.md Q4) and **Lambda** invocations (256 MB, 30 s timeout per `serverless.yml`) behind API Gateway HTTP API. The Could-Have additions stay inside that same free-tier shape: the scheduled freeze Lambda is a single low-frequency cron invocation (one EventBridge schedule, negligible invocations) and the share-card is one more on-demand Lambda route — no always-on compute, no extra paid service. No LLM, no third-party paid API — costs scale with active players and stay in on-demand/free-tier territory at launch volume. **ASSUMPTION:** prod deployment itself is explicitly out of scope (PROJECT.md §8).
