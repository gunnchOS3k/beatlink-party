import type { RoomSnapshot, RoomStore } from './types.js';

/** Default unit-test / single-process backend — no external deps. */
export class InMemoryRoomStore implements RoomStore {
  readonly backend = 'memory' as const;
  private rooms = new Map<string, RoomSnapshot>();

  has(code: string): boolean {
    return this.rooms.has(code.toUpperCase());
  }

  get(code: string): RoomSnapshot | null {
    return this.rooms.get(code.toUpperCase()) ?? null;
  }

  set(code: string, snapshot: RoomSnapshot): void {
    this.rooms.set(code.toUpperCase(), snapshot);
  }

  delete(code: string): void {
    this.rooms.delete(code.toUpperCase());
  }

  *entries(): IterableIterator<[string, RoomSnapshot]> {
    yield* this.rooms.entries();
  }
}
