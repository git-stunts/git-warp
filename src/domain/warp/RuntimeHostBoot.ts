import { validateGraphName, validateWriterId } from '../utils/RefLayout.ts';
import { AuditReceiptService } from '../services/audit/AuditReceiptService.ts';
import MaterializedViewService from '../services/MaterializedViewService.ts';
import StateHashService from '../services/state/StateHashService.ts';
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
import {
  resolveConfiguredCodec,
  resolveConfiguredCommitMessageCodec,
  resolveConfiguredCrypto,
  resolveConfiguredTrustCrypto,
} from './RuntimeHostPortResolvers.ts';

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
import type SchedulerPort from '../../ports/SchedulerPort.ts';
import type TrustCryptoPort from '../../ports/TrustCryptoPort.ts';
import type { EffectPipeline } from '../services/EffectPipeline.ts';
import type { ExternalizationPolicy } from '../types/ExternalizationPolicy.ts';
import GCPolicy, { type GCPolicyConfig } from '../services/GCPolicy.ts';
import type { MaterializeSessionOpener } from '../services/controllers/MaterializeSessionBridge.ts';

type DeletePolicy = 'reject' | 'cascade' | 'warn';
const VALID_DELETE_POLICIES: ReadonlyArray<DeletePolicy> = ['reject', 'cascade', 'warn'];

export type RuntimeHostConstructionOptions = {
  persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  graphName: string;
  writerId: string;
  gcPolicy?: GCPolicyConfig | GCPolicy;
  adjacencyCacheSize?: number;
  checkpointPolicy?: { every: number };
  autoMaterialize?: boolean;
  onDeleteWithData?: DeletePolicy;
  logger?: LoggerPort;
  crypto: CryptoPort;
  codec: CodecPort;
  trustCrypto?: TrustCryptoPort;
  seekCache?: SeekCachePort;
  stateCache?: WarpStateCachePort;
  audit?: boolean;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
  commitMessageCodec: CommitMessageCodecPort;
  trust?: { mode?: TrustMode; pin?: string | null };
  patchJournal: PatchJournalPort;
  checkpointStore: CheckpointStorePort;
  indexStore: IndexStorePort;
  viewService: MaterializedViewService;
  stateHashService?: StateHashService;
  auditService?: AuditReceiptService;
  effectPipeline?: EffectPipeline;
  openStateSession?: MaterializeSessionOpener;
  scheduler?: SchedulerPort;
};

export type RuntimeHostOpenOptions = {
  persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  graphName: string;
  writerId: string;
  gcPolicy?: GCPolicyConfig | GCPolicy;
  adjacencyCacheSize?: number;
  checkpointPolicy?: { every: number } | null;
  autoMaterialize?: boolean;
  onDeleteWithData?: DeletePolicy;
  logger?: LoggerPort;
  crypto?: CryptoPort;
  codec?: CodecPort;
  trustCrypto?: TrustCryptoPort;
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
  effectSinks?: readonly EffectSinkPort[];
  externalizationPolicy?: ExternalizationPolicy;
  openStateSession?: MaterializeSessionOpener;
  scheduler?: SchedulerPort;
};

export class WarpOpenOptions {
  readonly persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  readonly graphName: string;
  readonly writerId: string;
  readonly gcPolicy: GCPolicyConfig | GCPolicy;
  readonly adjacencyCacheSize?: number;
  readonly checkpointPolicy?: { every: number };
  readonly autoMaterialize?: boolean;
  readonly onDeleteWithData?: DeletePolicy;
  readonly logger?: LoggerPort;
  readonly crypto?: CryptoPort;
  readonly codec?: CodecPort;
  readonly trustCrypto?: TrustCryptoPort;
  readonly seekCache?: SeekCachePort;
  readonly stateCache?: WarpStateCachePort;
  readonly audit?: boolean;
  readonly blobStorage?: BlobStoragePort;
  readonly patchBlobStorage?: BlobStoragePort;
  readonly commitMessageCodec?: CommitMessageCodecPort;
  readonly patchJournal?: PatchJournalPort | null;
  readonly checkpointStore?: CheckpointStorePort | null;
  readonly indexStore?: IndexStorePort | null;
  readonly trust?: { mode?: TrustMode; pin?: string | null };
  readonly effectPipeline?: EffectPipeline;
  readonly effectSinks?: readonly EffectSinkPort[];
  readonly externalizationPolicy?: ExternalizationPolicy;
  readonly openStateSession?: MaterializeSessionOpener;
  readonly scheduler?: SchedulerPort;

  constructor(options: RuntimeHostOpenOptions) {
    if (options.persistence === null || options.persistence === undefined) {
      throw new WarpError('persistence is required', 'E_INVALID_ARG');
    }
    validateGraphName(options.graphName);
    validateWriterId(options.writerId);

    this.persistence = options.persistence;
    this.graphName = options.graphName;
    this.writerId = options.writerId;
    this.gcPolicy = snapshotGCPolicy(options.gcPolicy);
    if (options.crypto !== undefined) { this.crypto = options.crypto; }
    if (options.codec !== undefined) { this.codec = options.codec; }
    if (options.trustCrypto !== undefined) { this.trustCrypto = options.trustCrypto; }

    if (options.adjacencyCacheSize !== undefined) {
      this.adjacencyCacheSize = options.adjacencyCacheSize;
    }
    const checkpointPolicy = normalizeCheckpointPolicy(options.checkpointPolicy);
    if (checkpointPolicy !== undefined) {
      this.checkpointPolicy = checkpointPolicy;
    }
    if (options.autoMaterialize !== undefined) {
      this.autoMaterialize = normalizeBooleanOption(
        options.autoMaterialize,
        'autoMaterialize',
        'E_AUTO_MATERIALIZE_TYPE',
      );
    }
    if (options.onDeleteWithData !== undefined) {
      this.onDeleteWithData = normalizeDeletePolicy(options.onDeleteWithData);
    }
    if (options.logger !== undefined) { this.logger = options.logger; }
    if (options.seekCache !== undefined) { this.seekCache = options.seekCache; }
    if (options.stateCache !== undefined) { this.stateCache = options.stateCache; }
    if (options.audit !== undefined) {
      this.audit = normalizeBooleanOption(options.audit, 'audit', 'E_AUDIT_TYPE');
    }
    if (options.blobStorage !== undefined) { this.blobStorage = options.blobStorage; }
    if (options.patchBlobStorage !== undefined) { this.patchBlobStorage = options.patchBlobStorage; }
    if (options.commitMessageCodec !== undefined) { this.commitMessageCodec = options.commitMessageCodec; }
    if (options.patchJournal !== undefined) { this.patchJournal = options.patchJournal; }
    if (options.checkpointStore !== undefined) { this.checkpointStore = options.checkpointStore; }
    if (options.indexStore !== undefined) { this.indexStore = options.indexStore; }
    if (options.trust !== undefined) {
      this.trust = Object.freeze(normalizeTrustConfig(options.trust));
    }
    if (options.effectPipeline !== undefined) { this.effectPipeline = options.effectPipeline; }
    if (options.effectSinks !== undefined) { this.effectSinks = Object.freeze([...options.effectSinks]); }
    if (options.externalizationPolicy !== undefined) { this.externalizationPolicy = options.externalizationPolicy; }
    if (options.openStateSession !== undefined) { this.openStateSession = options.openStateSession; }
    if (options.scheduler !== undefined) { this.scheduler = options.scheduler; }

    Object.freeze(this);
  }

  static from(options: RuntimeHostOpenOptions | WarpOpenOptions): WarpOpenOptions {
    if (options instanceof WarpOpenOptions) {
      return options;
    }
    return new WarpOpenOptions(options);
  }

  static minimal(options: {
    persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
    graphName?: string;
    writerId?: string;
  }): WarpOpenOptions {
    return new WarpOpenOptions({
      persistence: options.persistence,
      graphName: options.graphName ?? 'default',
      writerId: options.writerId ?? 'local',
    });
  }
}

export type RuntimeHostOpenInput = RuntimeHostOpenOptions | WarpOpenOptions;

function normalizeBooleanOption(value: boolean, label: string, code: string): boolean {
  if (typeof value !== 'boolean') {
    throw new WarpError(`${label} must be a boolean`, code);
  }
  return value;
}

function normalizeCheckpointPolicy(
  checkpointPolicy: { every: number } | null | undefined,
): { every: number } | undefined {
  if (checkpointPolicy === null || checkpointPolicy === undefined) {
    return undefined;
  }
  if (typeof checkpointPolicy !== 'object') {
    throw new WarpError('checkpointPolicy must be an object with { every: number }', 'E_CHECKPOINT_POLICY_TYPE');
  }
  if (!Number.isInteger(checkpointPolicy.every) || checkpointPolicy.every <= 0) {
    throw new WarpError('checkpointPolicy.every must be a positive integer', 'E_CHECKPOINT_POLICY_EVERY');
  }
  return Object.freeze({ every: checkpointPolicy.every });
}

function snapshotGCPolicy(value: GCPolicyConfig | GCPolicy | undefined): GCPolicyConfig | GCPolicy {
  if (value === undefined) {
    return Object.freeze({});
  }
  if (value instanceof GCPolicy) {
    return value;
  }
  return Object.freeze({ ...value });
}

function normalizeDeletePolicy(policy: DeletePolicy): DeletePolicy {
  if (!VALID_DELETE_POLICIES.includes(policy)) {
    throw new WarpError(
      `onDeleteWithData must be one of: ${VALID_DELETE_POLICIES.join(', ')}`,
      'E_ON_DELETE_WITH_DATA_INVALID',
      { context: { got: policy, valid: VALID_DELETE_POLICIES } },
    );
  }
  return policy;
}

export type RuntimeMigrationBoundary = { _validateMigrationBoundary(): Promise<void> };

export type RuntimeBooted<T extends RuntimeMigrationBoundary> = {
  runtime: T;
  normalizedTrust: NormalizedTrustConfig;
};

export async function resolveRuntimeHostConstructionOptions(
  input: RuntimeHostOpenInput,
): Promise<{
  options: RuntimeHostConstructionOptions;
  normalizedTrust: NormalizedTrustConfig;
}> {
  const options = WarpOpenOptions.from(input);
  const {
    persistence,
    graphName,
    writerId,
    gcPolicy,
    adjacencyCacheSize,
    checkpointPolicy,
    autoMaterialize,
    onDeleteWithData,
    logger,
    crypto,
    codec,
    trustCrypto,
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
    scheduler,
  } = options;

  const normalizedTrust = normalizeTrustConfig(trust);

  const resolvedBlobStorage = await resolveBlobStorage(blobStorage, persistence);
  const resolvedCommitMessageCodec = await resolveConfiguredCommitMessageCodec(commitMessageCodec);
  const resolvedCodec = await resolveConfiguredCodec(codec);
  const resolvedCrypto = await resolveConfiguredCrypto(crypto);
  const resolvedTrustCrypto = await resolveConfiguredTrustCrypto(trustCrypto, normalizedTrust);
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
      ...(patchBlobStorage !== undefined && patchBlobStorage !== null
        ? { legacyPatchBlobStorage: patchBlobStorage }
        : {}),
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
      crypto: resolvedCrypto,
      codec: resolvedCodec,
      ...(resolvedTrustCrypto !== undefined ? { trustCrypto: resolvedTrustCrypto } : {}),
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
      ...(resolvedEffectPipeline !== undefined && resolvedEffectPipeline !== null
        ? { effectPipeline: resolvedEffectPipeline }
        : {}),
      ...(resolvedOpenStateSession === undefined ? {} : { openStateSession: resolvedOpenStateSession }),
      ...(scheduler === undefined ? {} : { scheduler }),
    },
  };
}
