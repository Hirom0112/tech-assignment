#!/usr/bin/env node

/**
 * Seed the streaks DynamoDB tables with a small, deliberate cast of demo players
 * (DATA_MODEL.md §11). Run after `docker compose --profile streaks up`.
 *
 *   node scripts/seed-streaks.js
 *
 * This is TOOLING, not the TS service — a plain Node CJS script. It is fully
 * RE-RUNNABLE to a clean deterministic state: each run first WIPES every seed
 * player's rows across all 4 streaks tables (bounded per-player `Query` +
 * `BatchWriteCommand` delete — no `Scan`), then writes the fresh dataset with
 * plain `PutCommand`s. Without the wipe, `streaks-rewards` / `streaks-freeze-
 * history` (whose keys carry a unique rewardId / date) would ACCUMULATE across
 * runs and the dashboard would show duplicate milestones. It does NOT use the
 * `attribute_not_exists` conditions that guard the live API. `console.log` is
 * fine here (STND-3 binds `src/`, not `scripts/`).
 *
 * ── Why this is DATE-STABLE ────────────────────────────────────────────────
 * The whole dataset is anchored to a FIXED day (`ANCHOR_DATE`, default the last
 * day of the demo month), NOT to the wall-clock `new Date()`. Every persona's
 * curated history lives entirely inside the demo month (`VITE_DEMO_MONTH`,
 * `2026-04`), which the dashboard's calendar defaults to. The `streaks-players`
 * aggregate, the calendar rows, the rewards list, and the freeze panel are all
 * static stored data — so the dashboard renders IDENTICALLY whether the partner
 * opens it today or a week from now. (The only live-derived bit is the "freeze
 * active today" chip, which keys off the real UTC day and is intentionally not
 * relied on by any persona.) Override the anchor with SEED_ANCHOR_DATE=YYYY-MM-DD.
 *
 * ── The 4 personas (mapped onto the legacy streak-001..004 ids so the demo
 *    default + the test suite keep working; legacy streak-005..010 are wiped) ──
 *   • streak-001  The Grinder   — daily player; a month with ALL 5 heat-map
 *                                 states (none/login_only/played/freeze/broken),
 *                                 populated rewards + a freeze save, mid streak.
 *   • streak-002  The Legend    — perfect attendance; 90+ login & play streaks
 *                                 ("Max milestone reached"), the full reward
 *                                 ladder, freezes banked but never used.
 *   • streak-003  The Newcomer  — just joined; near-zero streaks, EMPTY rewards
 *                                 + freeze history, "1 day from your first reward".
 *   • streak-004  The Comeback  — lapsed pro; best (47) ≫ current, a visible
 *                                 break, a freeze used, login-dominant divergence,
 *                                 glory-day milestones still in the reward log.
 *
 * Each persona is defined by an explicit per-day SCRIPT over the demo month plus
 * a small carry-in (the streak it walked in with). The interpreter mirrors the
 * live streak/freeze/reward math, so the generated rows stay internally coherent.
 * Day codes: P=played, L=login-only, F=freeze-protected miss, X=streak break,
 * .=absent (no row → calendar synthesizes `none`).
 */

'use strict';

const path = require('path');

// The repo root has no `node_modules`; the AWS SDK lives in the streaks-api
// package. Add it to this script's module search path so `node
// scripts/seed-streaks.js` (and `npm run seed:streaks`) works from anywhere with
// no NODE_PATH env var.
module.paths.push(
  path.join(__dirname, '..', 'serverless-v2', 'services', 'streaks-api', 'node_modules'),
);

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');

const ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const REGION = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const PLAYERS_TABLE = 'streaks-players';
const ACTIVITY_TABLE = 'streaks-activity';
const REWARDS_TABLE = 'streaks-rewards';
const FREEZE_HISTORY_TABLE = 'streaks-freeze-history';

// Deterministic PRNG (mulberry32) used only to give each reward id a stable,
// reproducible suffix so re-runs produce byte-identical rows. Override with
// SEED_RANDOM=<int> for a different (still reproducible) set of suffixes.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(Number(process.env.SEED_RANDOM) || 0x5734ea7);

// The day everything is anchored to (UTC). Pinned to the last day of the demo
// month so the curated month is fully "in the past" and renders identically
// regardless of the real calendar date. The demo month is derived from it and
// matches the frontend's VITE_DEMO_MONTH (2026-04).
const ANCHOR_DATE = process.env.SEED_ANCHOR_DATE || '2026-04-30';
const DEMO_MONTH = ANCHOR_DATE.slice(0, 7); // 'YYYY-MM'

// The milestone ladder — mirrors src/config/milestones.ts (the TS single source;
// inlined here because this CJS tool can't import the TS module). 3/7/14/30/60/90.
const MILESTONES = [
  { days: 3, loginReward: 50, playReward: 100 },
  { days: 7, loginReward: 150, playReward: 300 },
  { days: 14, loginReward: 400, playReward: 800 },
  { days: 30, loginReward: 1000, playReward: 2000 },
  { days: 60, loginReward: 2500, playReward: 5000 },
  { days: 90, loginReward: 5000, playReward: 10000 },
];

function milestoneAt(count) {
  return MILESTONES.find((m) => m.days === count) || null;
}

function nextMilestone(days) {
  return MILESTONES.find((m) => m.days > days) || null;
}

// ─── Persona definitions ─────────────────────────────────────────────────────
// `script` is one code per day of the demo month (Apr 1 → Apr 30):
//   P=played  L=login-only  F=freeze-protected miss  X=break  .=absent(none)
// `carry*` is the streak/best each persona walked into the month with (their
// pre-demo history); `historyRewards` are milestones earned BEFORE the demo
// month, surfaced in the reward log with back-dated timestamps.
function script(s) {
  return s.trim().split(/\s+/);
}

const PERSONAS = [
  {
    id: 'streak-001',
    name: 'The Grinder',
    startFreezes: 2,
    // All 5 calendar states: played(green), login-only(light), freeze(blue, Apr10),
    // break(red, Apr19), absent(none, Apr17-18). Mid streak (12) after one break.
    script: script(`
      P P L P P P L P P F P P P L P P . . X P P L P P P P L P P P
    `),
    carryLogin: 0,
    carryPlay: 0,
  },
  {
    id: 'streak-002',
    name: 'The Legend',
    startFreezes: 2,
    // Perfect attendance all month; walks in mid-streak so login crosses 90
    // (max milestone) and play reaches 90 too. Freezes banked, never used.
    script: script(Array.from({ length: 30 }, () => 'P').join(' ')),
    carryLogin: 65,
    carryPlay: 60,
    carryBestLogin: 65,
    carryBestPlay: 60,
    historyRewards: [
      { axis: 'login', milestone: 3, daysAgo: 150 },
      { axis: 'login', milestone: 7, daysAgo: 146 },
      { axis: 'login', milestone: 14, daysAgo: 139 },
      { axis: 'login', milestone: 30, daysAgo: 123 },
      { axis: 'login', milestone: 60, daysAgo: 93 },
      { axis: 'play', milestone: 3, daysAgo: 149 },
      { axis: 'play', milestone: 7, daysAgo: 145 },
      { axis: 'play', milestone: 14, daysAgo: 138 },
      { axis: 'play', milestone: 30, daysAgo: 122 },
      { axis: 'play', milestone: 60, daysAgo: 92 },
    ],
  },
  {
    id: 'streak-003',
    name: 'The Newcomer',
    startFreezes: 1,
    // Just joined at the end of the month: nothing but the last two days, so
    // streaks are tiny (login 2 / play 1), the reward + freeze logs are EMPTY,
    // and the milestone bar reads "1 more day to your first reward".
    script: script(`
      . . . . . . . . . . . . . . . . . . . . . . . . . . . . L P
    `),
    carryLogin: 0,
    carryPlay: 0,
  },
  {
    id: 'streak-004',
    name: 'The Comeback',
    startFreezes: 2,
    // A lapsed pro: continues an old streak to its best (47), then a real break
    // (Apr07, red), a thin comeback with one freeze save (Apr11, blue), then goes
    // quiet. Best ≫ current, login ≫ play. Old milestones still in the log.
    script: script(`
      P P L . . . X L L P F L . . . . . . . . . . . . . . . . . .
    `),
    carryLogin: 44,
    carryPlay: 0,
    carryBestLogin: 44,
    carryBestPlay: 0,
    historyRewards: [
      { axis: 'login', milestone: 3, daysAgo: 85 },
      { axis: 'login', milestone: 7, daysAgo: 81 },
      { axis: 'login', milestone: 14, daysAgo: 74 },
      { axis: 'login', milestone: 30, daysAgo: 58 },
    ],
  },
];

// Legacy ids from the old 10-player seed — wiped so they don't linger in the DB.
const LEGACY_IDS = Array.from({ length: 10 }, (_, i) => `streak-${String(i + 1).padStart(3, '0')}`);

/** UTC `YYYY-MM-DD` for a Date. */
function isoDate(date) {
  return date.toISOString().split('T')[0];
}

/** Number of days in a `YYYY-MM` month (UTC). */
function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The `YYYY-MM-DD` of day index `i` (0-based) within the demo month. */
function dayOfMonth(i) {
  return `${DEMO_MONTH}-${String(i + 1).padStart(2, '0')}`;
}

/** The UTC `YYYY-MM-DD` immediately before `dateStr`. */
function priorDay(dateStr) {
  return isoDate(new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - 86400000));
}

/** ISO instant `daysAgo` whole days before the anchor (for back-dated rewards). */
function isoMinusDays(anchorDateStr, daysAgo) {
  const t = new Date(`${anchorDateStr}T12:00:00.000Z`).getTime() - daysAgo * 86400000;
  return new Date(t).toISOString();
}

/** Whole UTC days between two `YYYY-MM-DD` dates (b − a). */
function daysBetweenDates(a, b) {
  const ta = new Date(`${a}T00:00:00Z`).getTime();
  const tb = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((tb - ta) / 86400000);
}

/**
 * A lexicographically-sortable, time-ordered reward id (mirrors
 * reward.service.ts `makeRewardId`): a 15-digit zero-padded epoch-millis prefix
 * so a `Query` with `ScanIndexForward=false` returns newest-first directly.
 */
function makeRewardId(isoInstant) {
  const prefix = String(new Date(isoInstant).getTime()).padStart(15, '0');
  const suffix = rand().toString(36).slice(2, 10).padEnd(8, '0');
  return `${prefix}-${suffix}`;
}

/** Build the FR-7 notification content payload + the §4.4 stored conveniences. */
function buildNotification(type, milestone, points, createdAt) {
  const axis = type === 'login_milestone' ? 'login' : 'play';
  const head = `You earned ${points} bonus points for a ${milestone}-day ${axis} streak.`;
  const next = nextMilestone(milestone);
  const body = next
    ? `${head} ${next.days} days unlocks ${type === 'login_milestone' ? next.loginReward : next.playReward}!`
    : `${head} You've reached the top tier!`;
  return {
    title: `${milestone}-day ${axis} streak!`,
    body,
    deepLink: 'hijackpoker://streaks',
    milestone,
    type,
    points,
    createdAt,
  };
}

function buildReward(playerId, type, rung, isoInstant) {
  const points = type === 'login_milestone' ? rung.loginReward : rung.playReward;
  return {
    playerId,
    rewardId: makeRewardId(isoInstant),
    type,
    milestone: rung.days,
    points,
    streakCount: rung.days,
    createdAt: isoInstant,
    pointTxnType: 'streak_bonus',
    notification: buildNotification(type, rung.days, points, isoInstant),
  };
}

/**
 * Interpret a persona's day-script over the demo month, emitting activity /
 * freeze / reward rows and the derived `streaks-players` aggregate. The streak
 * math mirrors the live service: consecutive active days advance the counter, a
 * freeze-protected miss carries it across one day, a break resets it to 1, and
 * a counter landing exactly on a milestone writes a reward (incl. re-award after
 * a reset). Historical pre-demo milestones are appended from `historyRewards`.
 */
function buildPersona(p) {
  const activityRows = [];
  const freezeRows = [];
  const rewardRows = [];

  let loginStreak = p.carryLogin || 0;
  let playStreak = p.carryPlay || 0;
  let bestLoginStreak = p.carryBestLogin != null ? p.carryBestLogin : loginStreak;
  let bestPlayStreak = p.carryBestPlay != null ? p.carryBestPlay : playStreak;
  let freezesAvailable = p.startFreezes;
  let freezesUsedThisMonth = 0;
  let lastLoginDate = null;
  // Seed a carried play streak as if the last play was the day before the month
  // begins, so the first played day CONTINUES it (login carries automatically
  // since it just increments on each active day; play uses a consecutive-day gap).
  let lastPlayDate = (p.carryPlay || 0) > 0 ? priorDay(dayOfMonth(0)) : null;

  const days = daysInMonth(DEMO_MONTH);
  if (p.script.length !== days) {
    throw new Error(`${p.id}: script has ${p.script.length} codes but ${DEMO_MONTH} has ${days} days`);
  }

  for (let i = 0; i < days; i++) {
    const dateStr = dayOfMonth(i);
    const ts = `${dateStr}T12:00:00.000Z`;
    const code = p.script[i];

    if (code === '.') continue; // absent → no row → calendar synthesizes `none`.

    let loggedIn = false;
    let played = false;
    let freezeUsed = false;
    let streakBroken = false;

    if (code === 'F') {
      // A single missed day, protected by a freeze → carry the streak across it.
      freezesAvailable -= 1;
      freezesUsedThisMonth += 1;
      const source = freezesUsedThisMonth === 1 ? 'free_monthly' : 'purchased';
      freezeRows.push({ playerId: p.id, date: dateStr, source, createdAt: ts });
      loginStreak += 1;
      freezeUsed = true;
      lastLoginDate = dateStr;
    } else if (code === 'X') {
      // A real break: logged in, but the streak resets on this day.
      loggedIn = true;
      streakBroken = true;
      loginStreak = 1;
      lastLoginDate = dateStr;
    } else if (code === 'L' || code === 'P') {
      loggedIn = true;
      loginStreak += 1;
      lastLoginDate = dateStr;
      if (code === 'P') {
        played = true;
        const playGap = lastPlayDate === null ? null : daysBetweenDates(lastPlayDate, dateStr);
        playStreak = playGap === 1 ? playStreak + 1 : 1;
        lastPlayDate = dateStr;
      }
    } else {
      throw new Error(`${p.id}: unknown day code '${code}' at index ${i}`);
    }

    bestLoginStreak = Math.max(bestLoginStreak, loginStreak);
    bestPlayStreak = Math.max(bestPlayStreak, playStreak);

    // Reward when a counter EQUALS a milestone (a break resets to 1, never a rung).
    if (code !== 'X') {
      const loginRung = milestoneAt(loginStreak);
      if (loginRung) rewardRows.push(buildReward(p.id, 'login_milestone', loginRung, ts));
    }
    if (played) {
      const playRung = milestoneAt(playStreak);
      if (playRung) rewardRows.push(buildReward(p.id, 'play_milestone', playRung, ts));
    }

    activityRows.push({
      playerId: p.id,
      date: dateStr,
      loggedIn,
      played,
      freezeUsed,
      streakBroken,
      loginStreakAtDay: loginStreak,
      playStreakAtDay: playStreak,
      timestamp: ts,
    });
  }

  // Milestones earned before the demo month (their glory-days history).
  for (const h of p.historyRewards || []) {
    const rung = MILESTONES.find((m) => m.days === h.milestone);
    if (!rung) throw new Error(`${p.id}: unknown history milestone ${h.milestone}`);
    const type = h.axis === 'login' ? 'login_milestone' : 'play_milestone';
    rewardRows.push(buildReward(p.id, type, rung, isoMinusDays(ANCHOR_DATE, h.daysAgo)));
  }

  const player = {
    playerId: p.id,
    username: p.name,
    loginStreak,
    playStreak,
    bestLoginStreak,
    bestPlayStreak,
    lastLoginDate,
    lastPlayDate,
    freezesAvailable,
    freezesUsedThisMonth,
    lastFreezeGrantDate: DEMO_MONTH,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: `${ANCHOR_DATE}T23:59:59.000Z`,
  };

  return { player, activityRows, freezeRows, rewardRows };
}

async function put(table, item) {
  await docClient.send(new PutCommand({ TableName: table, Item: item }));
}

// The 3 keyed tables that ACCUMULATE rows per player (their SK is a unique
// rewardId / date), plus how to extract the primary key from a queried item.
// `streaks-players` is PK-only and is simply overwritten by the Put, so it needs
// no wipe — but we delete-then-write it too for a fully clean state.
const KEYED_TABLES = [
  { table: ACTIVITY_TABLE, key: (it) => ({ playerId: it.playerId, date: it.date }) },
  { table: REWARDS_TABLE, key: (it) => ({ playerId: it.playerId, rewardId: it.rewardId }) },
  { table: FREEZE_HISTORY_TABLE, key: (it) => ({ playerId: it.playerId, date: it.date }) },
];

/** Chunk an array into sub-arrays of at most `size` (BatchWrite caps at 25). */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Delete every row a player owns in `table`, bounded and Scan-free: a `Query` on
 * the PK collects the items, then `BatchWriteCommand` deletes them in chunks of
 * 25. Returns the number of rows removed. (Inv 8 permits a Scan in seed tooling,
 * but the per-player Query+BatchWrite is cleaner and bounded.)
 */
async function wipePlayerTable(playerId, table, keyOf) {
  const found = await docClient.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'playerId = :p',
      ExpressionAttributeValues: { ':p': playerId },
    }),
  );
  const items = found.Items || [];
  for (const batch of chunk(items, 25)) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [table]: batch.map((it) => ({ DeleteRequest: { Key: keyOf(it) } })),
        },
      }),
    );
  }
  return items.length;
}

/** Wipe all 4 tables for one seed player so the subsequent write is clean. */
async function wipePlayer(playerId) {
  let removed = 0;
  for (const { table, key } of KEYED_TABLES) {
    removed += await wipePlayerTable(playerId, table, key);
  }
  // streaks-players is PK-only; the upcoming Put overwrites it, so no delete needed.
  return removed;
}

async function seed() {
  console.log(`Seeding streaks data to ${ENDPOINT} (anchor ${ANCHOR_DATE}, demo month ${DEMO_MONTH}) ...`);

  // Wipe-then-write: clear every seed id (incl. legacy streak-005..010 from the
  // old 10-player seed) so a re-run lands on a clean, deterministic dataset.
  const wipeIds = Array.from(new Set([...LEGACY_IDS, ...PERSONAS.map((p) => p.id)]));
  let wiped = 0;
  for (const id of wipeIds) {
    wiped += await wipePlayer(id);
  }
  console.log(`Wiped ${wiped} pre-existing rows across ${wipeIds.length} ids.`);

  let players = 0;
  let activity = 0;
  let rewards = 0;
  let freezes = 0;

  for (const persona of PERSONAS) {
    const { player, activityRows, freezeRows, rewardRows } = buildPersona(persona);

    for (const row of activityRows) {
      await put(ACTIVITY_TABLE, row);
      activity += 1;
    }
    for (const row of freezeRows) {
      await put(FREEZE_HISTORY_TABLE, row);
      freezes += 1;
    }
    for (const row of rewardRows) {
      await put(REWARDS_TABLE, row);
      rewards += 1;
    }
    await put(PLAYERS_TABLE, player);
    players += 1;

    console.log(
      `  ${player.username} (${persona.id}): login=${player.loginStreak} play=${player.playStreak} ` +
        `best=${player.bestLoginStreak}/${player.bestPlayStreak} ` +
        `freezes=${player.freezesAvailable} used=${player.freezesUsedThisMonth} ` +
        `| activity:${activityRows.length} rewards:${rewardRows.length} freezeHist:${freezeRows.length}`,
    );
  }

  console.log(
    `\nSeeded ${players} players, ${activity} activity rows, ${rewards} rewards, ${freezes} freeze-history rows.`,
  );
  console.log('Done!');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
