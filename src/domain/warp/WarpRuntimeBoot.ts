import { validateGraphName, validateWriterId } from '../utils/RefLayout.ts';
import { AuditReceiptService } from '../services/audit/AuditReceiptService.ts';
import defaultCodec from '../utils/defaultCodec.ts';
import defaultCrypto from '../utils/defaultCrypto.ts';
import MaterializedViewService from '../services/MaterializedViewService.ts';
import StateHashService from '../services/state/StateHashService.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../services/codec/WarpMessageCodec.ts';
import StateSession from '../orset/session/StateSession.ts';
import PageCache from '../orset/trie/PageCache.ts';
import TrieGeometry from '../orset/trie/TrieGeometry.ts';
import WarpError from '../errors/WarpError.ts';
import {
  resolveBlobStorage,
  resolvePatchWriteStorage,
  resolveIndexStore,
  buildEffectPipeline,
  normalizeTrustConfig,
  type TrustMode,
  type NormalizedTrustConfig,
} from '../runtimeHelpers.ts';

import type { CorePersistence } from '../types/WarpPersistence.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type SeekCachePort from '../../ports/SeekCachePort.ts';
import type WarpStateCachePort from '../../ports/WarpStateCachePort.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type CheckpointStorePort from '../../ports/CheckpointStorePort.ts';
import type IndexStorePort from '../../ports/IndexStorePort.ts';
import type EffectSinkPort from '../../ports/EffectSinkPort.ts';
import type RuntimeStorageCapabilityPort from '../../ports/RuntimeStorageCapabilityPort.ts';
import type { EffectPipeline } from '../services/EffectPipeline.ts';
import type { ExternalizationPolicy } from '../types/ExternalizationPolicy.ts';
import type { GCPolicyConfig } from '../services/GCPolicy.ts';
import type GCPolicy from '../services/GCPolicy.ts';
import type { MaterializeSessionOpener } from '../services/controllers/MaterializeSessionBridge.ts';

export type WarpRuntimeConstructionOptions = {
  persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  graphName: string;
  writerId: string;
  gcPolicy?: GCPolicyConfig | GCPolicy;
  adjacencyCacheSize?: number;
  checkpointPolicy?: { every: number };
  autoMaterialize?: boolean;
  onDeleteWithData?: 'reject' | 'cascade' | 'warn';
  logger?: LoggerPort;
  crypto?: CryptoPort;
  codec?: CodecPort;
  seekCache?: SeekCachePort;
  stateCache?: WarpStateCachePort;
  audit?: boolean;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
  commitMessageCodec?: CommitMessageCodecPort;
  trust?: { mode?: TrustMode; pin?: string | null };
  patchJournal: PatchJournalPort;
  checkpointStore: CheckpointStorePort;
  indexStore: IndexStorePort;
  viewService: MaterializedViewService;
  stateHashService?: StateHashService;
  auditService?: AuditReceiptService;
  effectPipeline?: EffectPipeline;
  openStateSession?: MaterializeSessionOpener;
};

export type WarpRuntimeOpenOptions = {
  persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  graphName: string;
  writerId: string;
  gcPolicy?: GCPolicyConfig | GCPolicy;
  adjacencyCacheSize?: number;
  checkpointPolicy?: { every: number };
  autoMaterialize?: boolean;
  onDeleteWithData?: 'reject' | 'cascade' | 'warn';
  logger?: LoggerPort;
  crypto?: CryptoPort;
  codec?: CodecPort;
  seekCache?: SeekCachePort;
  stateCache?: WarpStateCachePort;
  audit?: boolean;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
  commitMessageCodec?: CommitMessageCodecPort;
  patchJournal?: PatchJournalPort | null;
  checkpointStore?: CheckpointStorePort | null;
  indexStore?: IndexStorePort | null;
  trust?: { mode?: TrustMode; pin?: string | null };
  effectPipeline?: EffectPipeline;
  effectSinks?: EffectSinkPort[];
  externalizationPolicy?: ExternalizationPolicy;
  openStateSession?: MaterializeSessionOpener;
};

export type RuntimeMigrationBoundary = {
  _validateMigrationBoundary(): Promise<void>;
};

export type RuntimeBooted<T extends RuntimeMigrationBoundary> = {
  runtime: T;
  normalizedTrust: NormalizedTrustConfig;
};

export async function resolveWarpRuntimeConstructionOptions({
  persistence,
  graphName,
  writerId,
  gcPolicy = {},
  adjacencyCacheSize,
  checkpointPolicy,
  autoMaterialize,
  onDeleteWithData,
  logger,
  crypto,
  codec,
  seekCache,
  stateCache,
  audit,
  blobStorage,
  patchBlobStorage,
  commitMessageCodec,
  patchJournal,
  checkpointStore,
  indexStore,
  trust,
  effectPipeline,
  effectSinks,
  externalizationPolicy,
  openStateSession,
}: WarpRuntimeOpenOptions): Promise<{
  options: WarpRuntimeConstructionOptions;
  normalizedTrust: NormalizedTrustConfig;
}> {
  validateGraphName(graphName);
  validateWriterId(writerId);

  if (persistence === null || persistence === undefined) {
    throw new WarpError('persistence is required', 'E_INVALID_ARG');
  }

  if (checkpointPolicy !== undefined && checkpointPolicy !== null) {
    if (typeof checkpointPolicy !== 'object' || checkpointPolicy === null) {
      throw new WarpError('checkpointPolicy must be an object with { every: number }', 'E_CHECKPOINT_POLICY_TYPE');
    }
    if (!Number.isInteger(checkpointPolicy.every) || checkpointPolicy.every <= 0) {
      throw new WarpError('checkpointPolicy.every must be a positive integer', 'E_CHECKPOINT_POLICY_EVERY');
    }
  }

  if (autoMaterialize !== undefined && typeof autoMaterialize !== 'boolean') {
    throw new WarpError('autoMaterialize must be a boolean', 'E_AUTO_MATERIALIZE_TYPE');
  }

  if (audit !== undefined && typeof audit !== 'boolean') {
    throw new WarpError('audit must be a boolean', 'E_AUDIT_TYPE');
  }

  const normalizedTrust = normalizeTrustConfig(trust);

  if (onDeleteWithData !== undefined) {
    const valid = ['reject', 'cascade', 'warn'] as const;
    if (!valid.includes(onDeleteWithData)) {
      throw new WarpError(
        `onDeleteWithData must be one of: ${valid.join(', ')}`,
        'E_ON_DELETE_WITH_DATA_INVALID',
        { context: { got: onDeleteWithData, valid } },
      );
    }
  }

  const resolvedBlobStorage = await resolveBlobStorage(blobStorage, persistence);
  const resolvedCommitMessageCodec = commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC;
  const resolvedCodec = codec ?? defaultCodec;
  const resolvedCrypto = crypto ?? defaultCrypto;
  const patchWriteStorage = resolvePatchWriteStorage(persistence, patchBlobStorage);

  const blobPort = persistence;
  const commitPort = persistence;
  const treePort = persistence;

  let resolvedPatchJournal: PatchJournalPort;
  if (patchJournal !== undefined && patchJournal !== null) {
    resolvedPatchJournal = patchJournal;
  } else {
    const { CborPatchJournalAdapter } = await import(
      /* webpackIgnore: true */ '../../infrastructure/adapters/CborPatchJournalAdapter.ts'
    );
    resolvedPatchJournal = new CborPatchJournalAdapter({
      codec: resolvedCodec,
      blobPort,
      commitPort,
      commitMessageCodec: resolvedCommitMessageCodec,
      ...(patchWriteStorage.strategy === 'git-cas' ? { blobStorage: resolvedBlobStorage } : {}),
      ...(patchBlobStorage !== undefined && patchBlobStorage !== null ? { legacyPatchBlobStorage: patchBlobStorage } : {}),
      writeStorage: patchWriteStorage,
    });
  }

  let resolvedCheckpointStore: CheckpointStorePort;
  if (checkpointStore !== undefined && checkpointStore !== null) {
    resolvedCheckpointStore = checkpointStore;
  } else {
    const { CborCheckpointStoreAdapter } = await import(
      /* webpackIgnore: true */ '../../infrastructure/adapters/CborCheckpointStoreAdapter.ts'
    );
    resolvedCheckpointStore = new CborCheckpointStoreAdapter({
      codec: resolvedCodec,
      blobPort,
      blobStorage: resolvedBlobStorage,
    });
  }

  const resolvedIndexStore = await resolveIndexStore(indexStore, {
    codec: resolvedCodec,
    blobPort,
    treePort,
    blobStorage: resolvedBlobStorage,
  });

  const resolvedStateHashService = new StateHashService({
    codec: resolvedCodec,
    crypto: resolvedCrypto,
  });

  const resolvedViewService = new MaterializedViewService({
    codec: resolvedCodec,
    ...(logger !== undefined ? { logger } : {}),
    indexStore: resolvedIndexStore,
  });

  let resolvedAuditService: AuditReceiptService | undefined;
  if (audit === true) {
    resolvedAuditService = new AuditReceiptService({
      persistence,
      graphName,
      writerId,
      codec: resolvedCodec,
      crypto: resolvedCrypto,
      ...(logger !== undefined ? { logger } : {}),
    });
    await resolvedAuditService.init();
  }

  let resolvedEffectPipeline: EffectPipeline | undefined;
  if (effectPipeline !== null && effectPipeline !== undefined) {
    resolvedEffectPipeline = effectPipeline;
  } else if (effectSinks !== null && effectSinks !== undefined && effectSinks.length > 0) {
    resolvedEffectPipeline = await buildEffectPipeline(effectSinks, externalizationPolicy);
  }

  let resolvedOpenStateSession: MaterializeSessionOpener | undefined;
  if (openStateSession !== undefined) {
    resolvedOpenStateSession = openStateSession;
  } else if (typeof persistence.createRuntimeTrieStore === 'function') {
    const store = await persistence.createRuntimeTrieStore();
    const pageCache = new PageCache({ maxResident: 256 });
    const geometry = TrieGeometry.default16way();
    resolvedOpenStateSession = async (roots) =>
      await StateSession.open({
        nodeAliveRootOid: roots.nodeAliveRootOid,
        edgeAliveRootOid: roots.edgeAliveRootOid,
        store,
        codec: resolvedCodec,
        geometry,
        pageCache,
      });
  }

  return {
    normalizedTrust,
    options: {
      persistence,
      graphName,
      writerId,
      gcPolicy,
      ...(adjacencyCacheSize !== undefined ? { adjacencyCacheSize } : {}),
      ...(checkpointPolicy !== undefined ? { checkpointPolicy } : {}),
      ...(autoMaterialize !== undefined ? { autoMaterialize } : {}),
      ...(onDeleteWithData !== undefined ? { onDeleteWithData } : {}),
      ...(logger !== undefined ? { logger } : {}),
      ...(crypto !== undefined ? { crypto } : {}),
      ...(codec !== undefined ? { codec } : {}),
      ...(seekCache !== undefined ? { seekCache } : {}),
      ...(stateCache !== undefined ? { stateCache } : {}),
      ...(audit !== undefined ? { audit } : {}),
      blobStorage: resolvedBlobStorage,
      ...(patchBlobStorage !== undefined ? { patchBlobStorage } : {}),
      commitMessageCodec: resolvedCommitMessageCodec,
      ...(trust !== undefined ? { trust } : {}),
      patchJournal: resolvedPatchJournal,
      checkpointStore: resolvedCheckpointStore,
      indexStore: resolvedIndexStore,
      viewService: resolvedViewService,
      stateHashService: resolvedStateHashService,
      ...(resolvedAuditService !== undefined ? { auditService: resolvedAuditService } : {}),
      ...(resolvedEffectPipeline !== undefined && resolvedEffectPipeline !== null ? { effectPipeline: resolvedEffectPipeline } : {}),
      ...(resolvedOpenStateSession === undefined ? {} : { openStateSession: resolvedOpenStateSession }),
    },
  };
}
