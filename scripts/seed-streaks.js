#!/usr/bin/env node

/**
 * Seed the streaks DynamoDB tables with realistic login/play/freeze/reward data
 * (DATA_MODEL.md §11). Run after `docker compose --profile streaks up`.
 *
 *   node scripts/seed-streaks.js
 *
 * This is TOOLING, not the TS service — a plain Node CJS script. It writes only
 * (no reads, no `Scan`) using idempotent `PutCommand`s (overwrite), so it is safe
 * to re-run; it does NOT use the `attribute_not_exists` conditions that guard the
 * live API. `console.log` is fine here (STND-3 binds `src/`, not `scripts/`).
 *
 * What it generates, per the 10 players (`streak-001..010`) over 60 days ending
 * today (UTC):
 *   - `streaks-activity` rows carrying exactly the fields the calendar +
 *     presenter read: { playerId, date, loggedIn, played, loginStreakAtDay,
 *     playStreakAtDay, freezeUsed, streakBroken } (+ a `timestamp` write stamp).
 *   - `streaks-freeze-history` rows { playerId, date, source, createdAt } for
 *     each protected single-day gap.
 *   - `streaks-rewards` rows (§4.4 shape: rewardId, type, milestone, points,
 *     streakCount, createdAt, pointTxnType:'streak_bonus', notification Map)
 *     each time a streak counter EQUALS a milestone (incl. re-award after reset).
 *   - one `streaks-players` aggregate per player, derived LAST from the walk.
 *
 * Per day the two signals are independent (FR-1.3):
 *   loggedIn ~ Bernoulli(consistency); played ~ Bernoulli(consistency * 0.6).
 * Streak counters reset on a gap; SOME single-day gaps are protected by a freeze
 * (carry the streak, write the freeze rows) when the player has balance.
 */

'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

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

const DAYS = 60;
const PLAY_FACTOR = 0.6; // play is rarer than login (DATA_MODEL §11).
const FREEZE_PROTECT_CHANCE = 0.6; // chance to spend a freeze on a single-day gap.

const PLAYERS = [
  { id: 'streak-001', name: 'DailyGrinder', consistency: 0.9, freezes: 2 },
  { id: 'streak-002', name: 'WeekendWarrior', consistency: 0.3, freezes: 1 },
  { id: 'streak-003', name: 'IronWill', consistency: 0.95, freezes: 2 },
  { id: 'streak-004', name: 'CasualPlayer', consistency: 0.2, freezes: 1 },
  { id: 'streak-005', name: 'StreakHunter', consistency: 0.85, freezes: 2 },
  { id: 'streak-006', name: 'Newcomer', consistency: 0.5, freezes: 1 },
  { id: 'streak-007', name: 'Veteran', consistency: 0.75, freezes: 2 },
  { id: 'streak-008', name: 'NightOwl', consistency: 0.6, freezes: 1 },
  { id: 'streak-009', name: 'EarlyBird', consistency: 0.7, freezes: 2 },
  { id: 'streak-010', name: 'Perfectionist', consistency: 1.0, freezes: 2 },
];

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

/** UTC `YYYY-MM-DD` for a Date. */
function isoDate(date) {
  return date.toISOString().split('T')[0];
}

/** UTC `YYYY-MM` for a Date. */
function yearMonth(date) {
  return date.toISOString().slice(0, 7);
}

/**
 * A lexicographically-sortable, time-ordered reward id (mirrors
 * reward.service.ts `makeRewardId`): a 15-digit zero-padded epoch-millis prefix
 * so a `Query` with `ScanIndexForward=false` returns newest-first directly.
 */
function makeRewardId(isoInstant) {
  const prefix = String(new Date(isoInstant).getTime()).padStart(15, '0');
  const suffix = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
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

/**
 * Walk one player forward over the 60-day window, emitting activity / freeze /
 * reward rows and returning the derived aggregate. The streak math here mirrors
 * the live service: a consecutive active day advances the counter; a gap either
 * is freeze-protected (single missed day, balance available → carry + record) or
 * breaks (reset to 0 on the break day).
 */
function walkPlayer(player, today) {
  const activityRows = [];
  const freezeRows = [];
  const rewardRows = [];

  let loginStreak = 0;
  let playStreak = 0;
  let bestLoginStreak = 0;
  let bestPlayStreak = 0;
  let lastLoginDate = null;
  let lastPlayDate = null;
  let freezesAvailable = player.freezes;
  let freezesUsedThisMonth = 0;

  for (let d = DAYS - 1; d >= 0; d--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - d);
    const dateStr = isoDate(date);
    const ts = date.toISOString();

    const loggedIn = Math.random() < player.consistency;
    const played = loggedIn && Math.random() < player.consistency * PLAY_FACTOR;

    // The two axes are INDEPENDENT (FR-1.3): the login gap is measured from the
    // last LOGIN day, the play gap from the last PLAY day. A day with no login is
    // a plain absent day (no row) — the calendar synthesizes `none` for it —
    // unless a freeze protects it (emitted below).
    if (!loggedIn) {
      continue;
    }

    const loginGap = lastLoginDate === null ? null : daysBetweenDates(lastLoginDate, dateStr);
    let freezeUsed = false;
    let streakBroken = false;

    if (loginGap === null || loginGap === 1) {
      // First-ever login or a consecutive day → advance.
      loginStreak += 1;
    } else if (
      loginGap === 2 &&
      freezesAvailable > 0 &&
      Math.random() < FREEZE_PROTECT_CHANCE
    ) {
      // A single missed day, protected by a freeze → carry the streak across it.
      freezesAvailable -= 1;
      freezesUsedThisMonth += 1;
      const missedStr = priorDay(dateStr);
      const source = freezesUsedThisMonth === 1 ? 'free_monthly' : 'purchased';
      freezeRows.push({ playerId: player.id, date: missedStr, source, createdAt: ts });
      // Mark the protected (missed) day's activity row freezeUsed=true so the
      // calendar renders it blue (a save, not a break).
      activityRows.push({
        playerId: player.id,
        date: missedStr,
        loggedIn: false,
        played: false,
        freezeUsed: true,
        streakBroken: false,
        loginStreakAtDay: loginStreak,
        playStreakAtDay: playStreak,
        timestamp: ts,
      });
      loginStreak += 1; // streak carries across the protected day, then today advances it.
    } else {
      // A real break (multi-day gap, or single gap with no/declined freeze).
      streakBroken = true;
      loginStreak = 1;
    }

    // Play axis advances only on a played day, independently of the login gap.
    if (played) {
      const playGap = lastPlayDate === null ? null : daysBetweenDates(lastPlayDate, dateStr);
      playStreak = playGap === 1 ? playStreak + 1 : 1;
      lastPlayDate = dateStr;
    }

    lastLoginDate = dateStr;
    bestLoginStreak = Math.max(bestLoginStreak, loginStreak);
    bestPlayStreak = Math.max(bestPlayStreak, playStreak);

    // Reward when a counter EQUALS a milestone (incl. re-award after a reset).
    const loginRung = milestoneAt(loginStreak);
    if (loginRung) {
      rewardRows.push(buildReward(player.id, 'login_milestone', loginRung, ts));
    }
    const playRung = played ? milestoneAt(playStreak) : null;
    if (playRung) {
      rewardRows.push(buildReward(player.id, 'play_milestone', playRung, ts));
    }

    activityRows.push({
      playerId: player.id,
      date: dateStr,
      loggedIn: true,
      played,
      freezeUsed,
      streakBroken,
      loginStreakAtDay: loginStreak,
      playStreakAtDay: playStreak,
      timestamp: ts,
    });
  }

  const createdAt = new Date(today.getTime() - DAYS * 86400000).toISOString();
  const player_ = {
    playerId: player.id,
    username: player.name,
    loginStreak,
    playStreak,
    bestLoginStreak,
    bestPlayStreak,
    lastLoginDate,
    lastPlayDate,
    freezesAvailable,
    freezesUsedThisMonth,
    lastFreezeGrantDate: yearMonth(today),
    createdAt,
    updatedAt: today.toISOString(),
  };

  return { player: player_, activityRows, freezeRows, rewardRows };
}

/** Whole UTC days between two `YYYY-MM-DD` dates (b − a). */
function daysBetweenDates(a, b) {
  const ta = new Date(`${a}T00:00:00Z`).getTime();
  const tb = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((tb - ta) / 86400000);
}

/** The UTC `YYYY-MM-DD` immediately before `dateStr`. */
function priorDay(dateStr) {
  return isoDate(new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - 86400000));
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

async function put(table, item) {
  await docClient.send(new PutCommand({ TableName: table, Item: item }));
}

async function seed() {
  console.log(`Seeding streaks data to ${ENDPOINT} ...`);
  const today = new Date(); // walked in UTC via getUTCDate.

  let players = 0;
  let activity = 0;
  let rewards = 0;
  let freezes = 0;

  for (const p of PLAYERS) {
    const { player, activityRows, freezeRows, rewardRows } = walkPlayer(p, today);

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
      `  ${p.name} (${p.id}): login=${player.loginStreak} play=${player.playStreak} ` +
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
