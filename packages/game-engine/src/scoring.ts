import type { Player, PlayerInputEvent, TimingGrade } from '@beatlink/shared';
import { SCORE_POINTS, comboFromStreak } from '@beatlink/shared';
import { gradeTiming, computeDeltaMs } from './timing.js';

export interface ScoreResult {
  grade: TimingGrade;
  points: number;
  streak: number;
  combo: number;
  accuracy: number;
  message: string;
  crowdBoost: number;
}

export function scoreBeatTap(
  input: PlayerInputEvent,
  targetTimeMs: number,
  gameTimeMs: number,
  currentStreak: number,
): ScoreResult {
  const delta = computeDeltaMs(gameTimeMs, targetTimeMs);
  const grade = gradeTiming(delta);
  const points = SCORE_POINTS[grade];
  const streak = grade === 'miss' ? 0 : currentStreak + 1;
  const combo = comboFromStreak(streak);
  const streakBonus = streak >= 5 ? Math.floor(streak / 5) * 50 : 0;
  const totalPoints = points + streakBonus;

  return {
    grade,
    points: totalPoints,
    streak,
    combo,
    accuracy: grade === 'miss' ? 0 : grade === 'perfect' ? 100 : grade === 'great' ? 85 : 70,
    message: grade === 'miss' ? 'Miss!' : grade.charAt(0).toUpperCase() + grade.slice(1) + '!',
    crowdBoost: grade === 'perfect' ? 5 : grade === 'great' ? 3 : grade === 'good' ? 1 : -2,
  };
}

export function scoreVocalPhrase(
  input: PlayerInputEvent,
  promptStartMs: number,
  promptDurationMs: number,
  gameTimeMs: number,
  currentStreak: number,
): ScoreResult {
  const promptEnd = promptStartMs + promptDurationMs;
  const inWindow = gameTimeMs >= promptStartMs - 200 && gameTimeMs <= promptEnd + 200;
  if (!inWindow) {
    return {
      grade: 'miss',
      points: 0,
      streak: 0,
      combo: 1,
      accuracy: 0,
      message: 'Too early or late!',
      crowdBoost: -1,
    };
  }
  const mid = promptStartMs + promptDurationMs / 2;
  const delta = computeDeltaMs(gameTimeMs, mid);
  const grade = gradeTiming(delta);
  const points = SCORE_POINTS[grade] + 50;
  const streak = grade === 'miss' ? 0 : currentStreak + 1;
  const combo = comboFromStreak(streak);

  return {
    grade,
    points,
    streak,
    combo,
    accuracy: grade === 'miss' ? 40 : 90,
    message: grade === 'miss' ? 'Missed the phrase!' : 'Phrase hit!',
    crowdBoost: 4,
  };
}

export function scoreHypeAction(
  gameTimeMs: number,
  targetTimeMs: number,
  currentStreak: number,
): ScoreResult {
  const delta = computeDeltaMs(gameTimeMs, targetTimeMs);
  const grade = gradeTiming(delta);
  const points = grade === 'miss' ? 50 : SCORE_POINTS[grade] + 25;
  const streak = currentStreak + 1;
  const combo = comboFromStreak(streak);

  return {
    grade: grade === 'miss' ? 'good' : grade,
    points,
    streak,
    combo,
    accuracy: 80,
    message: 'Crowd boost!',
    crowdBoost: grade === 'perfect' ? 8 : 4,
  };
}

export function updatePlayerStats(player: Player, result: ScoreResult): Player {
  const totalInputs = player.score > 0 ? Math.ceil(player.score / 150) + 1 : 1;
  const hitInputs = result.grade !== 'miss' ? totalInputs : totalInputs - 1;
  const accuracy = Math.round((hitInputs / totalInputs) * 100);

  return {
    ...player,
    score: player.score + result.points,
    streak: result.streak,
    maxStreak: Math.max(player.maxStreak, result.streak),
    combo: result.combo,
    accuracy: Math.min(100, Math.round((player.accuracy + accuracy) / 2)),
  };
}
