import { validateGraphName, validateWriterId } from '../utils/RefLayout.ts';
import { AuditReceiptService } from '../services/audit/AuditReceiptService.ts';
import MaterializedViewService from '../services/MaterializedViewService.ts';
import StateHashService from '../services/state/StateHashService.ts';
import StateSession from '../orset/session/StateSession.ts';
import PageCache from '../orset/trie/PageCache.ts';
import TrieGeometry from '../orset/trie/TrieGeometry.ts';
import TrieMaterializationReader from '../materialization/TrieMaterializationReader.ts';
import WarpError from '../errors/WarpError.ts';
import {
  buildEffectPipeline,
  normalizeTrustConfig,
  type TrustMode,
  type NormalizedTrustConfig,
} from '../runtimeHelpers.ts';
import {
  resolveConfiguredCodec,
  resolveConfiguredCommitMessageCodec,
  resolveConfiguredCrypto,
  resolveConfiguredRuntimeStorage,
  resolveConfiguredTrustCrypto,
} from './RuntimeHostPortResolvers.ts';

import type { CorePersistence } from '../types/WarpPersistence.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type WarpStateCachePort from '../../ports/WarpStateCachePort.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type AuditLogPort from '../../ports/AuditLogPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type StrandStorePort from '../../ports/StrandStorePort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type CheckpointStorePort from '../../ports/CheckpointStorePort.ts';
import type IndexStorePort from '../../ports/IndexStorePort.ts';
import type IntentStorePort from '../../ports/IntentStorePort.ts';
import type MaterializationStorePort from '../../ports/MaterializationStorePort.ts';
import type MaterializationReadPort from '../../ports/MaterializationReadPort.ts';
import type EffectSinkPort from '../../ports/EffectSinkPort.ts';
import type RuntimeStorageProviderPort from '../../ports/RuntimeStorageProviderPort.ts';
import type SchedulerPort from '../../ports/SchedulerPort.ts';
import type TrustCryptoPort from '../../ports/TrustCryptoPort.ts';
import type { EffectPipeline } from '../services/EffectPipeline.ts';
import type { ExternalizationPolicy } from '../types/ExternalizationPolicy.ts';
import GCPolicy, { type GCPolicyConfig } from '../services/GCPolicy.ts';
import type { MaterializeSessionOpener } from '../services/controllers/MaterializeSessionBridge.ts';

type DeletePolicy = 'reject' | 'cascade' | 'warn';
const VALID_DELETE_POLICIES: ReadonlyArray<DeletePolicy> = ['reject', 'cascade', 'warn'];

export type RuntimeHostConstructionOptions = {
  persistence: CorePersistence;
  runtimeStorage: RuntimeStorageProviderPort;
  graphName: string;
  writerId: string;
  gcPolicy?: GCPolicyConfig | GCPolicy;
  checkpointPolicy?: { every: number };
  autoMaterialize?: boolean;
  onDeleteWithData?: DeletePolicy;
  logger?: LoggerPort;
  crypto: CryptoPort;
  codec: CodecPort;
  trustCrypto?: TrustCryptoPort;
  stateCache?: WarpStateCachePort | null;
  audit?: boolean;
  assetStorage: AssetStoragePort;
  auditLog: AuditLogPort;
  commitMessageCodec: CommitMessageCodecPort;
  trust?: { mode?: TrustMode; pin?: string | null };
  patchJournal: PatchJournalPort;
  strandStore: StrandStorePort;
  checkpointStore: CheckpointStorePort;
  indexStore: IndexStorePort;
  intentStore: IntentStorePort;
  materializations: MaterializationStorePort;
  materializationRead?: MaterializationReadPort;
  viewService: MaterializedViewService;
  stateHashService?: StateHashService;
  auditService?: AuditReceiptService;
  effectPipeline?: EffectPipeline;
  openStateSession?: MaterializeSessionOpener;
  scheduler?: SchedulerPort;
};

export type RuntimeHostOpenOptions = {
  persistence: CorePersistence;
  runtimeStorage?: RuntimeStorageProviderPort;
  graphName: string;
  writerId: string;
  gcPolicy?: GCPolicyConfig | GCPolicy;
  checkpointPolicy?: { every: number } | null;
  autoMaterialize?: boolean;
  onDeleteWithData?: DeletePolicy;
  logger?: LoggerPort;
  crypto?: CryptoPort;
  codec?: CodecPort;
  trustCrypto?: TrustCryptoPort;
  stateCache?: WarpStateCachePort | null;
  audit?: boolean;
  commitMessageCodec?: CommitMessageCodecPort;
  trust?: { mode?: TrustMode; pin?: string | null };
  effectPipeline?: EffectPipeline;
  effectSinks?: readonly EffectSinkPort[];
  externalizationPolicy?: ExternalizationPolicy;
  openStateSession?: MaterializeSessionOpener;
  scheduler?: SchedulerPort;
};

export class WarpOpenOptions {
  readonly persistence: CorePersistence;
  readonly runtimeStorage?: RuntimeStorageProviderPort;
  readonly graphName: string;
  readonly writerId: string;
  readonly gcPolicy: GCPolicyConfig | GCPolicy;
  readonly checkpointPolicy?: { every: number };
  readonly autoMaterialize?: boolean;
  readonly onDeleteWithData?: DeletePolicy;
  readonly logger?: LoggerPort;
  readonly crypto?: CryptoPort;
  readonly codec?: CodecPort;
  readonly trustCrypto?: TrustCryptoPort;
  readonly stateCache?: WarpStateCachePort | null;
  readonly audit?: boolean;
  readonly commitMessageCodec?: CommitMessageCodecPort;
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
    if (options.runtimeStorage !== null && options.runtimeStorage !== undefined) {
      this.runtimeStorage = options.runtimeStorage;
    }
    this.graphName = options.graphName;
    this.writerId = options.writerId;
    this.gcPolicy = snapshotGCPolicy(options.gcPolicy);
    if (options.crypto !== undefined) { this.crypto = options.crypto; }
    if (options.codec !== undefined) { this.codec = options.codec; }
    if (options.trustCrypto !== undefined) { this.trustCrypto = options.trustCrypto; }

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
    if (options.stateCache !== undefined) { this.stateCache = options.stateCache; }
    if (options.audit !== undefined) {
      this.audit = normalizeBooleanOption(options.audit, 'audit', 'E_AUDIT_TYPE');
    }
    if (options.commitMessageCodec !== undefined) { this.commitMessageCodec = options.commitMessageCodec; }
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
    persistence: CorePersistence;
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
    runtimeStorage,
    graphName,
    writerId,
    gcPolicy,
    checkpointPolicy,
    autoMaterialize,
    onDeleteWithData,
    logger,
    crypto,
    codec,
    trustCrypto,
    stateCache,
    audit,
    commitMessageCodec,
    trust,
    effectPipeline,
    effectSinks,
    externalizationPolicy,
    openStateSession,
    scheduler,
  } = options;

  const normalizedTrust = normalizeTrustConfig(trust);

  const resolvedCommitMessageCodec = await resolveConfiguredCommitMessageCodec(commitMessageCodec);
  const resolvedCodec = await resolveConfiguredCodec(codec);
  const resolvedCrypto = await resolveConfiguredCrypto(crypto);
  const resolvedTrustCrypto = await resolveConfiguredTrustCrypto(trustCrypto, normalizedTrust);
  const resolvedRuntimeStorage = await resolveConfiguredRuntimeStorage(runtimeStorage);
  const storageServices = await resolvedRuntimeStorage.createRuntimeStorageServices({
    timelineName: graphName,
    codec: resolvedCodec,
    crypto: resolvedCrypto,
    commitMessageCodec: resolvedCommitMessageCodec,
    ...(logger === undefined ? {} : { logger }),
  });
  const resolvedAssetStorage = storageServices.content;

  let resolvedStateCache: WarpStateCachePort | undefined;
  if (stateCache !== undefined && stateCache !== null) {
    resolvedStateCache = stateCache;
  } else if (stateCache !== null) {
    resolvedStateCache = storageServices.stateSnapshots;
  }

  const resolvedIndexStore = storageServices.indexes;

  const resolvedStateHashService = new StateHashService({
    codec: resolvedCodec,
    crypto: resolvedCrypto,
  });

  const resolvedViewService = new MaterializedViewService({
    codec: resolvedCodec,
  });

  let resolvedAuditService: AuditReceiptService | undefined;
  if (audit === true) {
    resolvedAuditService = new AuditReceiptService({
      auditLog: storageServices.auditLog,
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
  let resolvedMaterializationRead: MaterializationReadPort | undefined;
  if (openStateSession !== undefined) {
    resolvedOpenStateSession = openStateSession;
  } else if (storageServices.trie !== undefined) {
    const store = storageServices.trie;
    const geometry = TrieGeometry.default16way();
    resolvedOpenStateSession = async (roots, sessionOptions) =>
      await StateSession.open({
        nodeAliveRootOid: roots.nodeAliveRootOid,
        edgeAliveRootOid: roots.edgeAliveRootOid,
        store,
        codec: resolvedCodec,
        geometry,
        pageCache: new PageCache({ maxResident: 256 }),
        workspace: sessionOptions.workspace,
      });
    // A custom session opener owns its root encoding; pair this reader only
    // with the built-in session that shares its store and geometry.
    resolvedMaterializationRead = new TrieMaterializationReader({
      store,
      codec: resolvedCodec,
      geometry,
      indexStore: resolvedIndexStore,
    });
  }

  return {
    normalizedTrust,
    options: {
      persistence,
      runtimeStorage: resolvedRuntimeStorage,
      graphName,
      writerId,
      gcPolicy,
      ...(checkpointPolicy !== undefined ? { checkpointPolicy } : {}),
      ...(autoMaterialize !== undefined ? { autoMaterialize } : {}),
      ...(onDeleteWithData !== undefined ? { onDeleteWithData } : {}),
      ...(logger !== undefined ? { logger } : {}),
      crypto: resolvedCrypto,
      codec: resolvedCodec,
      ...(resolvedTrustCrypto !== undefined ? { trustCrypto: resolvedTrustCrypto } : {}),
      ...(resolvedStateCache !== undefined ? { stateCache: resolvedStateCache } : {}),
      ...(audit !== undefined ? { audit } : {}),
      assetStorage: resolvedAssetStorage,
      auditLog: storageServices.auditLog,
      commitMessageCodec: resolvedCommitMessageCodec,
      ...(trust !== undefined ? { trust } : {}),
      patchJournal: storageServices.patchJournal,
      strandStore: storageServices.strands,
      checkpointStore: storageServices.checkpoints,
      indexStore: resolvedIndexStore,
      intentStore: storageServices.intents,
      materializations: storageServices.materializations,
      ...(resolvedMaterializationRead === undefined
        ? {}
        : { materializationRead: resolvedMaterializationRead }),
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
