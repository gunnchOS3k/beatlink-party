export const GAME_SESSION_CONTRACT_NAME: 'gunnchos.beatlink.game_session';
export const GAME_SESSION_CONTRACT_VERSION: 2;
export const PEDESTRIAN_PURSUIT_APPLICATION_ID: 'pedestrian-pursuit';

export type GameSessionPhase = 'lobby' | 'playing' | 'results' | 'closed';
export type RematchOrExitChoice = 'rematch' | 'exit';
export type SharedEventType = 'result' | 'rematch_or_exit';

export type PublicGameSession = {
  contract: 'gunnchos.beatlink.game_session';
  version: 2;
  applicationId: 'pedestrian-pursuit';
  roomCode: string;
  hostId: string;
  phase: GameSessionPhase;
  memberId: string | null;
  guestConnected: boolean;
  roundId: string | null;
};

export type RuntimeSourceLog = {
  resultsPath: boolean;
  hostLapCompleted: boolean;
  guestLapCompleted: boolean;
  hostCheckpoint: boolean;
  guestCheckpoint: boolean;
};

export type RuntimeRaceResult = {
  applicationId: 'pedestrian-pursuit';
  roomCode: string;
  courseId: string;
  roundId: string;
  hostMemberId: string;
  guestMemberId: string;
  lapsCompleted: { host: number; guest: number };
  checkpointCrossings: { host: number; guest: number };
  drivenMsec: number;
  finishOrder: string[];
  bothFinished: true;
  producedBy: 'pedestrian-pursuit-race-runtime';
  sourceLog: RuntimeSourceLog;
  runtimeDigest: string;
};

export type SharedEventView = {
  type: SharedEventType;
  eventId: string;
  applicationId: 'pedestrian-pursuit';
  roomCode: string;
  choice: RematchOrExitChoice | null;
  result: RuntimeRaceResult | null;
  acknowledgements: { host: boolean; guest: boolean };
};

export type GuestView = PublicGameSession & { events: SharedEventView[] };

export type SessionLogEntry = {
  name: string;
  applicationId: 'pedestrian-pursuit';
  roomCode: string;
  hostId?: string;
  phase?: GameSessionPhase;
  memberId?: string;
  eventId?: string;
  role?: 'host' | 'guest';
  choice?: RematchOrExitChoice;
};

export type OpenGameSessionResult =
  | { status: 200; hostSession: string; invitation: string; session: PublicGameSession }
  | { status: 400 | 409; error: string };

export type RedeemInvitationResult =
  | { status: 200; memberId: string; memberSession: string; payload: GuestView }
  | { status: 400 | 403 | 404 | 409 | 410; error: string };

export type HostActionResult =
  | { status: 200; session: PublicGameSession }
  | { status: 403 | 404 | 409 | 410; error: string };

export type PublishResult =
  | { status: 200; event: SharedEventView }
  | { status: 400 | 403 | 404 | 409 | 410 | 422; error: string };

export type RuntimeSubmitResult =
  | { status: 200; result: RuntimeRaceResult }
  | { status: 403 | 404 | 409 | 410 | 422 | 503; error: string };

export type GuestConnectionResult =
  | { status: 200; payload: GuestView }
  | { status: 403 | 404 | 410; error: string };

export type AcknowledgeResult =
  | { status: 200; event: SharedEventView; bothAcknowledged: boolean }
  | { status: 403 | 404 | 409 | 410; error: string };

export function resetGameSessions(): void;

export function runtimeRaceDigest(result: {
  applicationId: string;
  roomCode: string;
  courseId: string;
  roundId?: string;
  hostMemberId: string;
  guestMemberId: string;
  lapsCompleted: { host: number; guest: number };
  checkpointCrossings: { host: number; guest: number };
  drivenMsec: number;
  finishOrder: string[];
  bothFinished: boolean;
  producedBy: string;
  sourceLog: RuntimeSourceLog;
}): string;

export function openGameSession(input: {
  applicationId: string;
  roomCode: string;
  hostId?: string;
  hostSession?: string;
}): OpenGameSessionResult;

export function openGameSessionOnRoom(applicationId: string): OpenGameSessionResult | { status: 502; error: string };

export function guestPayload(roomCode: string): { status: 200; payload: GuestView } | { status: 404; error: string };

export function redeemInvitation(
  invitation: string,
  roomMember?: { memberId: string; memberSession: string },
): RedeemInvitationResult;

export function redeemInvitationOnRoom(
  invitation: string,
  expectedRoomCode?: string,
): RedeemInvitationResult | { status: 403 | 502; error: string };

export function startGame(presentedSession: string, expectedRoomCode?: string): HostActionResult;

export function rematchGame(presentedSession: string, expectedRoomCode?: string): HostActionResult;

export function endGame(presentedSession: string, expectedRoomCode?: string): HostActionResult;

export function disconnectGuest(memberSession: string, expectedRoomCode?: string): GuestConnectionResult;

export function reconnectGuest(memberSession: string, expectedRoomCode?: string): GuestConnectionResult;

export function submitRuntimeRaceResult(result: RuntimeRaceResult, runtimeSession?: string): RuntimeSubmitResult;

export function publishResult(
  presentedSession: string,
  packet: { runtimeDigest?: string },
  expectedRoomCode?: string,
): PublishResult;

export function publishRematchOrExit(
  presentedSession: string,
  choice: RematchOrExitChoice,
  expectedRoomCode?: string,
): PublishResult;

export function acknowledge(presentedSession: string, eventId: string, expectedRoomCode?: string): AcknowledgeResult;

export function readLogs(roomCode: string): SessionLogEntry[];

export function readTelemetry(roomCode: string): SessionLogEntry[];

/** Trusted in-process adapter only. No HTTP issuer exists. */
export function bindRuntimeProducer(input: { roomCode: string; roundId: string; courseId: string }):
  | { status: 200; runtimeSession: string; roomCode: string; roundId: string; courseId: string }
  | { status: 400 | 404 | 409 | 410; error: string };
