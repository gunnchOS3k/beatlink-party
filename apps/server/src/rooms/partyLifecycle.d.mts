export type PartyMember = { id: string; role: 'host' | 'member'; connected: boolean };
export type PartyRecord = {
  code: string;
  phase: 'lobby' | 'closed';
  hostId: string;
  members: PartyMember[];
};
export function createParty(input: { code: string; hostId: string }): PartyRecord;
export function addMember(party: PartyRecord | undefined, memberId: string): PartyRecord | null;
export function disconnectMember(party: PartyRecord | undefined, memberId: string): PartyRecord | null;
export function endParty(party: PartyRecord | undefined, hostId: string): PartyRecord | null;
