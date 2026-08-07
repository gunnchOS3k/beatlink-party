import type { TelemetryEvent, TelemetryEventName } from './types.js';

export type TelemetrySink = (event: TelemetryEvent) => void;

const sinks: TelemetrySink[] = [];

/** Non-cryptographic room-code hash — avoids storing live join codes; browser-safe. */
export function hashRoomCode(code: string): string {
  const input = code.toUpperCase();
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function registerTelemetrySink(sink: TelemetrySink): () => void {
  sinks.push(sink);
  return () => {
    const idx = sinks.indexOf(sink);
    if (idx >= 0) sinks.splice(idx, 1);
  };
}

export function emitTelemetry(
  name: TelemetryEventName,
  roomCode: string,
  meta?: TelemetryEvent['meta'],
): TelemetryEvent {
  const event: TelemetryEvent = {
    name,
    roomCodeHash: hashRoomCode(roomCode),
    atMs: Date.now(),
    meta,
  };
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // Telemetry must never break gameplay.
    }
  }
  return event;
}

/** In-memory ring buffer for tests / local debug (no PII). */
export function createMemoryTelemetryBuffer(limit = 200): {
  sink: TelemetrySink;
  events: TelemetryEvent[];
  clear: () => void;
} {
  const events: TelemetryEvent[] = [];
  return {
    events,
    clear: () => {
      events.length = 0;
    },
    sink: (event) => {
      events.push(event);
      while (events.length > limit) events.shift();
    },
  };
}
