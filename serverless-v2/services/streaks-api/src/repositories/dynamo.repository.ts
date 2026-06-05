/**
 * DynamoDB repository for the streaks engine (Inv 6 — ALL DynamoDB IO lives
 * here; handlers and services never touch `docClient`).
 *
 * Conditional writes are the load-bearing correctness primitives:
 *  - createPlayer:       attribute_not_exists(playerId)  (DATA_MODEL.md §7 B)
 *  - putActivity:        attribute_not_exists(#date)      (idempotency, §7 D / Inv 2)
 *  - advanceLoginStreak: ConditionExpression lastLoginDate = :yesterday, and a
 *                        SET (never a bare ADD) on the streak counter (Inv 3,
 *                        §7 C) — atomic counters double-count on retry.
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { docClient } from '../../shared/config/dynamo';
import type { ActivityDay, PlayerStreak, RewardRecord } from '../domain/types';

/** The `Update` leg of a `TransactWriteCommand` item (the doc-client shape). */
type TransactUpdate = NonNullable<
  NonNullable<TransactWriteCommand['input']['TransactItems']>[number]['Update']
>;

const PLAYERS_TABLE = process.env.STREAKS_PLAYERS_TABLE ?? 'streaks-players';
const ACTIVITY_TABLE = process.env.STREAKS_ACTIVITY_TABLE ?? 'streaks-activity';
const REWARDS_TABLE = process.env.STREAKS_REWARDS_TABLE ?? 'streaks-rewards';

/** Load a player aggregate, or `null` if never seen (DATA_MODEL.md §7 A). */
export async function getPlayer(playerId: string): Promise<PlayerStreak | null> {
  const result = await docClient.send(
    new GetCommand({ TableName: PLAYERS_TABLE, Key: { playerId } }),
  );
  return (result.Item as PlayerStreak | undefined) ?? null;
}

/**
 * Create a brand-new player record. `attribute_not_exists(playerId)` makes the
 * first check-in's create idempotent — a racing duplicate fails the condition.
 */
export async function createPlayer(player: PlayerStreak): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: PLAYERS_TABLE,
      Item: player,
      ConditionExpression: 'attribute_not_exists(playerId)',
    }),
  );
}

/**
 * Write today's activity row once-per-UTC-day. `attribute_not_exists(#date)`
 * (the SK) is the true idempotency gate (Inv 2): returns `true` on the first
 * write of the day, `false` on a same-day repeat (the condition fails).
 */
export async function putActivity(activity: ActivityDay): Promise<boolean> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: ACTIVITY_TABLE,
        Item: activity,
        ConditionExpression: 'attribute_not_exists(#date)',
        ExpressionAttributeNames: { '#date': 'date' },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return false;
    }
    throw err;
  }
}

/** Inputs to the conditional login-streak advance. */
export interface AdvanceLoginInput {
  playerId: string;
  loginStreak: number;
  bestLoginStreak: number;
  today: string;
  yesterday: string;
  now: string;
}

/**
 * Advance the login streak by a single conditional UpdateItem. The condition
 * `lastLoginDate = :yesterday` guarantees the streak advances exactly once even
 * under retry (Inv 3, RESEARCH.md Q3). The counter is written with
 * `SET loginStreak = :n` to the service-computed value — NEVER a bare `ADD`.
 * Returns `true` on success, `false` if the condition failed (already advanced).
 */
export async function advanceLoginStreak(input: AdvanceLoginInput): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PLAYERS_TABLE,
        Key: { playerId: input.playerId },
        UpdateExpression:
          'SET loginStreak = :n, bestLoginStreak = :best, lastLoginDate = :today, updatedAt = :now',
        ConditionExpression: 'lastLoginDate = :yesterday',
        ExpressionAttributeValues: {
          ':n': input.loginStreak,
          ':best': input.bestLoginStreak,
          ':today': input.today,
          ':yesterday': input.yesterday,
          ':now': input.now,
        },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return false;
    }
    throw err;
  }
}

/** Inputs to the login-streak reset (gap ≥ 2 with no freeze, S1). */
export interface ResetLoginInput {
  playerId: string;
  loginStreak: number;
  bestLoginStreak: number;
  today: string;
  now: string;
}

/**
 * Reset the login streak (`SET loginStreak = :n` — never `ADD`). Guarded by
 * `lastLoginDate <> :today` so a racing duplicate that already wrote today's
 * record cannot reset on top of it (defense-in-depth; the activity row's
 * condition is the primary gate). Returns `false` if the guard failed.
 */
export async function resetLoginStreak(input: ResetLoginInput): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PLAYERS_TABLE,
        Key: { playerId: input.playerId },
        UpdateExpression:
          'SET loginStreak = :n, bestLoginStreak = :best, lastLoginDate = :today, updatedAt = :now',
        ConditionExpression: 'lastLoginDate <> :today',
        ExpressionAttributeValues: {
          ':n': input.loginStreak,
          ':best': input.bestLoginStreak,
          ':today': input.today,
          ':now': input.now,
        },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return false;
    }
    throw err;
  }
}

/** Inputs to the play-activity merge (pattern E, DATA_MODEL.md §7). */
export interface MergePlayedInput {
  playerId: string;
  date: string;
  playStreakAtDay: number;
  loginStreakAtDay: number;
  loggedIn: boolean;
  streakBroken: boolean;
  now: string;
}

/**
 * Merge `played` into the day's activity row (DATA_MODEL.md §7 pattern E —
 * "create-once, narrowly-updatable"). The SAME day's row may already exist from
 * a login check-in; this `UpdateCommand` flips `played=true` and stamps
 * `playStreakAtDay` without re-creating it.
 *
 * The create-or-merge condition `attribute_not_exists(#date) OR #played <> :true`
 * is the idempotency gate for `hand-completed` (Inv 2): it passes on the FIRST
 * hand of the UTC day (row absent, or present from login with `played=false`)
 * and FAILS on every later hand (`played` already true) → returns `false`. On a
 * create it also seeds the row's other booleans so a play-without-login day is
 * a complete row. Counters are written with `SET` — never a bare `ADD` (Inv 3).
 *
 * Returns `true` if this call was the first-of-day merge, `false` on a repeat.
 */
export async function mergePlayed(input: MergePlayedInput): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: ACTIVITY_TABLE,
        Key: { playerId: input.playerId, date: input.date },
        UpdateExpression:
          'SET #played = :true, playStreakAtDay = :psad, ' +
          'loggedIn = if_not_exists(loggedIn, :loggedIn), ' +
          'freezeUsed = if_not_exists(freezeUsed, :false), ' +
          'streakBroken = if_not_exists(streakBroken, :broken), ' +
          'loginStreakAtDay = if_not_exists(loginStreakAtDay, :lsad), ' +
          '#timestamp = if_not_exists(#timestamp, :now)',
        ConditionExpression: 'attribute_not_exists(#date) OR #played <> :true',
        ExpressionAttributeNames: {
          '#date': 'date',
          '#played': 'played',
          '#timestamp': 'timestamp',
        },
        ExpressionAttributeValues: {
          ':true': true,
          ':false': false,
          ':psad': input.playStreakAtDay,
          ':loggedIn': input.loggedIn,
          ':broken': input.streakBroken,
          ':lsad': input.loginStreakAtDay,
          ':now': input.now,
        },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return false;
    }
    throw err;
  }
}

/** Inputs to the conditional play-streak advance. */
export interface AdvancePlayInput {
  playerId: string;
  playStreak: number;
  bestPlayStreak: number;
  day: string;
  yesterday: string;
  now: string;
}

/**
 * Advance the play streak by a single conditional UpdateItem, mirroring
 * `advanceLoginStreak` on the PLAY axis (FR-1.3 independence — touches only
 * playStreak/bestPlayStreak/lastPlayDate). The condition
 * `lastPlayDate = :yesterday` guarantees the streak advances exactly once even
 * under retry (Inv 3). The counter is `SET playStreak = :n` — NEVER a bare
 * `ADD`. Returns `false` if the condition failed (already advanced).
 */
export async function advancePlayStreak(input: AdvancePlayInput): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PLAYERS_TABLE,
        Key: { playerId: input.playerId },
        UpdateExpression:
          'SET playStreak = :n, bestPlayStreak = :best, lastPlayDate = :day, updatedAt = :now',
        ConditionExpression: 'lastPlayDate = :yesterday',
        ExpressionAttributeValues: {
          ':n': input.playStreak,
          ':best': input.bestPlayStreak,
          ':day': input.day,
          ':yesterday': input.yesterday,
          ':now': input.now,
        },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return false;
    }
    throw err;
  }
}

/** Inputs to the play-streak reset (gap ≥ 2 with no freeze, S2). */
export interface ResetPlayInput {
  playerId: string;
  playStreak: number;
  bestPlayStreak: number;
  day: string;
  now: string;
}

/**
 * Reset the play streak (`SET playStreak = :n` — never `ADD`). Mirrors
 * `resetLoginStreak` on the play axis; guarded by `lastPlayDate <> :day` so a
 * racing duplicate that already wrote the day cannot reset on top of it
 * (the activity merge is the primary gate). Returns `false` if the guard fails.
 */
export async function resetPlayStreak(input: ResetPlayInput): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PLAYERS_TABLE,
        Key: { playerId: input.playerId },
        UpdateExpression:
          'SET playStreak = :n, bestPlayStreak = :best, lastPlayDate = :day, updatedAt = :now',
        ConditionExpression: 'lastPlayDate <> :day',
        ExpressionAttributeValues: {
          ':n': input.playStreak,
          ':best': input.bestPlayStreak,
          ':day': input.day,
          ':now': input.now,
        },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return false;
    }
    throw err;
  }
}

/**
 * The player-advance leg of a milestone award transaction. Carries exactly the
 * fields the conditional Update inside the transaction needs, plus the
 * discriminators that pick the right axis (`login`/`play`) and condition
 * (new-player create vs yesterday-advance). `loginStreak`/`bestLoginStreak` are
 * present for the login axis; `playStreak`/`bestPlayStreak` for the play axis.
 */
export interface AwardPlayerLeg {
  playerId: string;
  axis: 'login' | 'play';
  isNewPlayer: boolean;
  date: string;
  yesterday: string;
  loginStreak?: number;
  bestLoginStreak?: number;
  playStreak?: number;
  bestPlayStreak?: number;
}

/** Inputs to the atomic milestone award (Inv 4). */
export interface AwardMilestoneInput {
  player: AwardPlayerLeg;
  activity: ActivityDay;
  reward: RewardRecord;
  now: string;
}

/**
 * Award a milestone reward ATOMICALLY (CLAUDE.md Inv 4, DATA_MODEL.md §8,
 * ARCHITECTURE.md §5d). A single `TransactWriteCommand` bundles exactly three
 * writes so there is never an awarded-but-unrecorded reward:
 *
 *  1. player **Update** — the SAME conditional-advance semantics as the cheap
 *     path (`SET` the service-computed counter, condition on the prior day /
 *     new-player create; NEVER a bare `ADD` — Inv 3), so the transaction stays
 *     retry-safe and idempotent.
 *  2. activity **write** — the once-per-UTC-day row. On the LOGIN axis this is a
 *     `Put` with `attribute_not_exists(#date)` (Inv 2): the row's existence is
 *     the idempotency key for the whole day. On the PLAY axis it is the SAME
 *     create-or-merge `Update` as `mergePlayed` (the day's row may already exist
 *     from a login check-in with `played=false`), so a play milestone flips
 *     `played=true` without clobbering the login row.
 *  3. reward **Put** on `streaks-rewards` carrying every §4.4 field +
 *     `pointTxnType:'streak_bonus'` (the folded point-txn, DATA_MODEL.md §4) +
 *     the `notification` Map (§5), guarded by `attribute_not_exists(rewardId)`
 *     so a duplicate award (same id) cannot double-write.
 *
 * Returns `true` on commit, `false` if the transaction was cancelled by a
 * condition (a racing duplicate already advanced the day) — the caller treats
 * that as the same-day idempotent no-op.
 */
export async function awardMilestone(input: AwardMilestoneInput): Promise<boolean> {
  const { player, activity, reward, now } = input;

  const playerUpdate =
    player.axis === 'login'
      ? buildLoginAdvanceUpdate(player, now)
      : buildPlayAdvanceUpdate(player, now);

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Update: playerUpdate },
          buildActivityLeg(player.axis, activity, now),
          {
            Put: {
              TableName: REWARDS_TABLE,
              Item: {
                playerId: player.playerId,
                ...reward,
                pointTxnType: 'streak_bonus',
              },
              ConditionExpression: 'attribute_not_exists(rewardId)',
            },
          },
        ],
      }),
    );
    return true;
  } catch (err) {
    if (isTransactionCancelled(err)) {
      return false;
    }
    throw err;
  }
}

/** One TransactWriteCommand item (the doc-client shape). */
type TransactItem = NonNullable<TransactWriteCommand['input']['TransactItems']>[number];

/**
 * The activity leg of the award transaction. LOGIN → a `Put` gated by
 * `attribute_not_exists(#date)` (the day's row is created fresh by the login
 * check-in). PLAY → the same create-or-merge `Update` as `mergePlayed` so a play
 * milestone on a day that already has a login row merges `played=true` instead
 * of failing the put. Either way the activity condition is the per-day
 * idempotency gate that makes the whole award fire at most once per UTC day.
 */
function buildActivityLeg(
  axis: 'login' | 'play',
  activity: ActivityDay,
  now: string,
): TransactItem {
  if (axis === 'login') {
    return {
      Put: {
        TableName: ACTIVITY_TABLE,
        Item: activity,
        ConditionExpression: 'attribute_not_exists(#date)',
        ExpressionAttributeNames: { '#date': 'date' },
      },
    };
  }
  return {
    Update: {
      TableName: ACTIVITY_TABLE,
      Key: { playerId: activity.playerId, date: activity.date },
      UpdateExpression:
        'SET #played = :true, playStreakAtDay = :psad, ' +
        'loggedIn = if_not_exists(loggedIn, :loggedIn), ' +
        'freezeUsed = if_not_exists(freezeUsed, :false), ' +
        'streakBroken = if_not_exists(streakBroken, :broken), ' +
        'loginStreakAtDay = if_not_exists(loginStreakAtDay, :lsad), ' +
        '#timestamp = if_not_exists(#timestamp, :now)',
      ConditionExpression: 'attribute_not_exists(#date) OR #played <> :true',
      ExpressionAttributeNames: {
        '#date': 'date',
        '#played': 'played',
        '#timestamp': 'timestamp',
      },
      ExpressionAttributeValues: {
        ':true': true,
        ':false': false,
        ':psad': activity.playStreakAtDay,
        ':loggedIn': activity.loggedIn,
        ':broken': activity.streakBroken,
        ':lsad': activity.loginStreakAtDay,
        ':now': now,
      },
    },
  };
}

/**
 * The login player-Update leg. For a brand-new player the milestone is reached
 * on the first-ever check-in: the Update doubles as the create, guarded by
 * `attribute_not_exists(playerId)` (so it only fires when the row is absent) and
 * seeds the full player shape. For an existing player it is the same conditional
 * advance as `advanceLoginStreak` (`SET`, condition `lastLoginDate = :yesterday`).
 */
function buildLoginAdvanceUpdate(
  player: AwardPlayerLeg,
  now: string,
): TransactUpdate {
  const loginStreak = player.loginStreak ?? 0;
  const bestLoginStreak = player.bestLoginStreak ?? loginStreak;
  if (player.isNewPlayer) {
    return {
      TableName: PLAYERS_TABLE,
      Key: { playerId: player.playerId },
      UpdateExpression:
        'SET loginStreak = :n, bestLoginStreak = :best, lastLoginDate = :today, ' +
        'playStreak = if_not_exists(playStreak, :zero), ' +
        'bestPlayStreak = if_not_exists(bestPlayStreak, :zero), ' +
        'lastPlayDate = if_not_exists(lastPlayDate, :null), ' +
        'freezesAvailable = if_not_exists(freezesAvailable, :zero), ' +
        'freezesUsedThisMonth = if_not_exists(freezesUsedThisMonth, :zero), ' +
        'lastFreezeGrantDate = if_not_exists(lastFreezeGrantDate, :null), ' +
        'createdAt = if_not_exists(createdAt, :now), updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(playerId)',
      ExpressionAttributeValues: {
        ':n': loginStreak,
        ':best': bestLoginStreak,
        ':today': player.date,
        ':zero': 0,
        ':null': null,
        ':now': now,
      },
    };
  }
  return {
    TableName: PLAYERS_TABLE,
    Key: { playerId: player.playerId },
    UpdateExpression:
      'SET loginStreak = :n, bestLoginStreak = :best, lastLoginDate = :today, updatedAt = :now',
    ConditionExpression: 'lastLoginDate = :yesterday',
    ExpressionAttributeValues: {
      ':n': loginStreak,
      ':best': bestLoginStreak,
      ':today': player.date,
      ':yesterday': player.yesterday,
      ':now': now,
    },
  };
}

/**
 * The play player-Update leg — mirrors `buildLoginAdvanceUpdate` on the PLAY
 * axis (FR-1.3 independence — touches only playStreak/bestPlayStreak/lastPlayDate
 * for an existing player). New-player create seeds the full shape with play
 * streak 1+ and is guarded by `attribute_not_exists(playerId)`.
 */
function buildPlayAdvanceUpdate(
  player: AwardPlayerLeg,
  now: string,
): TransactUpdate {
  const playStreak = player.playStreak ?? 0;
  const bestPlayStreak = player.bestPlayStreak ?? playStreak;
  if (player.isNewPlayer) {
    return {
      TableName: PLAYERS_TABLE,
      Key: { playerId: player.playerId },
      UpdateExpression:
        'SET playStreak = :n, bestPlayStreak = :best, lastPlayDate = :day, ' +
        'loginStreak = if_not_exists(loginStreak, :zero), ' +
        'bestLoginStreak = if_not_exists(bestLoginStreak, :zero), ' +
        'lastLoginDate = if_not_exists(lastLoginDate, :null), ' +
        'freezesAvailable = if_not_exists(freezesAvailable, :zero), ' +
        'freezesUsedThisMonth = if_not_exists(freezesUsedThisMonth, :zero), ' +
        'lastFreezeGrantDate = if_not_exists(lastFreezeGrantDate, :null), ' +
        'createdAt = if_not_exists(createdAt, :now), updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(playerId)',
      ExpressionAttributeValues: {
        ':n': playStreak,
        ':best': bestPlayStreak,
        ':day': player.date,
        ':zero': 0,
        ':null': null,
        ':now': now,
      },
    };
  }
  return {
    TableName: PLAYERS_TABLE,
    Key: { playerId: player.playerId },
    UpdateExpression:
      'SET playStreak = :n, bestPlayStreak = :best, lastPlayDate = :day, updatedAt = :now',
    ConditionExpression: 'lastPlayDate = :yesterday',
    ExpressionAttributeValues: {
      ':n': playStreak,
      ':best': bestPlayStreak,
      ':day': player.date,
      ':yesterday': player.yesterday,
      ':now': now,
    },
  };
}

/**
 * List a player's earned rewards, newest-first (DATA_MODEL.md §7 pattern H,
 * FR-5.4). A single `Query` on the PK with `ScanIndexForward=false` returns the
 * sortable time-ordered `rewardId`s newest-first directly — a `Scan` is never
 * used on this player path (Inv 8, NFR-8). Empty history → `[]`.
 */
export async function queryRewards(playerId: string): Promise<RewardRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: REWARDS_TABLE,
      KeyConditionExpression: 'playerId = :p',
      ExpressionAttributeValues: { ':p': playerId },
      ScanIndexForward: false,
    }),
  );
  return (result.Items as RewardRecord[] | undefined) ?? [];
}

/**
 * True for a `TransactWriteCommand` cancelled by a condition. The SDK surfaces
 * these as `TransactionCanceledException`; a milestone award is cancelled when a
 * racing duplicate already advanced the day, so the caller treats it as the
 * same-day idempotent no-op (mirrors `isConditionalCheckFailed` for the cheap
 * path).
 */
function isTransactionCancelled(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'TransactionCanceledException'
  );
}

/** True for a DynamoDB conditional-check failure (idempotency no-op). */
function isConditionalCheckFailed(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'ConditionalCheckFailedException'
  );
}
