/**
 * Team scoring helpers — Alpha digital.
 */

import type { Player, TeamId, TeamScoreboard } from '@beatlink/shared';
import { EMPTY_TEAM_SCORES } from '@beatlink/shared';

export function emptyTeamScores(): TeamScoreboard {
  return { ...EMPTY_TEAM_SCORES };
}

export function addPointsToTeam(
  scores: TeamScoreboard,
  teamId: TeamId,
  points: number,
): TeamScoreboard {
  return {
    ...scores,
    [teamId]: (scores[teamId] ?? 0) + points,
  };
}

export function recomputeTeamScores(players: Player[]): TeamScoreboard {
  const scores = emptyTeamScores();
  for (const p of players) {
    scores[p.teamId] = (scores[p.teamId] ?? 0) + p.score;
  }
  return scores;
}

export function winningTeam(scores: TeamScoreboard): TeamId | 'tie' | null {
  const entries: Array<[TeamId, number]> = [
    ['A', scores.A],
    ['B', scores.B],
  ];
  const active = entries.filter(([, s]) => s > 0);
  if (active.length === 0) {
    return scores.solo > 0 ? 'solo' : null;
  }
  active.sort((a, b) => b[1] - a[1]);
  if (active.length >= 2 && active[0]![1] === active[1]![1]) return 'tie';
  return active[0]![0];
}

/** Alternate A/B assignment for even party splits; leftover stays solo. */
export function autoAssignTeams(players: Player[]): Player[] {
  return players.map((p, i) => ({
    ...p,
    teamId: i % 2 === 0 ? 'A' : 'B',
  }));
}
