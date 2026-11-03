import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScoreEvent } from "@beatlink/shared";
import { ConcertStage } from "../apps/web/src/components/ConcertStage";
import {
  observeStageScore,
  sampleStageMotion,
  stageReactionStrength,
  stageVenue,
  STAGE_VENUES,
} from "../apps/web/src/components/stagePerformance";

const outcome: ScoreEvent = Object.freeze({
  playerId: "seat-a",
  grade: "perfect",
  points: 100,
  streak: 2,
  combo: 1,
  message: "Perfect",
});
const players = [
  {
    id: "seat-a",
    name: "Aster",
    role: "beat_tapper" as const,
    color: "#7edcd7",
    connected: true,
  },
  {
    id: "seat-b",
    name: "Noor",
    role: "vocalist" as const,
    color: "#f1a9cd",
    connected: true,
  },
  {
    id: "seat-c",
    name: "Remy",
    role: "hype_captain" as const,
    color: "#c5d98e",
    connected: true,
  },
];

describe("original stage performance presentation — author checks, no art acceptance", () => {
  it("samples chart-offset beats without starting an independent clock", () => {
    const atDownbeat = sampleStageMotion({
      timeMs: 500,
      bpm: 120,
      offsetMs: 500,
      phase: "playing",
    });
    const next = sampleStageMotion({
      timeMs: 1000,
      bpm: 120,
      offsetMs: 500,
      phase: "playing",
    });
    expect(atDownbeat.beat).toBe(0);
    expect(atDownbeat.beatPhase).toBe(0);
    expect(next.beat).toBe(1);
    expect(
      sampleStageMotion({
        timeMs: 500,
        bpm: 120,
        offsetMs: 500,
        phase: "playing",
      }),
    ).toEqual(atDownbeat);
  });

  it("holds a paused snapshot and resets poses at countdown/results", () => {
    const snapshot = { timeMs: 875, bpm: 120, offsetMs: 100 };
    expect(sampleStageMotion({ ...snapshot, phase: "paused" })).toEqual(
      sampleStageMotion({ ...snapshot, phase: "playing" }),
    );
    for (const phase of ["countdown", "results"] as const) {
      const pose = sampleStageMotion({ ...snapshot, phase });
      expect([pose.sway, pose.bounce, pose.arm, pose.beam]).toEqual([
        0, 0, 0, 0,
      ]);
    }
  });

  it("reduces motion without hiding clock position, lyrics or score", () => {
    const pose = sampleStageMotion({
      timeMs: 750,
      bpm: 120,
      phase: "playing",
      reduceMotion: true,
    });
    expect(pose.beat).toBe(1);
    expect([pose.sway, pose.bounce, pose.arm, pose.beam]).toEqual([0, 0, 0, 0]);
    const html = renderToStaticMarkup(
      <ConcertStage
        phase="playing"
        title="Original phrase"
        timeMs={750}
        durationMs={2000}
        players={players}
        reduceMotion
      />,
    );
    expect(html).toContain("Original phrase");
    expect(html).toContain('aria-valuenow="38"');
    expect(html).toContain('data-motion-reduced="true"');
    expect(html).toContain('data-performer-count="3"');
  });

  it("uses actual accepted grades, round identity and room-clock age", () => {
    const reactions = observeStageScore([], outcome, 1000, "round-a");
    expect(reactions).toHaveLength(1);
    expect(stageReactionStrength(reactions[0], 1325, "round-a")).toBe(1);
    expect(stageReactionStrength(reactions[0], 1325, "round-b")).toBe(0);
    expect(stageReactionStrength(reactions[0], 999, "round-a")).toBe(0);
    expect(stageReactionStrength(reactions[0], 1650, "round-a")).toBe(0);
    expect(stageReactionStrength(reactions[0], Number.NaN, "round-a")).toBe(0);
    expect(outcome.points).toBe(100);
  });

  it("does not invent feedback for no event, and bounds one reaction per seat", () => {
    expect(observeStageScore([], null, 1000, "round-a")).toEqual([]);
    expect(observeStageScore([], outcome, Number.NaN, "round-a")).toEqual([]);
    let reactions = observeStageScore([], outcome, 1000, "round-a");
    reactions = observeStageScore(
      reactions,
      { ...outcome, grade: "miss" },
      1100,
      "round-a",
    );
    expect(reactions).toHaveLength(1);
    expect(reactions[0].grade).toBe("miss");
    for (let i = 0; i < 12; i++)
      reactions = observeStageScore(
        reactions,
        { ...outcome, playerId: `seat-${i}` },
        1200,
        "round-a",
      );
    expect(reactions).toHaveLength(8);
    expect(observeStageScore(reactions, outcome, 0, "round-b")).toHaveLength(1);
  });

  it("renders three distinct venue source paths and each actual role representation", () => {
    expect(new Set(STAGE_VENUES.map((venue) => venue.art)).size).toBe(3);
    for (const venue of STAGE_VENUES) {
      const html = renderToStaticMarkup(
        <ConcertStage
          phase="playing"
          title="An authorized original"
          venueId={venue.id}
          players={players}
          timeMs={1325}
          reactions={observeStageScore([], outcome, 1000, "round-a")}
          roundKey="round-a"
        />,
      );
      expect(html).toContain(venue.art);
      expect(html).toContain(`data-venue-id="${venue.id}"`);
      for (const player of players)
        expect(html).toContain(`data-stage-role="${player.role}"`);
      expect(html).toContain('data-reaction="perfect"');
    }
    expect(stageVenue("not-a-venue").id).toBe("link-room");
  });

  it("never fills an empty or disconnected roster with invented people", () => {
    const html = renderToStaticMarkup(
      <ConcertStage
        phase="playing"
        title="Room"
        players={players.map((player) => ({ ...player, connected: false }))}
      />,
    );
    expect(html).toContain('data-performer-count="0"');
    expect(html).not.toContain("data-stage-player-id=");
  });

  it("keeps numeric rendering finite for malformed clock/tempo values", () => {
    for (const timeMs of [Number.NaN, Number.POSITIVE_INFINITY, -100, 1e300]) {
      const pose = sampleStageMotion({
        timeMs,
        bpm: 1e300,
        offsetMs: Number.NaN,
        phase: "playing",
      });
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
    }
  });
});
