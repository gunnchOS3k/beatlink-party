import type { CSSProperties } from "react";
import type { Player } from "@beatlink/shared";
import {
  sampleStageMotion,
  stageReactionStrength,
  type StagePhase,
  type StageReaction,
} from "./stagePerformance";

type StagePlayer = Pick<Player, "id" | "name" | "role" | "color" | "connected">;
const SKIN = ["#bb8262", "#81564d", "#d6ac8d", "#6e5049"];

/**
 * Original editable vector player representations, not approved fictional cast.
 * Authored jacket panels, hands, hair, footwear, microphone and percussion props.
 * All pose changes sample the supplied room clock / accepted outcomes. No local timer.
 */
export function StagePerformers({
  players,
  timeMs,
  bpm,
  offsetMs,
  phase,
  reactions,
  roundKey,
  reduceMotion = false,
  vocalActive = false,
}: {
  players: readonly StagePlayer[];
  timeMs: number;
  bpm: number;
  offsetMs: number;
  phase: StagePhase;
  reactions: readonly StageReaction[];
  roundKey: string;
  reduceMotion?: boolean;
  vocalActive?: boolean;
}) {
  const seats = players
    .filter((player) => player.connected && player.role)
    .slice(0, 8);
  const motion = sampleStageMotion({
    timeMs,
    bpm,
    offsetMs,
    phase,
    reduceMotion,
  });
  return (
    <svg
      className="stage-performers"
      viewBox="0 0 1200 460"
      aria-hidden="true"
      data-testid="stage-performers"
      data-performer-count={seats.length}
    >
      {seats.map((player, index) => {
        const x =
          seats.length === 1
            ? 600
            : 600 +
              (index - (seats.length - 1) / 2) *
                Math.min(175, 810 / Math.max(1, seats.length - 1));
        const scale = seats.length > 6 ? 0.76 : seats.length > 4 ? 0.88 : 1.02;
        const reaction = reactions.find((item) => item.playerId === player.id);
        const strength = stageReactionStrength(reaction, timeMs, roundKey);
        const responding = strength > 0 && phase !== "countdown";
        const miss = responding && reaction?.grade === "miss";
        const accent = player.color || "#8bdedb";
        const skin = SKIN[index % SKIN.length];
        const beatArm = reduceMotion ? 0 : motion.arm;
        const reactionArm = reduceMotion ? 0 : strength * (miss ? -9 : 22);
        const isVocal = player.role === "vocalist";
        const isHype = player.role === "hype_captain";
        const finish = phase === "results";
        return (
          <g
            key={player.id}
            transform={`translate(${x} 365) scale(${scale})`}
            data-stage-player-id={player.id}
            data-stage-role={player.role}
            data-reaction={responding ? reaction?.grade : "none"}
          >
            <ellipse cx="0" cy="3" rx="44" ry="7" fill="#040b18" opacity=".5" />
            {responding ? (
              <g className="stage-outcome" opacity={0.3 + strength * 0.7}>
                {miss ? (
                  <path
                    d="m-36-157 9 9m0-9-9 9"
                    stroke="#ffb4ac"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                ) : (
                  <>
                    <path
                      d="m-43-156 5-11 5 11-5 11Zm78-4 4-8 4 8-4 8Z"
                      fill={accent}
                    />
                    <path
                      d="m-48-122-7-4m102-5 8-4"
                      stroke="#f6e4b6"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </>
                )}
              </g>
            ) : null}
            <g
              className="stage-pose"
              transform={`translate(${motion.sway} ${motion.bounce})`}
            >
              {/* Distinct trouser masses, knees, cuffs and grounded practical stage shoes. */}
              <path
                d="M-23-68h45l6 32-6 28H5L0-47-5-8h-18l-5-28Z"
                fill={isHype ? "#303653" : "#202d42"}
                stroke="#627086"
                strokeWidth="1.5"
              />
              <path
                d="M-20-57-13-30-16-9M16-57 12-31 15-9"
                stroke="#45546b"
                strokeWidth="3"
              />
              <path
                d="M-24-12h22v12h-33q-5-6 11-12M5-12h20q16 6 10 12H4Z"
                fill="#182537"
                stroke="#9ba9b5"
                strokeWidth="1.5"
              />
              <path d="M-32-2h29m8 0h29" stroke={accent} strokeWidth="3" />
              {/* Closed, layered performance clothing; each role has a different outer silhouette. */}
              {isHype ? (
                <>
                  <path
                    d="m-19-117-28 17 15 48 32-7 32 7 15-48-28-17Z"
                    fill="#39405a"
                    stroke="#91a1b4"
                    strokeWidth="1.5"
                  />
                  <path
                    d="m-25-103 25 16 25-16M0-87v27"
                    stroke={accent}
                    strokeWidth="7"
                  />
                  <path
                    d="m-31-65 30 6 31-6"
                    stroke="#b8c1c8"
                    strokeWidth="2"
                  />
                </>
              ) : isVocal ? (
                <>
                  <path
                    d="m-17-117-17 13 7 49 22-4 6-15 7 15 20 4 8-49-18-13Z"
                    fill="#3b3751"
                    stroke="#a49ab5"
                    strokeWidth="1.5"
                  />
                  <path
                    d="m-15-114 9 35-15-11m35-24-9 35 15-11"
                    fill="#776282"
                    stroke={accent}
                    strokeWidth="2"
                  />
                  <path d="M-4-112h8v39h-8z" fill="#ded4c9" />
                  <path
                    d="M-25-61h17m16 0h17"
                    stroke={accent}
                    strokeWidth="3"
                  />
                </>
              ) : (
                <>
                  <path
                    d="m-18-116-17 14 9 40h52l9-40-17-14Z"
                    fill="#233b4d"
                    stroke="#86a7af"
                    strokeWidth="1.5"
                  />
                  <path
                    d="m-28-98 27 15 29-15M0-112v49"
                    stroke={accent}
                    strokeWidth="4"
                  />
                  <path
                    d="M-17-77h12m11 0h12"
                    stroke="#8ea6af"
                    strokeWidth="2"
                  />
                </>
              )}
              <path d="M-8-126v12q8 9 16 0v-12" fill={skin} stroke="#523c42" />
              {/* Shoulder joints are explicit vector groups, with rest geometry underneath. */}
              <g
                className="stage-limb"
                transform={`rotate(${(isHype ? -beatArm : beatArm) + (finish ? 12 : reactionArm)} -27 -106)`}
              >
                <path
                  d={
                    isHype
                      ? "M-28-105q-15 7-24-4l-12-13"
                      : "M-28-105q-17 7-18 24l12 13"
                  }
                  fill="none"
                  stroke={isVocal ? "#65506d" : "#486273"}
                  strokeWidth="15"
                  strokeLinecap="round"
                />
                {isHype ? (
                  <>
                    <path
                      d="m-64-122-9-9m9 9-2-13m2 13 4-12m-4 12 9-8"
                      stroke={skin}
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <ellipse cx="-64" cy="-122" rx="7" ry="8" fill={skin} />
                  </>
                ) : (
                  <>
                    <ellipse
                      cx="-34"
                      cy="-68"
                      rx="8"
                      ry="6"
                      fill={skin}
                      stroke="#735450"
                    />
                    {!isVocal ? (
                      <path
                        d="m-35-69 24 19"
                        stroke="#e4c995"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    ) : (
                      <path d="m-36-65 8-1" stroke="#d4b99c" strokeWidth="2" />
                    )}
                  </>
                )}
              </g>
              <g
                className="stage-limb"
                transform={`rotate(${(isVocal ? beatArm * 0.45 : -beatArm) - (finish ? 12 : reactionArm)} 27 -106)`}
              >
                <path
                  d={
                    isVocal
                      ? "M28-105q12 1 15-13l-6-12"
                      : isHype
                        ? "M28-105q15 7 24-4l12-13"
                        : "M28-105q17 7 18 24L34-68"
                  }
                  fill="none"
                  stroke={isVocal ? "#65506d" : "#486273"}
                  strokeWidth="15"
                  strokeLinecap="round"
                />
                {isVocal ? (
                  <>
                    <path
                      d="m34-127 3-21"
                      stroke="#cad4d6"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    <rect
                      x="31"
                      y="-160"
                      width="14"
                      height="16"
                      rx="7"
                      fill="#384b61"
                      stroke="#b7cad0"
                      strokeWidth="2"
                    />
                    <path
                      d="M34-156h8m-8 4h8m-8 4h8"
                      stroke={accent}
                      strokeWidth="1.5"
                    />
                    <ellipse cx="36" cy="-130" rx="7" ry="6" fill={skin} />
                    <path
                      d="M35-145q17 32 4 57"
                      stroke="#14263a"
                      strokeWidth="1.8"
                    />
                  </>
                ) : isHype ? (
                  <>
                    <ellipse cx="64" cy="-122" rx="7" ry="8" fill={skin} />
                    <path
                      d="m64-122 9-9m-9 9 2-13m-2 13-4-12m4 12-9-8"
                      stroke={skin}
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <path d="m61-116 6 4" stroke={accent} strokeWidth="5" />
                  </>
                ) : (
                  <>
                    <ellipse
                      cx="34"
                      cy="-68"
                      rx="8"
                      ry="6"
                      fill={skin}
                      stroke="#735450"
                    />
                    <path
                      d="m35-69-24 19"
                      stroke="#e4c995"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </>
                )}
              </g>
              {!isVocal && !isHype ? (
                <>
                  <path
                    d="M-31-54h62v10h-62Z"
                    fill="#111f32"
                    stroke="#91afb9"
                    strokeWidth="1.5"
                  />
                  <ellipse
                    cx="-16"
                    cy="-54"
                    rx="13"
                    ry="6"
                    fill="#718396"
                    stroke={accent}
                    strokeWidth="2"
                  />
                  <ellipse
                    cx="16"
                    cy="-54"
                    rx="13"
                    ry="6"
                    fill="#718396"
                    stroke={accent}
                    strokeWidth="2"
                  />
                  <path
                    d="M-27-42v35m54-35v35m-30-1h-30m30 0h13"
                    stroke="#879ba9"
                    strokeWidth="2.5"
                  />
                </>
              ) : null}
              <g
                className="stage-head"
                transform={`rotate(${miss ? 10 * strength : motion.sway * 0.5} 0 -144)`}
              >
                <ellipse
                  cx="0"
                  cy="-145"
                  rx="23"
                  ry="25"
                  fill={skin}
                  stroke="#533e47"
                  strokeWidth="1.5"
                />
                <ellipse cx="-23" cy="-144" rx="4" ry="6" fill={skin} />
                <ellipse cx="23" cy="-144" rx="4" ry="6" fill={skin} />
                {isVocal ? (
                  <path
                    d="M-23-145q-7-31 20-31 29-2 28 33l-9-14q-17 6-30-4Z"
                    fill="#263145"
                  />
                ) : isHype ? (
                  <>
                    <path
                      d="M-25-155q-5-27 24-25 30-3 28 25l-9-10-9 7-12-9-13 11Z"
                      fill="#202d3b"
                    />
                    <path
                      d="M-23-156q23-10 46 0"
                      stroke={accent}
                      strokeWidth="5"
                    />
                  </>
                ) : (
                  <>
                    <path
                      d="M-25-156q0-25 25-23 23-1 26 24Z"
                      fill="#34455a"
                      stroke="#91a1b3"
                    />
                    <path
                      d="M-25-155q25-6 49 0"
                      stroke={accent}
                      strokeWidth="5"
                    />
                  </>
                )}
                <path
                  d="m-14-147 8-1m12 0 8 1"
                  stroke="#46333c"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <ellipse cx="-10" cy="-141" rx="2.2" ry="3" fill="#162437" />
                <ellipse cx="10" cy="-141" rx="2.2" ry="3" fill="#162437" />
                <path
                  d="m0-141-2 7h4"
                  stroke="#93675c"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                {isVocal && vocalActive && phase === "playing" ? (
                  <ellipse cx="0" cy="-127" rx="4" ry="5" fill="#6c4148" />
                ) : (
                  <path
                    d={miss ? "M-5-126q5-3 10 0" : "M-6-128q6 5 12 0"}
                    stroke="#603c46"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
                {!isVocal ? (
                  <path
                    d="M-26-149v13m52-13v13"
                    stroke="#a4bbc5"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                ) : null}
              </g>
            </g>
            <g
              className="stage-seat-label"
              style={{ "--seat-accent": accent } as CSSProperties}
            >
              <rect
                x="-57"
                y="13"
                width="114"
                height="22"
                rx="11"
                fill="#0a1727"
                fillOpacity=".94"
                stroke={accent}
                strokeOpacity=".65"
              />
              <text
                x="0"
                y="28"
                textAnchor="middle"
                fill="#eef3ef"
                fontSize="11"
                fontFamily="system-ui, sans-serif"
              >
                {player.name.length > 16
                  ? player.name.slice(0, 15) + "…"
                  : player.name}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
