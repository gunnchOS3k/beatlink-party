/**
 * Party networking digital membership — dual-socket / loopback evidence.
 * Connected seats ≠ physical LAN phone party. Never flips physicalLanAccepted.
 */

export interface PartyNetworkingSeat {
  role: 'host' | 'performer' | 'audience';
  connected: boolean;
  ready?: boolean;
}

export interface PartyNetworkingAssessment {
  hostBound: boolean;
  performerConnected: number;
  performerReady: number;
  audienceConnected: number;
  membershipOk: boolean;
  /** Digital dual-client / loopback only. */
  transportClass: 'loopback_dual_socket' | 'lan_secure_origin' | 'unknown';
  /** Always false until PHYSICAL_LAN_REVIEW_PACKET filled with devices. */
  physicalLanAccepted: false;
  honestyBanner: string;
  notes: string[];
}

export const PARTY_NETWORKING_HONESTY =
  'Socket membership / loopback dual-client ≠ physical LAN phone party. Scripted tabs do not count as independent humans.';

export function assessPartyNetworking(input: {
  seats: PartyNetworkingSeat[];
  transportClass?: PartyNetworkingAssessment['transportClass'];
}): PartyNetworkingAssessment {
  const transportClass = input.transportClass ?? 'loopback_dual_socket';
  const hostBound = input.seats.some((s) => s.role === 'host' && s.connected);
  const performers = input.seats.filter((s) => s.role === 'performer');
  const audience = input.seats.filter((s) => s.role === 'audience');
  const performerConnected = performers.filter((s) => s.connected).length;
  const performerReady = performers.filter((s) => s.connected && s.ready).length;
  const audienceConnected = audience.filter((s) => s.connected).length;
  const membershipOk = hostBound && performerConnected >= 1;
  const notes: string[] = [];
  if (!hostBound) notes.push('host_unbound');
  if (performerConnected < 1) notes.push('no_performer_connected');
  if (transportClass === 'loopback_dual_socket') {
    notes.push('loopback_dual_socket_not_physical_lan');
  }
  return {
    hostBound,
    performerConnected,
    performerReady,
    audienceConnected,
    membershipOk,
    transportClass,
    physicalLanAccepted: false,
    honestyBanner: `PARTY_NETWORKING membershipOk=${membershipOk} host=${hostBound} performers=${performerConnected}/${performerReady}ready audience=${audienceConnected} · physical_lan=false · ${PARTY_NETWORKING_HONESTY}`,
    notes,
  };
}
