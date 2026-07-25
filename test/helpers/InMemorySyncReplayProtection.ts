import type SyncReplayProtectionPort from '../../src/ports/SyncReplayProtectionPort.ts';
import type {
  SyncReplayReservation,
  SyncReplayReservationRequest,
  SyncReplaySweepResult,
} from '../../src/ports/SyncReplayProtectionPort.ts';

type RetainedReplay = {
  readonly expiresAt: string;
  readonly expiresAtMs: number;
};

/** Deterministic test authority for the SyncReplayProtectionPort contract. */
export default class InMemorySyncReplayProtection implements SyncReplayProtectionPort {
  private readonly _clock: () => number;
  private readonly _entries = new Map<string, RetainedReplay>();
  private _generation = 0;

  constructor(clock: () => number = Date.now) {
    this._clock = clock;
  }

  reserve(request: SyncReplayReservationRequest): Promise<SyncReplayReservation> {
    const identity = replayIdentity(request);
    const previous = this._entries.get(identity);
    if (previous !== undefined && previous.expiresAtMs > this._clock()) {
      return Promise.resolve(Object.freeze({
        admitted: false,
        expiresAt: previous.expiresAt,
        generation: String(this._generation),
      }));
    }
    const expiresAtMs = this._clock() + request.ttlMs;
    const expiresAt = new Date(expiresAtMs).toISOString();
    this._entries.set(identity, {
      expiresAt,
      expiresAtMs,
    });
    this._generation += 1;
    return Promise.resolve(Object.freeze({
      admitted: true,
      expiresAt,
      generation: String(this._generation),
    }));
  }

  sweep(): Promise<SyncReplaySweepResult> {
    let removed = 0;
    for (const [identity, entry] of this._entries) {
      if (entry.expiresAtMs <= this._clock()) {
        this._entries.delete(identity);
        removed += 1;
      }
    }
    if (removed > 0) {
      this._generation += 1;
    }
    return Promise.resolve(Object.freeze({
      removed,
      generation: String(this._generation),
    }));
  }
}

function replayIdentity(
  request: Pick<SyncReplayReservationRequest, 'keyId' | 'nonce'>,
): string {
  return JSON.stringify([1, request.keyId, request.nonce]);
}
