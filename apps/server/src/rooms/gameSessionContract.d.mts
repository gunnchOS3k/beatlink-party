export const GAME_SESSION_CONTRACT_NAME: 'gunnchos.beatlink.game_session';
export const GAME_SESSION_CONTRACT_VERSION: 1;
export const PEDESTRIAN_PURSUIT_APPLICATION_ID: 'pedestrian-pursuit';

export type GameSessionPhase = 'lobby' | 'playing' | 'closed';
export type RematchOrExitChoice = 'rematch' | 'exit';
export type SharedEventType = 'result' | 'rematch_or_exit';

export type PublicGameSession = {
  contract: 'gunnchos.beatlink.game_session';
  version: 1;
  applicationId: 'pedestrian-pursuit';
  roomCode: string;
  hostId: string;
  phase: GameSessionPhase;
  memberId: string | null;
  guestConnected: boolean;
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
  | { status: 403 | 404 | 409; error: string };

export type HostActionResult =
  | { status: 200; session: PublicGameSession }
  | { status: 403 | 404; error: string };

export type PublishResult =
  | { status: 200; event: SharedEventView }
  | { status: 400 | 403 | 404 | 409 | 422; error: string };

export type RuntimeSubmitResult =
  | { status: 200; result: RuntimeRaceResult }
  | { status: 404 | 422; error: string };

export type GuestConnectionResult =
  | { status: 200; payload: GuestView }
  | { status: 403 | 410; error: string };

export type AcknowledgeResult =
  | { status: 200; event: SharedEventView; bothAcknowledged: boolean }
  | { status: 403 | 404; error: string };

export function resetGameSessions(): void;

export function runtimeRaceDigest(result: {
  applicationId: string;
  roomCode: string;
  courseId: string;
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
): RedeemInvitationResult | { status: 403 | 502; error: string };

export function startGame(presentedSession: string): HostActionResult;

export function rematchGame(presentedSession: string): HostActionResult;

export function endGame(presentedSession: string): HostActionResult;

export function disconnectGuest(memberSession: string): GuestConnectionResult;

export function reconnectGuest(memberSession: string): GuestConnectionResult;

export function submitRuntimeRaceResult(result: RuntimeRaceResult): RuntimeSubmitResult;

export function publishResult(
  presentedSession: string,
  packet: { runtimeDigest?: string },
): PublishResult;

export function publishRematchOrExit(
  presentedSession: string,
  choice: RematchOrExitChoice,
): PublishResult;

export function acknowledge(presentedSession: string, eventId: string): AcknowledgeResult;

export function readLogs(roomCode: string): SessionLogEntry[];

export function readTelemetry(roomCode: string): SessionLogEntry[];
