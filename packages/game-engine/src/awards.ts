import type { Award, Player, PlayerRole } from '@beatlink/shared';

export function computeAwards(players: Player[]): Award[] {
  const awards: Award[] = [];
  if (players.length === 0) return awards;

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const mvp = sorted[0];
  if (mvp) {
    awards.push({
      id: 'mvp',
      label: 'MVP',
      playerId: mvp.id,
      playerName: mvp.name,
      reason: 'Highest overall score',
    });
  }

  const byRole = (role: PlayerRole) =>
    [...players].filter((p) => p.role === role).sort((a, b) => b.score - a.score)[0];

  const bestBeat = byRole('beat_tapper');
  if (bestBeat) {
    awards.push({
      id: 'best_beat',
      label: 'Best Beat',
      playerId: bestBeat.id,
      playerName: bestBeat.name,
      reason: 'Top rhythm performance',
    });
  }

  const bestVocal = byRole('vocalist');
  if (bestVocal) {
    awards.push({
      id: 'best_vocalist',
      label: 'Best Vocalist',
      playerId: bestVocal.id,
      playerName: bestVocal.name,
      reason: 'Strong phrase timing',
    });
  }

  const bestHype = byRole('hype_captain');
  if (bestHype) {
    awards.push({
      id: 'best_hype',
      label: 'Best Hype',
      playerId: bestHype.id,
      playerName: bestHype.name,
      reason: 'Crowd energy champion',
    });
  }

  const streakKing = [...players].sort((a, b) => b.maxStreak - a.maxStreak)[0];
  if (streakKing && streakKing.maxStreak >= 3) {
    awards.push({
      id: 'streak_king',
      label: 'Streak King',
      playerId: streakKing.id,
      playerName: streakKing.name,
      reason: `${streakKing.maxStreak}-hit combo`,
    });
  }

  const comeback = [...players].sort((a, b) => a.accuracy - b.accuracy)[0];
  if (comeback && comeback.score > 0 && comeback.accuracy < 70) {
    awards.push({
      id: 'most_chaotic',
      label: 'Most Chaotic',
      playerId: comeback.id,
      playerName: comeback.name,
      reason: 'Played with heart, not precision',
    });
  }

  return awards;
}
