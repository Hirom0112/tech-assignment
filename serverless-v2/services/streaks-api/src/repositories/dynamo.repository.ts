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
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { docClient } from '../../shared/config/dynamo';
import type { ActivityDay, PlayerStreak } from '../domain/types';

const PLAYERS_TABLE = process.env.STREAKS_PLAYERS_TABLE ?? 'streaks-players';
const ACTIVITY_TABLE = process.env.STREAKS_ACTIVITY_TABLE ?? 'streaks-activity';

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

/** True for a DynamoDB conditional-check failure (idempotency no-op). */
function isConditionalCheckFailed(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'ConditionalCheckFailedException'
  );
}
