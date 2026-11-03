import type { CSSProperties } from "react";
import type { Beatmap, Player } from "@beatlink/shared";
import { StagePerformers } from "./StagePerformers";
import {
  sampleStageMotion,
  stageVenue,
  STAGE_VENUES,
  type StagePhase,
  type StageReaction,
  type StageVenueId,
} from "./stagePerformance";
import "./concert-stage.css";

const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

/** Original vector scenery with live room data. Decorative light is never a score signal. */
export function ConcertStage({
  phase,
  title,
  artist,
  timeMs = 0,
  durationMs = 0,
  bpm = 120,
  crowd = 0,
  venueId = "link-room",
  onVenueChange,
  players = [],
  reactions = [],
  roundKey = "",
  offsetMs = 0,
  reduceMotion = false,
  vocalActive = false,
}: {
  phase: StagePhase;
  title: string;
  artist?: string;
  timeMs?: number;
  durationMs?: number;
  bpm?: number;
  crowd?: number;
  venueId?: StageVenueId;
  onVenueChange?: (id: StageVenueId) => void;
  players?: readonly Pick<
    Player,
    "id" | "name" | "role" | "color" | "connected"
  >[];
  reactions?: readonly StageReaction[];
  roundKey?: string;
  offsetMs?: number;
  reduceMotion?: boolean;
  vocalActive?: boolean;
}) {
  const now = Math.max(0, finite(timeMs));
  const safeBpm = finite(bpm, 120);
  const tempo = safeBpm > 0 ? safeBpm : 120;
  const motion = sampleStageMotion({
    timeMs: now,
    bpm: tempo,
    offsetMs,
    phase,
    reduceMotion,
  });
  const beat = motion.beat;
  const venue = stageVenue(venueId);
  const progress = durationMs > 0 ? Math.min(100, (now / durationMs) * 100) : 0;
  return (
    <section
      className="concert"
      data-testid="concert-stage"
      data-beat={beat}
      data-concert-phase={phase}
      data-venue-id={venue.id}
      data-stage-time-ms={now}
      data-motion-reduced={reduceMotion}
      aria-label="Concert stage"
    >
      <div
        className="concert-art"
        aria-hidden="true"
        style={
          {
            "--beam-angle": `${motion.beam}deg`,
            "--beam-opacity": motion.light,
          } as CSSProperties
        }
      >
        <img src={venue.art} alt="" width="1200" height="460" />
        <div className="concert-haze concert-haze-left" />
        <div className="concert-haze concert-haze-right" />
        <StagePerformers
          players={players}
          timeMs={now}
          bpm={tempo}
          offsetMs={offsetMs}
          phase={phase}
          reactions={reactions}
          roundKey={roundKey}
          reduceMotion={reduceMotion}
          vocalActive={vocalActive}
        />
        <span className="concert-venue">BL / {venue.name.toUpperCase()}</span>
        <span className="concert-edition">
          ONE ROOM.
          <br />
          EVERYONE IN THE MIX.
        </span>
      </div>
      <div className="concert-scene-tools">
        {onVenueChange ? (
          <label>
            <span>Stage</span>
            <select
              aria-label="Stage venue"
              value={venue.id}
              onChange={(event) =>
                onVenueChange(stageVenue(event.target.value).id)
              }
            >
              {STAGE_VENUES.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span>{venue.name}</span>
        )}
        <small>Original venue &amp; performer studies</small>
      </div>
      <div className="concert-marquee">
        <div className="concert-track">
          <p className="concert-kicker">
            {phase === "playing"
              ? "Now playing"
              : phase === "paused"
                ? "Paused · position held"
                : phase === "results"
                  ? "That was your moment"
                  : "Up next"}
          </p>
          <h2>{title}</h2>
          {artist ? <p className="concert-artist">{artist}</p> : null}
        </div>
        {phase === "playing" || phase === "paused" ? (
          <div className="concert-rhythm" aria-hidden="true">
            <span>{Math.round(tempo)} BPM</span>
            <div className="concert-beats">
              {[0, 1, 2, 3].map((i) => (
                <i key={i} data-current={i === beat}>
                  {i + 1}
                </i>
              ))}
            </div>
          </div>
        ) : (
          <span className="concert-phase">
            {phase === "results" ? "ROUND COMPLETE" : "GET READY"}
          </span>
        )}
      </div>
      {phase === "playing" || phase === "paused" ? (
        <div
          className="concert-progress"
          role="progressbar"
          aria-label="Song progress"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <p className="concert-crowd">
        {phase === "results" ? "Final crowd energy" : "Crowd energy"}{" "}
        <strong>
          {Math.round(Math.max(0, Math.min(100, finite(crowd))))}%
        </strong>
      </p>
    </section>
  );
}

const LOOKAHEAD_MS = 1800;
const NOTE_ROW = { tap: 0, hold: 1, swipe: 2 } as const;
const NOTE_ICON = { tap: "●", hold: "━", swipe: "›" } as const;

/** Positions derive only from the room clock and chart. No autonomous CSS note motion. */
export function ConcertNoteHighway({
  notes,
  timeMs,
}: {
  notes: Beatmap["notes"];
  timeMs: number;
}) {
  const now = Math.max(0, finite(timeMs));
  const upcoming = notes.filter(
    (note) => note.timeMs >= now - 100 && note.timeMs <= now + LOOKAHEAD_MS,
  );
  const next = upcoming.find((note) => note.timeMs >= now);
  return (
    <div
      className="concert-highway"
      data-testid="host-synced-note-lane"
      aria-label="Song note timeline"
    >
      <div className="concert-highway-heading">
        <span>Follow the beat</span>
        <span className="concert-next">
          {next ? `Next: ${next.type}` : "Listen for the next phrase"}
        </span>
      </div>
      <div className="concert-note-field" aria-hidden="true">
        <div className="concert-hit-line">
          <span>NOW</span>
        </div>
        {(["tap", "hold", "swipe"] as const).map((type, row) => (
          <div
            className="concert-note-rail"
            key={type}
            style={{ top: `${row * 30 + 24}px` }}
          >
            <span>{type}</span>
          </div>
        ))}
        {upcoming.map((note) => {
          const type =
            note.type === "hold"
              ? "hold"
              : note.type === "swipe"
                ? "swipe"
                : "tap";
          const distance = Math.max(
            0,
            Math.min(1, (note.timeMs - now) / LOOKAHEAD_MS),
          );
          return (
            <span
              key={note.id}
              className={`concert-note concert-note-${type}`}
              data-note-id={note.id}
              data-lane={type}
              style={
                {
                  "--distance": distance,
                  top: `${NOTE_ROW[type] * 30 + 24}px`,
                } as CSSProperties
              }
            >
              {NOTE_ICON[type]}
            </span>
          );
        })}
      </div>
      <p className="concert-highway-help">
        Tap ● <span>Hold ━</span> <span>Swipe ›</span> <b>Play on your phone</b>
      </p>
    </div>
  );
}
