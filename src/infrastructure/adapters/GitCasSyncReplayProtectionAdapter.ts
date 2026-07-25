import type { ExpiringSetCapability } from '@git-stunts/git-cas';
import type SyncReplayProtectionPort from '../../ports/SyncReplayProtectionPort.ts';
import type {
  SyncReplayReservation,
  SyncReplayReservationRequest,
  SyncReplaySweepResult,
} from '../../ports/SyncReplayProtectionPort.ts';

export type GitCasSyncReplayFacade = {
  readonly expiringSets: Pick<ExpiringSetCapability, 'open'>;
};

type ReplaySet = Awaited<ReturnType<ExpiringSetCapability['open']>>;

const REPLAY_NAMESPACE = 'git-warp.sync-replay';
const REPLAY_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * git-cas ExpiringSet-backed replay admission.
 *
 * git-cas owns atomicity, retention, reachability, and expiry-only release.
 * WARP owns the replay identity and acceptance-window deadline.
 */
export default class GitCasSyncReplayProtectionAdapter implements SyncReplayProtectionPort {
  private readonly _set: Promise<ReplaySet>;
  private readonly _wallClockMs: () => number;
  private readonly _graphName: string;
  private _nextSweepAtMs = 0;
  private _sweepInFlight: Promise<SyncReplaySweepResult> | null = null;

  constructor(options: {
    readonly cas: GitCasSyncReplayFacade;
    readonly graphName: string;
    readonly wallClockMs?: () => number;
  }) {
    const replaySet = options.cas.expiringSets.open({
      namespace: REPLAY_NAMESPACE,
    });
    // Mark an eager open failure handled until a reserve or sweep caller awaits it.
    replaySet.catch(() => {});
    this._set = replaySet;
    this._wallClockMs = options.wallClockMs ?? Date.now;
    this._graphName = options.graphName;
  }

  async reserve(
    request: SyncReplayReservationRequest,
  ): Promise<SyncReplayReservation> {
    const nowMs = this._wallClockMs();
    if (nowMs >= this._nextSweepAtMs) {
      await this.sweep();
    }
    const replaySet = await this._set;
    const expiresAt = new Date(nowMs + request.ttlMs).toISOString();
    const result = await replaySet.addIfAbsent(replayIdentity(this._graphName, request), {
      expiresAt,
    });
    return Object.freeze({
      admitted: result.admitted,
      expiresAt: result.marker?.expiresAt ?? expiresAt,
      generation: result.generation,
    });
  }

  async sweep(): Promise<SyncReplaySweepResult> {
    if (this._sweepInFlight === null) {
      this._sweepInFlight = this._sweepRetainedMarkers()
        .finally(() => {
          this._sweepInFlight = null;
        });
    }
    return await this._sweepInFlight;
  }

  private async _sweepRetainedMarkers(): Promise<SyncReplaySweepResult> {
    const replaySet = await this._set;
    const result = await replaySet.sweep();
    this._nextSweepAtMs = this._wallClockMs() + REPLAY_SWEEP_INTERVAL_MS;
    return Object.freeze({
      removed: result.removed,
      generation: result.generation,
    });
  }
}

function replayIdentity(
  graphName: string,
  request: Pick<SyncReplayReservationRequest, 'keyId' | 'nonce'>,
): string {
  return JSON.stringify([1, graphName, request.keyId, request.nonce]);
}
