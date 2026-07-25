import type {
  CacheCapability,
  CacheSet,
  PageCapability,
} from '@git-stunts/git-cas';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import { textEncode } from '../../domain/utils/bytes.ts';
import { validateGraphName, validateWriterId } from '../../domain/utils/RefLayout.ts';
import { parseCursorBlob } from '../../domain/utils/parseCursorBlob.ts';
import type SeekCursorStorePort from '../../ports/SeekCursorStorePort.ts';
import type {
  NamedSeekCursorState,
  SeekCursorState,
  SeekCursorSweepResult,
} from '../../ports/SeekCursorStorePort.ts';

type SeekCursorCache = Pick<
  CacheSet,
  'get' | 'put' | 'remove' | 'sweep' | 'inspect'
>;

export type GitCasSeekCursorFacade = {
  readonly caches: {
    open(
      options: Parameters<CacheCapability['open']>[0],
    ): Promise<SeekCursorCache>;
  };
  readonly pages: Pick<PageCapability, 'put' | 'get'>;
};

const CURSOR_NAMESPACE = 'git-warp.seek-cursors';
const ACTIVE_CURSOR_KEY = 'active';
const SAVED_CURSOR_KEY = 'saved';
const CACHE_INSPECTION_PAGE_SIZE = 100;
const MAX_CURSOR_PAGE_BYTES = 16 * 1024;
const CURSOR_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_SEEK_CURSOR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * git-cas page/cache-backed seek cursor storage.
 *
 * Cursor bytes are immutable pages. CacheSet owns reachability, atomic
 * replacement, expiry, and collection eligibility.
 */
export default class GitCasSeekCursorStoreAdapter implements SeekCursorStorePort {
  private readonly _cache: Promise<SeekCursorCache>;
  private readonly _cas: GitCasSeekCursorFacade;
  private readonly _graphName: string;
  private readonly _wallClockMs: () => number;
  private _nextSweepAtMs = 0;
  private _sweepInFlight: Promise<SeekCursorSweepResult> | null = null;

  constructor(options: {
    readonly cas: GitCasSeekCursorFacade;
    readonly graphName: string;
    readonly wallClockMs?: () => number;
  }) {
    validateGraphName(options.graphName);
    const cache = options.cas.caches.open({ namespace: CURSOR_NAMESPACE });
    // Mark an eager open failure handled until a cursor operation awaits it.
    cache.catch(() => {});
    this._cache = cache;
    this._cas = options.cas;
    this._graphName = options.graphName;
    this._wallClockMs = options.wallClockMs ?? Date.now;
  }

  async readActive(): Promise<SeekCursorState | null> {
    return await this._read(activeCursorIdentity(this._graphName), 'active cursor');
  }

  async writeActive(cursor: SeekCursorState): Promise<void> {
    const nowMs = this._wallClockMs();
    await this._maintain(nowMs);
    await this._write(
      activeCursorIdentity(this._graphName),
      cursor,
      new Date(nowMs + ACTIVE_SEEK_CURSOR_TTL_MS).toISOString(),
    );
  }

  async clearActive(): Promise<void> {
    await this._remove(activeCursorIdentity(this._graphName));
  }

  async readSaved(name: string): Promise<SeekCursorState | null> {
    validateWriterId(name);
    return await this._read(
      savedCursorIdentity(this._graphName, name),
      `saved cursor '${name}'`,
    );
  }

  async writeSaved(name: string, cursor: SeekCursorState): Promise<void> {
    validateWriterId(name);
    await this._maintain(this._wallClockMs());
    await this._write(savedCursorIdentity(this._graphName, name), cursor, null);
  }

  async deleteSaved(name: string): Promise<void> {
    validateWriterId(name);
    await this._remove(savedCursorIdentity(this._graphName, name));
  }

  async listSaved(): Promise<ReadonlyArray<NamedSeekCursorState>> {
    const nowMs = this._wallClockMs();
    await this._maintain(nowMs);
    const cache = await this._cache;
    const cursors: NamedSeekCursorState[] = [];
    let cursor: string | null = null;
    do {
      const inspection = await cache.inspect({
        limit: CACHE_INSPECTION_PAGE_SIZE,
        cursor,
      });
      for (const entry of inspection.entries) {
        const name = savedCursorName(entry.key, this._graphName);
        if (name !== null && !expired(entry.expiresAt, nowMs)) {
          const state = await this._readPage(entry.handle, `saved cursor '${name}'`);
          cursors.push(Object.freeze({ name, ...state }));
        }
      }
      cursor = inspection.nextCursor;
    } while (cursor !== null);
    cursors.sort((left, right) => left.name.localeCompare(right.name));
    return Object.freeze(cursors);
  }

  async sweep(): Promise<SeekCursorSweepResult> {
    if (this._sweepInFlight === null) {
      this._sweepInFlight = this._sweepRetainedPages()
        .finally(() => {
          this._sweepInFlight = null;
        });
    }
    return await this._sweepInFlight;
  }

  private async _read(key: string, label: string): Promise<SeekCursorState | null> {
    await this._maintain(this._wallClockMs());
    const cache = await this._cache;
    const hit = await cache.get(key);
    if (hit === null) {
      return null;
    }
    return await this._readPage(hit.handle.toString(), label);
  }

  private async _readPage(handle: string, label: string): Promise<SeekCursorState> {
    const bytes = await this._cas.pages.get({
      handle,
      maxBytes: MAX_CURSOR_PAGE_BYTES,
    });
    return normalizeCursor(parseCursorBlob(bytes, label), label);
  }

  private async _write(
    key: string,
    cursor: SeekCursorState,
    expiresAt: string | null,
  ): Promise<void> {
    const page = await this._cas.pages.put({
      source: textEncode(JSON.stringify(cursor)),
      maxBytes: MAX_CURSOR_PAGE_BYTES,
    });
    const cache = await this._cache;
    const stored = await cache.put(key, page.handle, {
      retention: 'pinned',
      expiresAt,
    });
    if (!stored.accepted) {
      throw new PersistenceError(
        'git-cas rejected seek cursor retention',
        'E_CURSOR_RETENTION',
      );
    }
  }

  private async _remove(key: string): Promise<void> {
    await this._maintain(this._wallClockMs());
    const cache = await this._cache;
    await cache.remove(key);
  }

  private async _maintain(nowMs: number): Promise<void> {
    if (nowMs >= this._nextSweepAtMs) {
      await this.sweep();
    }
  }

  private async _sweepRetainedPages(): Promise<SeekCursorSweepResult> {
    const cache = await this._cache;
    const result = await cache.sweep();
    this._nextSweepAtMs = this._wallClockMs() + CURSOR_SWEEP_INTERVAL_MS;
    return Object.freeze({
      removed: result.removed,
      generation: result.generation,
    });
  }
}

function activeCursorIdentity(graphName: string): string {
  return JSON.stringify([1, graphName, ACTIVE_CURSOR_KEY]);
}

function savedCursorIdentity(graphName: string, name: string): string {
  return JSON.stringify([1, graphName, SAVED_CURSOR_KEY, name]);
}

function savedCursorName(key: string, graphName: string): string | null {
  let identity: unknown;
  try {
    identity = parseJsonUnknown(key);
  } catch {
    return null;
  }
  if (!Array.isArray(identity)) {
    return null;
  }
  const name: unknown = identity[3];
  if (typeof name !== 'string') {
    return null;
  }
  if (savedCursorIdentity(graphName, name) !== key) {
    return null;
  }
  validateWriterId(name);
  return name;
}

function parseJsonUnknown(source: string): unknown {
  return JSON.parse(source) as unknown;
}

function expired(expiresAt: string | null, nowMs: number): boolean {
  return expiresAt !== null && Date.parse(expiresAt) <= nowMs;
}

function normalizeCursor(
  cursor: ReturnType<typeof parseCursorBlob>,
  label: string,
): SeekCursorState {
  const tick = finiteNumber(cursor.tick, 'tick', label);
  const mode = optionalString(cursor.mode, 'mode', label);
  const nodes = optionalFiniteNumber(cursor['nodes'], 'nodes', label);
  const edges = optionalFiniteNumber(cursor['edges'], 'edges', label);
  const frontierHash = optionalString(
    cursor['frontierHash'],
    'frontierHash',
    label,
  );
  return Object.freeze({
    tick,
    ...(mode === undefined ? {} : { mode }),
    ...(nodes === undefined ? {} : { nodes }),
    ...(edges === undefined ? {} : { edges }),
    ...(frontierHash === undefined ? {} : { frontierHash }),
  });
}

function finiteNumber(value: unknown, field: string, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw corruptCursor(label, field);
  }
  return value;
}

function optionalFiniteNumber(
  value: unknown,
  field: string,
  label: string,
): number | undefined {
  return value === undefined ? undefined : finiteNumber(value, field, label);
}

function optionalString(
  value: unknown,
  field: string,
  label: string,
): string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    throw corruptCursor(label, field);
  }
  return value;
}

function corruptCursor(label: string, field: string): PersistenceError {
  return new PersistenceError(
    `Corrupted ${label}: invalid ${field}`,
    'E_CURSOR_CORRUPT',
  );
}
