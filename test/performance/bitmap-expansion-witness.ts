// Measures what reading one admitted edge bitmap costs on each in-process read path (#1159).
//
// An edge bitmap is bounded by bytes and structure, not by cardinality, so a run-encoded
// bitmap of 2^32 values fits in 925,700 bytes. Each case reads a bitmap of `containers`
// full run containers (`containers` * 65,536 values) through one read path in its own
// process and prints one EXPANSION_CASE line. `sweep` runs the cases in child processes
// with a fixed V8 heap limit, so a fatal V8 error ends the child and not the sweep.
//   node test/performance/bitmap-expansion-witness.ts sweep <heap MiB> <site> <containers>...
//   node test/performance/bitmap-expansion-witness.ts case <site> <containers>
// Sites: toarray, bitmap-index-reader, logical-index, node-updater, pager, pager-after-last.
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';
import { EdgeShard } from '../../src/domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../src/domain/artifacts/LabelShard.ts';
import { MetaShard } from '../../src/domain/artifacts/MetaShard.ts';
import BitmapIndexReader from '../../src/domain/services/index/BitmapIndexReader.ts';
import IndexNodeUpdater from '../../src/domain/services/index/IndexNodeUpdater.ts';
import LogicalIndexReader from '../../src/domain/services/index/LogicalIndexReader.ts';
import type { EdgeShardData, WorkingMetaShard } from '../../src/domain/services/index/types.ts';
import {
  collectNeighborhoodBitmapPage,
  createNeighborhoodCandidateHeap,
  type NeighborhoodBitmapCandidate,
  type NeighborhoodBitmapPageSource,
  type NeighborhoodLabelRegistry,
} from '../../src/domain/services/optic/CheckpointNeighborhoodBitmapPager.ts';
import type { NeighborhoodCandidatePosition } from '../../src/domain/services/optic/NeighborhoodPageCursor.ts';
import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import type BundleHandle from '../../src/domain/storage/BundleHandle.ts';
import type WarpStream from '../../src/domain/stream/WarpStream.ts';
import type CodecValue from '../../src/domain/types/codec/CodecValue.ts';
import type { IndexShard } from '../../src/domain/artifacts/IndexShard.ts';
import { getRoaringBitmap32 } from '../../src/domain/utils/roaring.ts';
import computeShardKey from '../../src/domain/utils/shardKey.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import IndexStorePort, { type IndexShardReference } from '../../src/ports/IndexStorePort.ts';
import type IndexShardTreePort from '../../src/ports/IndexShardTreePort.ts';
import { encodePortableShard, fullRunContainers } from '../helpers/PortableRoaringShardFixture.ts';

const HUB = 'hub';
const HUB_SHA = 'aa'.repeat(20);
const LABEL = 'owns';
const LAST_GLOBAL_ID = 2 ** 32 - 1;
const PAGE_LIMIT = 100;
const SITES = ['toarray', 'bitmap-index-reader', 'logical-index', 'node-updater', 'pager', 'pager-after-last'] as const;
type Site = typeof SITES[number];
type Outcome = Readonly<{ outcome: string; detail: string; resultSize: number | null; visited?: number }>;

/** Serves fixed blobs to BitmapIndexReader, which reads shards through openShard only. */
class BlobShardStore extends IndexStorePort {
  readonly #blobs: ReadonlyMap<string, Uint8Array>;

  constructor(blobs: ReadonlyMap<string, Uint8Array>) {
    super();
    this.#blobs = blobs;
  }

  override async *openShard(handle: AssetHandle): AsyncIterable<Uint8Array> {
    const bytes = this.#blobs.get(handle.toString());
    if (bytes === undefined) {
      throw new RangeError(`no blob ${handle.toString()}`);
    }
    yield await Promise.resolve(bytes);
  }

  override writeShards(_stream: WarpStream<IndexShard>): Promise<BundleHandle> { return unused(); }
  override scanShards(): WarpStream<IndexShard> { throw new RangeError('unused'); }
  override readShardHandles(): Promise<Readonly<Record<string, AssetHandle>>> { return unused(); }
  override readShardReferences(): Promise<Readonly<Record<string, IndexShardReference>>> { return unused(); }
  override readShardHandle(): Promise<AssetHandle | null> { return unused(); }
  override openShardAt(): AsyncIterable<Uint8Array> { throw new RangeError('unused'); }
  override decodeShard<TDecoded extends CodecValue = CodecValue>(): Promise<TDecoded> { return unused(); }
  override decodeShardAt<TDecoded extends CodecValue = CodecValue>(): Promise<TDecoded | null> { return unused(); }
  override openShardTree(): IndexShardTreePort { throw new RangeError('unused'); }
}

function unused<T>(): Promise<T> {
  return Promise.reject(new RangeError('unused'));
}

/** A page source over one stored bitmap that counts the candidates it resolves; none is live. */
class CountingPageSource implements NeighborhoodBitmapPageSource {
  readonly #bytes: Uint8Array;
  visited = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  readCandidateHeap(options: {
    readonly after: NeighborhoodCandidatePosition | null;
    readonly direction: 'in' | 'out';
    readonly labels: NeighborhoodLabelRegistry;
    readonly requestedLabels: readonly string[];
    readonly sourceGlobalId: number;
  }): Promise<NeighborhoodBitmapCandidate[]> {
    return Promise.resolve(createNeighborhoodCandidateHeap({ '0': { '0': this.#bytes } }, options));
  }

  resolveLiveNode(): Promise<string | null> {
    this.visited += 1;
    return Promise.resolve(null);
  }
}

function hubGlobalId(): number {
  return (Number.parseInt(computeShardKey(HUB), 16) << 24) >>> 0;
}

async function readThroughBitmapIndexReader(bytes: Uint8Array): Promise<Outcome> {
  const blobs = new Map([
    ['meta', defaultCodec.encode({ [HUB_SHA]: LAST_GLOBAL_ID })],
    ['edges', defaultCodec.encode({ [HUB_SHA]: bytes })],
  ]);
  const reader = new BitmapIndexReader({ indexStore: new BlobShardStore(blobs), codec: defaultCodec });
  reader.setup({ 'meta_aa.cbor': new AssetHandle('meta'), 'shards_fwd_aa.cbor': new AssetHandle('edges') });
  const children = await reader.getChildren(HUB_SHA);
  return { outcome: 'returned', detail: '', resultSize: children.length };
}

function readThroughLogicalIndex(bytes: Uint8Array): Outcome {
  const owner = String(hubGlobalId());
  const index = new LogicalIndexReader().loadFromShards([
    new MetaShard({ shardKey: computeShardKey(HUB), nodeToGlobal: [[HUB, hubGlobalId()]], nextLocalId: 1, alive: new Uint8Array(0) }),
    new LabelShard({ labels: [[LABEL, 0]] }),
    new EdgeShard({ shardKey: computeShardKey(HUB), direction: 'fwd', buckets: { all: { [owner]: bytes }, '0': { [owner]: bytes } } }),
  ]).toLogicalIndex();
  return { outcome: 'returned', detail: '', resultSize: index.getEdges(HUB, 'out', [0]).length };
}

function emptyWorkingMeta(): WorkingMetaShard {
  return {
    nodeToGlobal: [],
    nextLocalId: 0,
    aliveBitmap: new (getRoaringBitmap32())(),
    globalToNode: new Map(),
    nodeToGlobalMap: new Map(),
  };
}

function purgeThroughNodeUpdater(bytes: Uint8Array): Outcome {
  const shardKey = computeShardKey(HUB);
  const hubMeta = emptyWorkingMeta();
  hubMeta.nodeToGlobalMap.set(HUB, hubGlobalId());
  hubMeta.globalToNode.set(hubGlobalId(), HUB);
  const metas = new Map<string, WorkingMetaShard>([[shardKey, hubMeta]]);
  const fwdCache = new Map<string, EdgeShardData>([[shardKey, { '0': { [String(hubGlobalId())]: bytes } }]]);
  new IndexNodeUpdater().purgeNodeEdges(HUB, {
    fwdCache,
    revCache: new Map(),
    getOrLoadMeta: (key) => metas.get(key) ?? emptyWorkingMeta(),
    getOrLoadEdgeShard: (cache, _dir, key) => cache.get(key) ?? {},
  });
  return { outcome: 'returned', detail: '', resultSize: null };
}

async function readOnePage(bytes: Uint8Array, after: NeighborhoodCandidatePosition | null): Promise<Outcome> {
  const source = new CountingPageSource(bytes);
  const page = await collectNeighborhoodBitmapPage({
    after,
    direction: 'out',
    labels: { byId: new Map([[0, LABEL]]), byName: new Map([[LABEL, 0]]) },
    limit: PAGE_LIMIT,
    loader: source,
    nodeId: HUB,
    requestedLabels: [],
    sourceGlobalId: 0,
  });
  const last = page.last === null ? 'null' : String(page.last.globalId);
  return { outcome: 'returned', detail: `hasMore=${String(page.hasMore)} last=${last}`, resultSize: page.edges.length, visited: source.visited };
}

async function readSite(site: Site, bytes: Uint8Array): Promise<Outcome> {
  switch (site) {
    case 'toarray':
      return { outcome: 'returned', detail: '', resultSize: getRoaringBitmap32().deserialize(bytes, true).toArray().length };
    case 'bitmap-index-reader':
      return await readThroughBitmapIndexReader(bytes);
    case 'logical-index':
      return readThroughLogicalIndex(bytes);
    case 'node-updater':
      return purgeThroughNodeUpdater(bytes);
    case 'pager':
      return await readOnePage(bytes, null);
    case 'pager-after-last':
      return await readOnePage(bytes, { direction: 'out', globalId: LAST_GLOBAL_ID, label: LABEL });
    default: {
      const unknown: never = site;
      throw new RangeError(`unknown site ${String(unknown)}`);
    }
  }
}

function parseSite(value: string | undefined): Site {
  const site = SITES.find((candidate) => candidate === value);
  if (site === undefined) {
    throw new RangeError(`site must be one of ${SITES.join(', ')}`);
  }
  return site;
}

function parseCount(value: string | undefined): number {
  const count = Number.parseInt(value ?? '', 10);
  if (!Number.isSafeInteger(count) || count < 1 || count > 65_536) {
    throw new RangeError('containers must be an integer from 1 to 65536');
  }
  return count;
}

async function runCase(site: Site, containers: number): Promise<void> {
  const bytes = encodePortableShard(fullRunContainers(containers));
  const cardinality = getRoaringBitmap32().deserialize(bytes, true).size;
  const before = process.resourceUsage().maxRSS * 1024;
  let result: Outcome;
  try {
    result = await readSite(site, bytes);
  } catch (error) {
    const name = error instanceof Error ? error.constructor.name : typeof error;
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    const message = error instanceof Error ? error.message.slice(0, 160) : String(error);
    result = { outcome: 'threw', detail: `${name} ${code} ${message}`.trim(), resultSize: null };
  }
  const usage = process.memoryUsage();
  console.log(`EXPANSION_CASE ${JSON.stringify({
    site, containers, bitmapBytes: bytes.byteLength, cardinality, ...result,
    maxRssBytesBeforeRead: before, maxRssBytes: process.resourceUsage().maxRSS * 1024,
    heapUsedBytes: usage.heapUsed, arrayBuffersBytes: usage.arrayBuffers,
    heapLimitBytes: v8.getHeapStatistics().heap_size_limit,
  })}`);
}

function runSweep(heapMiB: number, site: Site, counts: readonly number[]): void {
  const script = fileURLToPath(import.meta.url);
  for (const containers of counts) {
    const child = spawnSync(process.execPath, [`--max-old-space-size=${String(heapMiB)}`, script, 'case', site, String(containers)], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });
    const line = child.stdout.split('\n').find((candidate) => candidate.startsWith('EXPANSION_CASE '));
    const stderrTail = child.stderr.split('\n').filter((entry) => entry.trim().length > 0).slice(0, 3).join(' | ').slice(0, 300);
    console.log(`EXPANSION_WITNESS ${JSON.stringify({
      heapMiB, site, containers, exitStatus: child.status, signal: child.signal,
      caseResult: line === undefined ? null : line.slice('EXPANSION_CASE '.length), stderrTail,
    })}`);
  }
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'case') {
  await runCase(parseSite(rest[0]), parseCount(rest[1]));
} else if (mode === 'sweep') {
  runSweep(parseCount(rest[0]), parseSite(rest[1]), rest.slice(2).map(parseCount));
} else {
  throw new RangeError('mode must be case or sweep');
}
