import type {
  BundleCapability,
  CacheEntryMetadata,
  CacheInspection,
  CacheSet,
  PageCapability,
} from '@git-stunts/git-cas';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type MaterializationCacheDiagnosticsPort
  from '../../ports/MaterializationCacheDiagnosticsPort.ts';
import type {
  MaterializationCacheCoordinateEvidence,
  MaterializationCacheEntryDiagnostic,
  MaterializationCacheInspection,
  MaterializationCacheIssue,
  MaterializationCachePolicyEvidence,
  MaterializationCacheRepair,
} from '../../ports/MaterializationCacheDiagnosticsPort.ts';
import GitCasMaterializationCacheKey from './GitCasMaterializationCacheKey.ts';
import {
  decodeMaterializationMembers,
} from './GitCasMaterializationBundle.ts';
import {
  decodeMaterializationDescriptor,
  MATERIALIZATION_DESCRIPTOR_MAX_BYTES,
} from './GitCasMaterializationDescriptor.ts';
import {
  requireDependency,
  requireNonEmpty,
} from './GitCasMaterializationStoreValidation.ts';

const CACHE_NAMESPACE = 'git-warp/materializations';
const CACHE_INSPECTION_PAGE_SIZE = 100;
const MISSING_ERROR_CODES = new Set([
  'BUNDLE_MEMBER_NOT_FOUND',
  'GIT_OBJECT_NOT_FOUND',
  'HANDLE_TARGET_MISSING',
  'MANIFEST_NOT_FOUND',
]);

type DiagnosticsCacheSet = Pick<
  CacheSet,
  'doctor' | 'get' | 'inspect' | 'remove' | 'repair' | 'ref' | 'sweep'
>;

export type GitCasMaterializationCacheDiagnosticsFacade = Readonly<{
  bundles: Pick<BundleCapability, 'iterateMemberReferences'>;
  caches: {
    open(options: { readonly namespace: string }): Promise<DiagnosticsCacheSet>;
  };
  pages: Pick<PageCapability, 'get'>;
}>;

/** WARP-domain explanations composed from git-cas cache evidence. */
export default class GitCasMaterializationCacheDiagnosticsAdapter
implements MaterializationCacheDiagnosticsPort {
  readonly #cache: Promise<DiagnosticsCacheSet>;
  readonly #cacheKeys: GitCasMaterializationCacheKey;
  readonly #cas: GitCasMaterializationCacheDiagnosticsFacade;
  readonly #codec: CodecPort;
  readonly #laneName: string;
  readonly #wallClockMs: () => number;

  constructor(options: {
    readonly cas: GitCasMaterializationCacheDiagnosticsFacade;
    readonly codec: CodecPort;
    readonly crypto: CryptoPort;
    readonly laneName: string;
    readonly wallClockMs?: () => number;
  }) {
    requireDependency(options.cas, 'cas');
    requireDependency(options.codec, 'codec');
    requireDependency(options.crypto, 'crypto');
    this.#cas = options.cas;
    this.#codec = options.codec;
    this.#laneName = requireNonEmpty(options.laneName, 'laneName');
    this.#wallClockMs = options.wallClockMs ?? Date.now;
    this.#cacheKeys = new GitCasMaterializationCacheKey({
      codec: options.codec,
      crypto: options.crypto,
      laneName: this.#laneName,
    });
    const cache = options.cas.caches.open({ namespace: CACHE_NAMESPACE });
    cache.catch(() => {});
    this.#cache = cache;
  }

  async inspectCache(): Promise<MaterializationCacheInspection> {
    const cache = await this.#cache;
    const doctor = await cache.doctor();
    const issues = doctor.issues.map(normalizeIssue);
    const outcome = await inspectOutcome(cache);
    if (outcome.inspection === null) {
      return failedInspection(cache.ref, [...issues, outcome.issue]);
    }
    const prefix = await this.#cacheKeys.currentPrefix();
    const entries = await Promise.all(
      outcome.inspection.entries
        .filter((entry) => entry.key.startsWith(prefix))
        .map(async (entry) => await this.#diagnoseEntry(cache, entry)),
    );
    return successfulInspection(outcome.inspection, entries, {
      issues,
      healthy: doctor.healthy,
    });
  }

  async repairCache(): Promise<MaterializationCacheRepair> {
    const cache = await this.#cache;
    const before = await this.inspectCache();
    const brokenKeys = before.entries
      .filter((entry) => entry.status === 'missing' || entry.status === 'malformed')
      .map((entry) => entry.key);
    await cache.sweep();
    for (const key of brokenKeys) {
      await cache.remove(key);
    }
    const retained = await inspectAll(cache);
    const repair = await cache.repair({
      entries: retained.entries.map(repairEntry),
      ...(retained.state === null ? {} : { policy: retained.state.policy }),
    });
    const after = await this.inspectCache();
    const expiredKeys = before.entries
      .filter((entry) => entry.status === 'expired')
      .map((entry) => entry.key);
    return Object.freeze({
      before,
      after,
      removedKeys: Object.freeze([...new Set([...brokenKeys, ...expiredKeys])].sort()),
      generation: repair.generation,
    });
  }

  async #diagnoseEntry(
    cache: DiagnosticsCacheSet,
    entry: Readonly<CacheEntryMetadata>,
  ): Promise<MaterializationCacheEntryDiagnostic> {
    if (expired(entry.expiresAt, this.#wallClockMs())) {
      return diagnosticEntry(entry, { status: 'expired', collectible: true });
    }
    try {
      return await this.#diagnoseRetainedEntry(cache, entry);
    } catch (error) {
      return diagnosticErrorEntry(entry, normalizeIssue(error));
    }
  }

  async #diagnoseRetainedEntry(
    cache: DiagnosticsCacheSet,
    entry: Readonly<CacheEntryMetadata>,
  ): Promise<MaterializationCacheEntryDiagnostic> {
    const hit = await cache.get(entry.key);
    if (hit === null) {
      return missingCacheEntry(entry);
    }
    const bundle = new BundleHandle(hit.handle.toString());
    const members = await decodeMaterializationMembers(
      this.#cas.bundles.iterateMemberReferences({ handle: bundle.toString() }),
    );
    const descriptor = decodeMaterializationDescriptor(
      this.#codec.decode(await this.#cas.pages.get({
        handle: members.descriptor,
        maxBytes: MATERIALIZATION_DESCRIPTOR_MAX_BYTES,
      })),
    );
    const expectedKey = await this.#cacheKeys.forCoordinate(descriptor.coordinate);
    if (descriptor.laneName !== this.#laneName || expectedKey !== entry.key) {
      return mismatchedDescriptorEntry(entry);
    }
    return liveCacheEntry(entry, descriptor);
  }
}

type InspectionOutcome = Readonly<
  | { inspection: CacheInspection; issue: null }
  | { inspection: null; issue: MaterializationCacheIssue }
>;

async function inspectOutcome(cache: DiagnosticsCacheSet): Promise<InspectionOutcome> {
  try {
    return Object.freeze({ inspection: await inspectAll(cache), issue: null });
  } catch (error) {
    return Object.freeze({ inspection: null, issue: normalizeIssue(error) });
  }
}

function failedInspection(
  ref: string,
  issues: ReadonlyArray<MaterializationCacheIssue>,
): MaterializationCacheInspection {
  return Object.freeze({
    namespace: CACHE_NAMESPACE,
    ref,
    generation: null,
    healthy: false,
    entries: Object.freeze([]),
    issues: Object.freeze(issues),
    policy: null,
  });
}

function successfulInspection(
  inspection: CacheInspection,
  entries: ReadonlyArray<MaterializationCacheEntryDiagnostic>,
  doctor: Readonly<{
    issues: ReadonlyArray<MaterializationCacheIssue>;
    healthy: boolean;
  }>,
): MaterializationCacheInspection {
  return Object.freeze({
    namespace: CACHE_NAMESPACE,
    ref: inspection.ref,
    generation: inspection.generation,
    healthy: doctor.healthy && !entries.some(isBrokenEntry),
    entries: Object.freeze(entries),
    issues: Object.freeze(doctor.issues),
    policy: policyEvidence(inspection),
  });
}

function isBrokenEntry(entry: MaterializationCacheEntryDiagnostic): boolean {
  return entry.status === 'missing' || entry.status === 'malformed';
}

function missingCacheEntry(
  entry: Readonly<CacheEntryMetadata>,
): MaterializationCacheEntryDiagnostic {
  return diagnosticEntry(entry, {
    status: 'missing',
    collectible: true,
    issue: diagnosticIssue(
      'CACHE_ENTRY_MISSING',
      'git-cas could not resolve the retained entry',
    ),
  });
}

function mismatchedDescriptorEntry(
  entry: Readonly<CacheEntryMetadata>,
): MaterializationCacheEntryDiagnostic {
  return diagnosticEntry(entry, {
    status: 'malformed',
    collectible: true,
    issue: diagnosticIssue(
      'MATERIALIZATION_DESCRIPTOR_MISMATCH',
      'materialization descriptor does not match its lane-scoped cache key',
    ),
  });
}

function liveCacheEntry(
  entry: Readonly<CacheEntryMetadata>,
  descriptor: ReturnType<typeof decodeMaterializationDescriptor>,
): MaterializationCacheEntryDiagnostic {
  return diagnosticEntry(entry, {
    status: 'live',
    collectible: entry.policy === 'evictable',
    coordinate: coordinateEvidence(descriptor.coordinate),
    stateHash: descriptor.stateHash,
  });
}

function diagnosticErrorEntry(
  entry: Readonly<CacheEntryMetadata>,
  diagnostic: MaterializationCacheIssue,
): MaterializationCacheEntryDiagnostic {
  return diagnosticEntry(entry, {
    status: MISSING_ERROR_CODES.has(diagnostic.code) ? 'missing' : 'malformed',
    collectible: true,
    issue: diagnostic,
  });
}

async function inspectAll(cache: DiagnosticsCacheSet): Promise<CacheInspection> {
  let cursor: string | null = null;
  let first: CacheInspection | null = null;
  const entries: Readonly<CacheEntryMetadata>[] = [];
  do {
    const page = await cache.inspect({
      limit: CACHE_INSPECTION_PAGE_SIZE,
      cursor,
    });
    first ??= page;
    entries.push(...page.entries);
    cursor = page.nextCursor;
  } while (cursor !== null);
  if (first === null) {
    throw new AdapterValidationError('git-cas cache inspection returned no page');
  }
  return Object.freeze({
    ...first,
    entries: Object.freeze(entries),
    nextCursor: null,
  });
}

function diagnosticEntry(
  entry: Readonly<CacheEntryMetadata>,
  options: Readonly<{
    status: MaterializationCacheEntryDiagnostic['status'];
    collectible: boolean;
    coordinate?: MaterializationCacheCoordinateEvidence;
    stateHash?: string | null;
    issue?: MaterializationCacheIssue;
  }>,
): MaterializationCacheEntryDiagnostic {
  return Object.freeze({
    key: entry.key,
    handle: entry.handle,
    status: options.status,
    retention: entry.policy,
    expiresAt: entry.expiresAt,
    createdAt: entry.createdAt,
    accessedAt: entry.accessedAt,
    logicalBytes: entry.logicalBytes,
    collectible: options.collectible,
    coordinate: options.coordinate ?? null,
    stateHash: options.stateHash ?? null,
    issue: options.issue ?? null,
  });
}

function coordinateEvidence(
  coordinate: Parameters<GitCasMaterializationCacheKey['forCoordinate']>[0],
): MaterializationCacheCoordinateEvidence {
  return Object.freeze({
    ceiling: coordinate.ceiling,
    frontier: Object.freeze(coordinate.frontierEntries.map((entry) => Object.freeze({
      writerId: entry.writerId,
      patchSha: entry.patchSha,
    }))),
  });
}

function policyEvidence(
  inspection: CacheInspection,
): MaterializationCachePolicyEvidence | null {
  const { policy } = inspection;
  if (policy === null) {
    return null;
  }
  return Object.freeze({
    satisfied: policy.satisfied,
    entryCount: policy.entryCount,
    logicalBytes: policy.logicalBytes,
    pinnedEntries: policy.pinnedEntries,
    evictableEntries: policy.evictableEntries,
    expiredEntries: policy.expiredEntries,
    maxEntries: policy.limits.maxEntries,
    maxBytes: policy.limits.maxBytes,
    accessResolutionMs: policy.limits.accessResolutionMs,
  });
}

function repairEntry(entry: Readonly<CacheEntryMetadata>) {
  return Object.freeze({
    key: entry.key,
    handle: entry.handle,
    retention: entry.policy,
    expiresAt: entry.expiresAt,
    createdAt: entry.createdAt,
    accessedAt: entry.accessedAt,
  });
}

function expired(expiresAt: string | null, nowMs: number): boolean {
  return expiresAt !== null && Date.parse(expiresAt) <= nowMs;
}

function normalizeIssue(value: unknown): MaterializationCacheIssue {
  if (typeof value !== 'object' || value === null) {
    return diagnosticIssue('CACHE_DIAGNOSTIC_ERROR', String(value));
  }
  return diagnosticIssue(issueCode(value), issueMessage(value));
}

function issueCode(value: object): string {
  return 'code' in value && typeof value.code === 'string'
    ? value.code
    : 'CACHE_DIAGNOSTIC_ERROR';
}

function issueMessage(value: object): string | null {
  return 'message' in value && typeof value.message === 'string'
    ? value.message
    : null;
}

function diagnosticIssue(code: string, message: string | null): MaterializationCacheIssue {
  return Object.freeze({ code, message });
}
