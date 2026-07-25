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

  constructor(options: {
    readonly cas: GitCasSyncReplayFacade;
    readonly graphName: string;
    readonly wallClockMs?: () => number;
  }) {
    this._set = options.cas.expiringSets.open({
      namespace: REPLAY_NAMESPACE,
    });
    this._wallClockMs = options.wallClockMs ?? Date.now;
    this._graphName = options.graphName;
  }

  async reserve(
    request: SyncReplayReservationRequest,
  ): Promise<SyncReplayReservation> {
    const replaySet = await this._set;
    const expiresAt = new Date(this._wallClockMs() + request.ttlMs).toISOString();
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
    const replaySet = await this._set;
    const result = await replaySet.sweep();
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
