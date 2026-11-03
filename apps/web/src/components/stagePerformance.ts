import type { ScoreEvent } from "@beatlink/shared";

/** Original cosmetic venue studies. Names are candidates, never established character canon. */
export const STAGE_VENUES = [
  {
    id: "link-room",
    name: "The Link Room",
    subtitle: "Ribbon architecture / electric club",
    art: "/brand/concert-ribbon-stage.svg",
  },
  {
    id: "afterglow-terrace",
    name: "Afterglow Terrace",
    subtitle: "Open sky / rooftop sessions",
    art: "/brand/venues/afterglow-terrace.svg",
  },
  {
    id: "resonance-hall",
    name: "Resonance Hall",
    subtitle: "Acoustic shell / intimate performance",
    art: "/brand/venues/resonance-hall.svg",
  },
] as const;
export type StageVenueId = (typeof STAGE_VENUES)[number]["id"];
export type StagePhase = "countdown" | "playing" | "paused" | "results";

export function stageVenue(id: string) {
  return STAGE_VENUES.find((venue) => venue.id === id) ?? STAGE_VENUES[0];
}

export interface StageReaction {
  playerId: string;
  grade: ScoreEvent["grade"];
  /** Sample of the displayed room clock when the accepted event was observed, not audio latency. */
  observedAtGameMs: number;
  roundKey: string;
}

const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

/** Pure presentation sampler. Repeating a clock snapshot repeats the exact pose. */
export function sampleStageMotion(input: {
  timeMs: number;
  bpm: number;
  offsetMs?: number;
  phase: StagePhase;
  reduceMotion?: boolean;
}) {
  const time = Math.max(0, finite(input.timeMs));
  const tempo = Math.max(1, finite(input.bpm, 120));
  const beatPosition = Math.max(
    0,
    finite(((time - finite(input.offsetMs ?? 0)) * tempo) / 60000),
  );
  const beatPhase = beatPosition % 1;
  const moving =
    (input.phase === "playing" || input.phase === "paused") &&
    !input.reduceMotion;
  return {
    beat: Math.floor(beatPosition) % 4,
    beatPhase,
    // A held paused snapshot retains its pose; there is no autonomous animation timer.
    sway: moving ? Math.sin((beatPosition * Math.PI) / 2) * 2.5 : 0,
    bounce: moving ? -Math.sin(beatPhase * Math.PI) * 3.5 : 0,
    arm: moving ? Math.sin(beatPosition * Math.PI) * 8 : 0,
    beam: moving ? Math.sin((beatPosition * Math.PI) / 8) * 9 : 0,
    light: moving ? 0.12 + Math.pow(1 - beatPhase, 3) * 0.12 : 0.15,
  };
}

/** Outcomes only come from game.score_update. Stale rounds/future samples never react. */
export function stageReactionStrength(
  reaction: StageReaction | undefined,
  timeMs: number,
  roundKey: string,
): number {
  if (
    !reaction ||
    reaction.roundKey !== roundKey ||
    !Number.isFinite(timeMs) ||
    !Number.isFinite(reaction.observedAtGameMs)
  )
    return 0;
  const elapsed = timeMs - reaction.observedAtGameMs;
  if (elapsed < 0 || elapsed >= 650) return 0;
  return Math.sin((Math.PI * elapsed) / 650);
}

/** Bounded cosmetic history. It cannot change a score or claim microphone authorization. */
export function observeStageScore(
  previous: readonly StageReaction[],
  event: ScoreEvent | null,
  timeMs: number,
  roundKey: string,
): StageReaction[] {
  if (
    !event ||
    !Number.isFinite(timeMs) ||
    !["perfect", "great", "good", "miss"].includes(event.grade)
  )
    return [...previous];
  return [
    ...previous.filter(
      (reaction) =>
        reaction.roundKey === roundKey && reaction.playerId !== event.playerId,
    ),
    {
      playerId: event.playerId,
      grade: event.grade,
      observedAtGameMs: Math.max(0, timeMs),
      roundKey,
    },
  ].slice(-8);
}
