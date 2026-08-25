import type {
  BundleCapability,
  PageCapability,
} from '@git-stunts/git-cas';
import TrieStoreError from '../../domain/errors/TrieStoreError.ts';
import {
  TRIE_BRANCH_WRITE_WAVE_MAX_ITEMS,
  TRIE_LEAF_WRITE_WAVE_MAX_BYTES,
  TRIE_LEAF_WRITE_WAVE_MAX_ITEMS,
} from '../../domain/orset/trie/TrieWriteWavePolicy.ts';
import type ArtifactStagingPort from '../../ports/ArtifactStagingPort.ts';
import type { StageOrderedBundleRequest } from '../../ports/ArtifactStagingPort.ts';
import {
  GIT_CAS_TRIE_LEAF_MAX_BYTES,
  GIT_CAS_TRIE_LEAF_PATH,
} from './GitCasTrieStorageProfile.ts';

const MAX_BUNDLE_BATCH_MEMBERS = 8_192;
const MAX_BUNDLE_BATCH_OBJECTS = 256;
const MAX_BUNDLE_BATCH_BYTES = 64 * 1024 * 1024;
const BUNDLE_FANOUT_PAYLOAD = 1_023;

export type GitCasTrieFacade = {
  readonly bundles: Pick<
    BundleCapability,
    'getMemberReference' | 'iterateMemberReferences' | 'putOrdered'
  > & Partial<Pick<BundleCapability, 'putOrderedBatch'>>;
  readonly pages: Pick<PageCapability, 'get' | 'put'> &
    Partial<Pick<PageCapability, 'putBatch'>>;
};

type BatchPages = Pick<PageCapability, 'putBatch'>;
type BatchBundles = Pick<BundleCapability, 'putOrdered' | 'putOrderedBatch'>;
type LeafBatchStaging = BundleBatchStaging & Required<Pick<ArtifactStagingPort, 'stagePages'>>;
type BundleBatchStaging = ArtifactStagingPort & Required<Pick<
  ArtifactStagingPort,
  'stageOrderedBundles'
>>;
type OrderedBundleRequest = StageOrderedBundleRequest & Readonly<{
  members: Array<[string, string]>;
}>;
type BundleWriteUnit = Readonly<{
  batch: boolean;
  requests: OrderedBundleRequest[];
}>;
type BundleWaveWeight = Readonly<{
  bundles: number;
  members: number;
  objects: number;
}>;

export async function tryWriteLeafWave(
  leaves: readonly Uint8Array[],
  cas: GitCasTrieFacade,
  staging?: ArtifactStagingPort,
): Promise<readonly string[] | null> {
  if (staging !== undefined && supportsLeafBatchStaging(staging)) {
    const pages = await stagePageWaves(leaves, staging);
    return await stageBundleWaves(leafBundleRequests(pages), staging);
  }
  if (staging === undefined && supportsDirectLeafBatches(cas)) {
    const pages = await putPageWaves(leaves, cas.pages);
    return await putBundleWaves(leafBundleRequests(pages), cas.bundles);
  }
  return null;
}

export async function tryWriteBranchWave(
  memberGroups: readonly Array<[string, string]>[],
  cas: GitCasTrieFacade,
  staging?: ArtifactStagingPort,
): Promise<readonly string[] | null> {
  const requests = memberGroups.map((members) => ({ members }));
  if (staging !== undefined && supportsBundleBatchStaging(staging)) {
    return await stageBundleWaves(requests, staging);
  }
  if (staging === undefined && supportsDirectBundleBatches(cas)) {
    return await putBundleWaves(requests, cas.bundles);
  }
  return null;
}

function supportsLeafBatchStaging(
  staging: ArtifactStagingPort,
): staging is LeafBatchStaging {
  return typeof staging.stagePages === 'function' &&
    typeof staging.stageOrderedBundles === 'function';
}

function supportsBundleBatchStaging(
  staging: ArtifactStagingPort,
): staging is BundleBatchStaging {
  return typeof staging.stageOrderedBundles === 'function';
}

function supportsDirectLeafBatches(
  cas: GitCasTrieFacade,
): cas is GitCasTrieFacade & Readonly<{ pages: BatchPages; bundles: BatchBundles }> {
  return typeof cas.pages.putBatch === 'function' &&
    typeof cas.bundles.putOrderedBatch === 'function';
}

function supportsDirectBundleBatches(
  cas: GitCasTrieFacade,
): cas is GitCasTrieFacade & Readonly<{ bundles: BatchBundles }> {
  return typeof cas.bundles.putOrderedBatch === 'function';
}

async function stagePageWaves(
  leaves: readonly Uint8Array[],
  staging: LeafBatchStaging,
): Promise<readonly string[]> {
  const handles: string[] = [];
  for (const wave of leafPageWaves(leaves)) {
    const staged = await staging.stagePages(wave, {
      maxBytes: GIT_CAS_TRIE_LEAF_MAX_BYTES,
      maxBatchBytes: TRIE_LEAF_WRITE_WAVE_MAX_BYTES,
      maxBatchPages: TRIE_LEAF_WRITE_WAVE_MAX_ITEMS,
    });
    handles.push(...requireDenseWriteResults('page', wave.length, staged));
  }
  return handles;
}

async function putPageWaves(
  leaves: readonly Uint8Array[],
  pages: BatchPages,
): Promise<readonly string[]> {
  const handles: string[] = [];
  for (const wave of leafPageWaves(leaves)) {
    const staged = await pages.putBatch({
      pages: wave.map((source) => ({ source, maxBytes: GIT_CAS_TRIE_LEAF_MAX_BYTES })),
      maxBatchBytes: TRIE_LEAF_WRITE_WAVE_MAX_BYTES,
      maxBatchPages: TRIE_LEAF_WRITE_WAVE_MAX_ITEMS,
    });
    const dense = requireDenseWriteResults('page', wave.length, staged);
    handles.push(...dense.map((page) => page.handle.toString()));
  }
  return handles;
}

function leafPageWaves(leaves: readonly Uint8Array[]): readonly Uint8Array[][] {
  const waves: Uint8Array[][] = [];
  let wave: Uint8Array[] = [];
  let bytes = 0;
  for (const leaf of leaves) {
    if (wave.length === TRIE_LEAF_WRITE_WAVE_MAX_ITEMS || exceedsPageBytes(wave, bytes, leaf)) {
      waves.push(wave);
      wave = [];
      bytes = 0;
    }
    wave.push(leaf);
    bytes += leaf.byteLength;
  }
  if (wave.length > 0) { waves.push(wave); }
  return waves;
}

function exceedsPageBytes(
  wave: readonly Uint8Array[],
  bytes: number,
  leaf: Uint8Array,
): boolean {
  return wave.length > 0 && bytes + leaf.byteLength > TRIE_LEAF_WRITE_WAVE_MAX_BYTES;
}

function leafBundleRequests(pages: readonly string[]): OrderedBundleRequest[] {
  return pages.map((page) => ({ members: [[GIT_CAS_TRIE_LEAF_PATH, page]] }));
}

async function stageBundleWaves(
  requests: readonly OrderedBundleRequest[],
  staging: BundleBatchStaging,
): Promise<readonly string[]> {
  const handles: string[] = [];
  for (const unit of bundleWriteUnits(requests)) {
    if (!unit.batch) {
      handles.push((await staging.stageOrderedBundle(requireRequest(unit).members)).toString());
      continue;
    }
    const staged = await staging.stageOrderedBundles(unit.requests, bundleBatchLimits());
    const dense = requireDenseWriteResults('bundle', unit.requests.length, staged);
    handles.push(...dense.map((bundle) => bundle.toString()));
  }
  return Object.freeze(handles);
}

async function putBundleWaves(
  requests: readonly OrderedBundleRequest[],
  bundles: BatchBundles,
): Promise<readonly string[]> {
  const handles: string[] = [];
  for (const unit of bundleWriteUnits(requests)) {
    if (!unit.batch) {
      handles.push((await bundles.putOrdered(requireRequest(unit))).handle.toString());
      continue;
    }
    const staged = await bundles.putOrderedBatch({
      bundles: unit.requests,
      ...bundleBatchLimits(),
    });
    const dense = requireDenseWriteResults('bundle', unit.requests.length, staged);
    handles.push(...dense.map((bundle) => bundle.handle.toString()));
  }
  return Object.freeze(handles);
}

function requireRequest(unit: BundleWriteUnit): OrderedBundleRequest {
  const request = unit.requests[0];
  if (request === undefined) {
    throw new TrieStoreError('git-cas bundle write unit is empty', {
      code: 'E_TRIE_STORE_WRITE',
    });
  }
  return request;
}

function bundleBatchLimits(): Readonly<{
  maxBatchBundles: number;
  maxBatchMembers: number;
  maxBatchObjects: number;
  maxBatchBytes: number;
}> {
  return {
    maxBatchBundles: TRIE_BRANCH_WRITE_WAVE_MAX_ITEMS,
    maxBatchMembers: MAX_BUNDLE_BATCH_MEMBERS,
    maxBatchObjects: MAX_BUNDLE_BATCH_OBJECTS,
    maxBatchBytes: MAX_BUNDLE_BATCH_BYTES,
  };
}

function bundleWriteUnits(requests: readonly OrderedBundleRequest[]): BundleWriteUnit[] {
  const units: BundleWriteUnit[] = [];
  let wave: OrderedBundleRequest[] = [];
  let members = 0; let objects = 0;
  for (const request of requests) {
    const nextMembers = request.members.length;
    const nextObjects = plannedBundleObjects(nextMembers);
    if (!batchableBundle(nextMembers, nextObjects)) {
      pushBatchUnit(units, wave);
      units.push({ batch: false, requests: [request] });
      wave = [];
      members = 0; objects = 0;
      continue;
    }
    if (bundleWaveFull(
      { bundles: wave.length, members, objects },
      { bundles: 1, members: nextMembers, objects: nextObjects },
    )) {
      pushBatchUnit(units, wave);
      wave = [];
      members = 0; objects = 0;
    }
    wave.push(request);
    members += nextMembers;
    objects += nextObjects;
  }
  pushBatchUnit(units, wave);
  return units;
}

function batchableBundle(members: number, objects: number): boolean {
  return members <= MAX_BUNDLE_BATCH_MEMBERS && objects <= MAX_BUNDLE_BATCH_OBJECTS;
}

function bundleWaveFull(current: BundleWaveWeight, next: BundleWaveWeight): boolean {
  return current.bundles >= TRIE_BRANCH_WRITE_WAVE_MAX_ITEMS ||
    current.members + next.members > MAX_BUNDLE_BATCH_MEMBERS ||
    current.objects + next.objects > MAX_BUNDLE_BATCH_OBJECTS;
}

function pushBatchUnit(units: BundleWriteUnit[], wave: OrderedBundleRequest[]): void {
  if (wave.length > 0) { units.push({ batch: true, requests: wave }); }
}

function plannedBundleObjects(memberCount: number): number {
  let level = Math.max(1, Math.ceil(memberCount / BUNDLE_FANOUT_PAYLOAD));
  let descriptors = level + 1;
  while (level > 1) {
    level = Math.ceil(level / BUNDLE_FANOUT_PAYLOAD);
    descriptors += level;
  }
  return descriptors * 2;
}

function requireWriteCardinality(kind: 'page' | 'bundle', expected: number, actual: number): void {
  if (expected === actual) { return; }
  throw new TrieStoreError(`git-cas returned the wrong ${kind} batch count`, {
    code: 'E_TRIE_STORE_WRITE',
    context: { kind, expected, actual },
  });
}

function requireDenseWriteResults<T>(
  kind: 'page' | 'bundle',
  expected: number,
  results: readonly T[],
): readonly T[] {
  requireWriteCardinality(kind, expected, results.length);
  for (let index = 0; index < results.length; index += 1) {
    if (results[index] === undefined) {
      throw new TrieStoreError(`git-cas omitted ordered ${kind} batch result`, {
        code: 'E_TRIE_STORE_WRITE',
        context: { kind, expected, actual: results.length, index },
      });
    }
  }
  return results;
}
