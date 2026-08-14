/**
 * Offline achievement runtime. Unlocks only via catalog conditions
 * (flags / events / stats). There is no cheat or test-only unlock API.
 */

export type UnlockCondition =
  | { type: 'event_count'; event: string; count: number }
  | { type: 'flag'; flag: string }
  | { type: 'stat_at_least'; stat: string; threshold: number }
  | { type: 'all'; conditions: UnlockCondition[] }
  | { type: 'any'; conditions: UnlockCondition[] };

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  hidden: boolean;
  unlock: UnlockCondition;
}

export interface AchievementCatalog {
  schema: string;
  game: string;
  catalog_version: number;
  save_version: number;
  offline: boolean;
  duplicate_prevention: boolean;
  notes?: string;
  achievements: AchievementDef[];
}

export interface UnlockRecord {
  unlocked: boolean;
  unlocked_at: string;
  catalog_version: number;
}

export interface AchievementNotification {
  id: string;
  title: string;
  description: string;
  hidden: boolean;
  unlocked_at: string;
}

export interface BrowserEntry {
  id: string;
  title: string;
  description: string;
  hidden: boolean;
  unlocked: boolean;
  unlocked_at: string;
  percent: number;
  current: number;
  target: number;
}

export interface AchievementSaveState {
  save_version: number;
  catalog_version: number;
  unlocked: Record<string, UnlockRecord>;
  progress: Record<string, { current: number; target: number }>;
  flags: Record<string, boolean>;
  stats: Record<string, number>;
  events: Record<string, number>;
  notifications: AchievementNotification[];
  saved_at?: string;
}

export interface AchievementPersist {
  load(): AchievementSaveState | null;
  save(state: AchievementSaveState): void;
}

export interface AchievementSummary {
  unlocked: number;
  total: number;
  percent: number;
  entries: BrowserEntry[];
  notifications: AchievementNotification[];
}

export const ACHIEVEMENT_SAVE_VERSION = 1;

const FORBIDDEN_UNLOCK_TYPES = new Set(['test', 'debug', 'cheat', 'always']);

export function memoryPersist(): AchievementPersist {
  let stored: AchievementSaveState | null = null;
  return {
    load: () => stored,
    save: (state) => {
      stored = JSON.parse(JSON.stringify(state)) as AchievementSaveState;
    },
  };
}

function emptyState(catalogVersion: number): AchievementSaveState {
  return {
    save_version: ACHIEVEMENT_SAVE_VERSION,
    catalog_version: catalogVersion,
    unlocked: {},
    progress: {},
    flags: {},
    stats: {},
    events: {},
    notifications: [],
  };
}

function isoNow(): string {
  return new Date().toISOString();
}

export function parseAchievementCatalog(raw: unknown): AchievementCatalog {
  const parsed = raw as AchievementCatalog;
  if (!parsed || parsed.schema !== 'gunnchos.game_rc.achievements/v1') {
    throw new Error('invalid achievement catalog schema');
  }
  if (!parsed.offline || !parsed.duplicate_prevention) {
    throw new Error('catalog must be offline with duplicate_prevention');
  }
  if (!Array.isArray(parsed.achievements) || parsed.achievements.length < 1) {
    throw new Error('catalog has no achievements');
  }
  for (const item of parsed.achievements) {
    if (FORBIDDEN_UNLOCK_TYPES.has(String(item.unlock?.type))) {
      throw new Error(`test-only unlock forbidden: ${item.id}`);
    }
  }
  return parsed;
}

export class AchievementRuntime {
  readonly catalog: AchievementCatalog;
  private persist: AchievementPersist;
  private state: AchievementSaveState;
  private byId = new Map<string, AchievementDef>();

  constructor(catalog: AchievementCatalog, persist: AchievementPersist = memoryPersist()) {
    this.catalog = parseAchievementCatalog(catalog);
    for (const item of this.catalog.achievements) {
      this.byId.set(item.id, item);
    }
    this.persist = persist;
    this.state = emptyState(this.catalog.catalog_version);
    this.loadSave();
    this.evaluateAll();
  }

  private loadSave(): void {
    const parsed = this.persist.load();
    if (!parsed || typeof parsed !== 'object') {
      this.state = emptyState(this.catalog.catalog_version);
      return;
    }
    this.state = emptyState(this.catalog.catalog_version);
    this.state.save_version = Number(parsed.save_version ?? ACHIEVEMENT_SAVE_VERSION);
    this.state.catalog_version = Number(parsed.catalog_version ?? this.catalog.catalog_version);
    this.state.unlocked = parsed.unlocked ?? {};
    this.state.progress = parsed.progress ?? {};
    this.state.flags = parsed.flags ?? {};
    this.state.stats = parsed.stats ?? {};
    this.state.events = parsed.events ?? {};
    this.state.notifications = parsed.notifications ?? [];
    if (this.state.save_version < ACHIEVEMENT_SAVE_VERSION) {
      this.state.save_version = ACHIEVEMENT_SAVE_VERSION;
      this.flush();
    }
  }

  private flush(): void {
    this.state.save_version = ACHIEVEMENT_SAVE_VERSION;
    this.state.catalog_version = this.catalog.catalog_version;
    this.state.saved_at = isoNow();
    this.persist.save(this.state);
  }

  reportEvent(eventId: string, amount = 1): void {
    if (!eventId || amount <= 0) return;
    this.state.events[eventId] = (this.state.events[eventId] ?? 0) + amount;
    this.evaluateAll();
    this.flush();
  }

  setFlag(flag: string, value = true): void {
    if (!flag) return;
    this.state.flags[flag] = value;
    this.evaluateAll();
    this.flush();
  }

  setStat(stat: string, value: number): void {
    if (!stat) return;
    this.state.stats[stat] = value;
    this.evaluateAll();
    this.flush();
  }

  isUnlocked(id: string): boolean {
    return Boolean(this.state.unlocked[id]?.unlocked);
  }

  unlockedAt(id: string): string {
    return this.state.unlocked[id]?.unlocked_at ?? '';
  }

  catalogCount(): number {
    return this.catalog.achievements.length;
  }

  unlockedCount(): number {
    return this.catalog.achievements.filter((d) => this.isUnlocked(d.id)).length;
  }

  completionPercent(): number {
    const n = this.catalogCount();
    if (n === 0) return 0;
    return (100 * this.unlockedCount()) / n;
  }

  progressOf(id: string): { current: number; target: number; percent: number } {
    const def = this.byId.get(id);
    if (!def) return { current: 0, target: 1, percent: 0 };
    const [currentRaw, targetRaw] = this.conditionProgress(def.unlock);
    const target = Math.max(targetRaw, 1);
    let current = Math.min(currentRaw, target);
    let percent = Math.max(0, Math.min(100, (100 * current) / target));
    if (this.isUnlocked(id)) {
      percent = 100;
      current = target;
    }
    return { current, target, percent };
  }

  browserEntries(): BrowserEntry[] {
    return this.catalog.achievements.map((d) => {
      const got = this.isUnlocked(d.id);
      const prog = this.progressOf(d.id);
      const hidden = Boolean(d.hidden);
      return {
        id: d.id,
        title: hidden && !got ? '???' : d.title,
        description: hidden && !got ? 'Hidden achievement' : d.description,
        hidden,
        unlocked: got,
        unlocked_at: this.unlockedAt(d.id),
        percent: prog.percent,
        current: prog.current,
        target: prog.target,
      };
    });
  }

  drainNotifications(): AchievementNotification[] {
    const pending = this.state.notifications.slice();
    this.state.notifications = [];
    this.flush();
    return pending;
  }

  pendingNotificationCount(): number {
    return this.state.notifications.length;
  }

  summary(): AchievementSummary {
    return {
      unlocked: this.unlockedCount(),
      total: this.catalogCount(),
      percent: this.completionPercent(),
      entries: this.browserEntries(),
      notifications: this.state.notifications.slice(),
    };
  }

  private evaluateAll(): void {
    for (const def of this.catalog.achievements) {
      if (this.isUnlocked(def.id)) continue;
      if (this.conditionMet(def.unlock)) this.unlock(def);
    }
  }

  private unlock(def: AchievementDef): void {
    if (this.isUnlocked(def.id)) return;
    const stamp = isoNow();
    this.state.unlocked[def.id] = {
      unlocked: true,
      unlocked_at: stamp,
      catalog_version: this.catalog.catalog_version,
      };
    this.state.notifications.push({
      id: def.id,
      title: def.title,
      description: def.description,
      hidden: Boolean(def.hidden),
      unlocked_at: stamp,
    });
  }

  private conditionMet(cond: UnlockCondition): boolean {
    switch (cond.type) {
      case 'event_count':
        return (this.state.events[cond.event] ?? 0) >= cond.count;
      case 'flag':
        return Boolean(this.state.flags[cond.flag]);
      case 'stat_at_least':
        return (this.state.stats[cond.stat] ?? 0) >= cond.threshold;
      case 'all':
        return cond.conditions.every((c) => this.conditionMet(c));
      case 'any':
        return cond.conditions.some((c) => this.conditionMet(c));
      default:
        return false;
    }
  }

  private conditionProgress(cond: UnlockCondition): [number, number] {
    switch (cond.type) {
      case 'event_count':
        return [Math.min(this.state.events[cond.event] ?? 0, cond.count), cond.count];
      case 'flag':
        return [this.state.flags[cond.flag] ? 1 : 0, 1];
      case 'stat_at_least':
        return [Math.min(this.state.stats[cond.stat] ?? 0, cond.threshold), cond.threshold];
      case 'all': {
        const kids = cond.conditions;
        if (kids.length === 0) return [0, 1];
        return [kids.filter((c) => this.conditionMet(c)).length, kids.length];
      }
      case 'any':
        return [this.conditionMet(cond) ? 1 : 0, 1];
      default:
        return [0, 1];
    }
  }
}
