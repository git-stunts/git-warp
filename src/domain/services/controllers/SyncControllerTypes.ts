/**
 * Types for SyncController — host interface, result types, and options.
 */
import type { WarpState } from '../JoinReducer.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type SyncTrustGate from '../sync/SyncTrustGate.ts';
import type SyncCapability from '../../capabilities/SyncCapability.ts';
import type SnapshotWarpState from '../snapshot/SnapshotWarpState.ts';
import type SyncSecret from '../sync/SyncSecret.ts';

/**
 * The host interface that SyncController depends on.
 *
 * Documents the exact host surface the controller accesses,
 * making the coupling explicit and enabling lightweight mock hosts.
 */
export interface SyncHost {
  _cachedState: WarpState | null;
  _lastFrontier: Map<string, string> | null;
  _stateDirty: boolean;
  _patchesSinceGC: number;
  _graphName: string;
  _persistence: CorePersistence;
  _codec: CodecPort;
  _crypto: CryptoPort;
  _logger: LoggerPort | null;
  _patchJournal?: PatchJournalPort | null;
  _patchBlobStorage?: BlobStoragePort | null;
  _patchesSinceCheckpoint: number;
  _maxObservedLamport: number;
  materialize: () => Promise<SnapshotWarpState>;
  _setMaterializedState: (state: WarpState) => Promise<object>;
  discoverWriters: () => Promise<string[]>;
  _createSyncTrustGate?: (
    trust: { mode?: 'off' | 'log-only' | 'enforce'; pin?: string | null } | undefined | null,
    ) => SyncTrustGate | null;
}

export interface SkippedWriter {
  writerId: string;
  reason: string;
  localSha: string;
  remoteSha: string | null;
}

export interface ApplySyncResult {
  state: WarpState;
  frontier: Map<string, string>;
  applied: number;
  trustVerdict?: string;
  writersApplied?: string[];
  skippedWriters: SkippedWriter[];
}

export interface SyncWithResult {
  applied: number;
  attempts: number;
  skippedWriters: SkippedWriter[];
  state?: WarpState;
}

export type SyncRemote = Parameters<SyncCapability['syncWith']>[0];

export interface SyncStatusEvent {
  type: string;
  attempt: number;
  durationMs?: number;
  status?: number;
  error?: Error;
  delayMs?: number;
}

export interface SyncWithOptions {
  path?: string;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (event: SyncStatusEvent) => void;
  materialize?: boolean;
  auth?: { secret: SyncSecret; keyId?: string };
  trust?: { mode?: 'off' | 'log-only' | 'enforce'; pin?: string | null };
}
