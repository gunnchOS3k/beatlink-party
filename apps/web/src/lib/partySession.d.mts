export type PublicPartyView = {
  code?: string;
  phase?: string;
  hostId?: string;
  members?: Array<{ id: string; role?: string; connected?: boolean }>;
  memberId?: string;
  party?: PublicPartyView;
};

export type PartyRequest = {
  method: string;
  url: string;
  body: Record<string, string> | Record<string, never>;
};

export type PartyPlan = {
  create: PartyRequest;
  join: (code: string) => PartyRequest;
  disconnect: (code: string, memberSession: string) => PartyRequest;
  end: (code: string, hostSession: string) => PartyRequest;
  unauthorizedEnd: (code: string, hostId: string) => PartyRequest;
};

export type PartyTransportResult = {
  status: number;
  body?: {
    hostSession?: string;
    code?: string;
    memberSession?: string;
    party?: PublicPartyView;
    error?: string;
  };
  members?: number | null;
  closed?: boolean;
};

export type PartyRunReport = {
  code: string;
  hostId: string;
  memberId: string;
  hostIdIsSession: boolean;
  guestContainsHostSession: boolean;
  logContainsHostSession: boolean;
  telemetryContainsHostSession: boolean;
  unauthorizedEndStatus: number;
  disconnectStatus: number;
  endStatus: number;
  membersAfterDisconnect: number | null;
  storeClosed: boolean;
};

export function publicPartyPayload(value: unknown, hostSession: string | undefined): PublicPartyView;

export function applicationPartyPlan(baseUrl: string): PartyPlan;

export function runApplicationParty(
  send: (request: PartyRequest) => Promise<PartyTransportResult> | PartyTransportResult,
  baseUrl: string,
): Promise<PartyRunReport>;

export function createHostParty(): Promise<{ code: string }>;

export function joinGuestParty(code: string): Promise<{ memberId: string; memberSession: string }>;

export function disconnectGuestParty(code: string, memberSession: string): Promise<void>;

export function endHostParty(code: string): Promise<{ ok: boolean; error?: string }>;
