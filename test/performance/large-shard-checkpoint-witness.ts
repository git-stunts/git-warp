// Checkpoints index shards above the default 5 MiB CBOR read bound and reads them back (#1159).
//
// `property`: a real runtime (in-memory storage) writes one node with three 2 MiB
// properties, checkpoints it, and reads each property back through the checkpoint optic.
// The node's property shard is about 6 MiB. Before #1159 the checkpoint stored it and the
// read refused it with E_CBOR_DECODE_BOUNDS.
// `hubs`: two hubs whose ids share a shard key, each with <neighbours> neighbours, written
// through the index store with the options that checkpoints use, then loaded back with
// LogicalIndexReader.loadFromStorePaths, which checkpoint liveness reads use. The full
// runtime checkpoint of this graph needs more than the 4 GiB data budget.
// Prints one LARGE_SHARD_WITNESS line.
//   node test/performance/large-shard-checkpoint-witness.ts property
//   node test/performance/large-shard-checkpoint-witness.ts hubs <neighbours per hub>
import process from 'node:process';
import { installDefaultRuntimeHostNodePorts } from '../../src/application/RuntimeHostNodeDefaults.ts';
import { INDEX_SHARD_LIMITS } from '../../src/domain/materialization/IndexShardLimits.ts';
import { MAX_MATERIALIZATION_INDEX_SHARDS } from '../../src/domain/materialization/MaterializationIndexProfile.ts';
import LogicalBitmapIndexBuilder from '../../src/domain/services/index/LogicalBitmapIndexBuilder.ts';
import LogicalIndexReader from '../../src/domain/services/index/LogicalIndexReader.ts';
import WarpStream from '../../src/domain/stream/WarpStream.ts';
import computeShardKey from '../../src/domain/utils/shardKey.ts';
import { CborIndexStoreAdapter } from '../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../helpers/InMemoryGraphAdapter.ts';
import ManualClock from '../helpers/ManualClock.ts';
import { openMemoryRuntimeHostProduct } from '../helpers/MemoryRuntimeHost.ts';

const VALUE_BYTES = 2 * 1024 * 1024;
const PROPERTIES = 3;

function failureOf(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  return `${'code' in error ? String(error.code) : error.name} ${error.message.slice(0, 160)}`;
}

async function propertyWitness(): Promise<object> {
  installDefaultRuntimeHostNodePorts();
  const graph = await openMemoryRuntimeHostProduct({
    persistence: new InMemoryGraphAdapter(),
    graphName: 'large-shard-witness',
    writerId: 'witness',
    clock: new ManualClock(),
  });
  await graph.patch((patch) => {
    patch.addNode('node:large');
  });
  for (let index = 0; index < PROPERTIES; index += 1) {
    await graph.patch((patch) => {
      patch.setProperty('node:large', `p${String(index)}`, String(index).repeat(VALUE_BYTES));
    });
  }
  await graph.materialize();
  await graph.createCheckpoint();
  const reads: string[] = [];
  for (let index = 0; index < PROPERTIES; index += 1) {
    reads.push(await graph.worldline().optic().node('node:large').prop(`p${String(index)}`).read().then(
      (result) => `read ${String(typeof result.value === 'string' ? result.value.length : result.value)} characters`,
      failureOf,
    ));
  }
  return { mode: 'property', propertyBytes: PROPERTIES * VALUE_BYTES, reads };
}

function hubsInOneShard(count: number): string[] {
  const shardKey = computeShardKey('hub-0');
  const hubs: string[] = [];
  for (let candidate = 0; hubs.length < count; candidate += 1) {
    if (computeShardKey(`hub-${String(candidate)}`) === shardKey) {
      hubs.push(`hub-${String(candidate)}`);
    }
  }
  return hubs;
}

function hubIndex(hubs: readonly string[], neighbours: number): LogicalBitmapIndexBuilder {
  const builder = new LogicalBitmapIndexBuilder();
  const nodes = Array.from({ length: neighbours }, (_unused, index) => `node:${index.toString().padStart(8, '0')}`);
  for (const node of [...nodes, ...hubs].sort()) {
    builder.registerNode(node);
    builder.markAlive(node);
  }
  builder.registerLabel('links');
  for (const hub of hubs) {
    for (const node of nodes) {
      builder.addEdge(hub, node, 'links');
    }
  }
  return builder;
}

async function hubsWitness(neighbours: number): Promise<object> {
  const hubs = hubsInOneShard(2);
  const shards = [...hubIndex(hubs, neighbours).yieldShards()];
  const cas = new InMemoryGitCasFacade({ history: new InMemoryGraphAdapter(), storage: new InMemoryBlobStorageAdapter() });
  const store = new CborIndexStoreAdapter({ codec: defaultCodec, assetStorage: new GitCasAssetStorageAdapter({ cas }), cas });
  const root = await store.writeShards(WarpStream.from(shards), {
    expectedShardCount: shards.length,
    memberStorage: 'page',
    maxShardCount: MAX_MATERIALIZATION_INDEX_SHARDS,
    maxShardBytes: INDEX_SHARD_LIMITS.maxBytes,
    structureLimits: INDEX_SHARD_LIMITS.structureLimits,
  });
  const paths = Object.keys(await store.readShardReferences(root));
  const forward = `fwd_${computeShardKey(hubs[0] ?? '')}.cbor`;
  const encoded = defaultCodec.encode(await store.decodeShardAt(root, forward, INDEX_SHARD_LIMITS)).byteLength;
  const reader = await new LogicalIndexReader({ indexStore: store }).loadFromStorePaths(root, paths).then(
    (loaded) => loaded.toLogicalIndex(),
    failureOf,
  );
  const neighboursRead = typeof reader === 'string'
    ? reader
    : hubs.map((hub) => reader.getEdges(hub, 'out').length);
  return { mode: 'hubs', hubs, neighbours, forwardShardBytes: encoded, neighboursRead };
}

const [mode, count] = process.argv.slice(2);
const result = mode === 'hubs' ? await hubsWitness(Number.parseInt(count ?? '', 10)) : await propertyWitness();
console.log(`LARGE_SHARD_WITNESS ${JSON.stringify({ ...result, maxRssBytes: process.resourceUsage().maxRSS * 1024 })}`);
