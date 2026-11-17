// Checkpoints a graph whose hubs share one shard key, then reads every hub's neighbours
// back through the checkpoint optic, page by page (#1159).
//
// Two hubs of 654,322 neighbours in one shard key make a forward edge shard of 5,242,887
// bytes: above the default 5 MiB CBOR read bound, within the shared 16 MiB index-shard
// bound. Before #1159 the checkpoint stored it and the read refused it with
// E_CBOR_DECODE_BOUNDS. Prints one HUB_CHECKPOINT_WITNESS line.
// The graph lives in a real Git repository in the system temporary directory (run it in a
// container), because the in-memory CAS of the test helpers buffers an asset of at most 64 MiB.
//   node test/performance/hub-checkpoint-witness.ts <hubs in one shard key> <neighbours per hub>
import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import GitStorage from '../../src/application/GitStorage.ts';
import { resolveWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import { openRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import computeShardKey from '../../src/domain/utils/shardKey.ts';
import type { RuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import { installDefaultRuntimeHostNodePorts } from '../../src/application/RuntimeHostNodeDefaults.ts';
import ManualClock from '../helpers/ManualClock.ts';

const OPS_PER_PATCH = 10_000;
const PAGE_LIMIT = 1_000;
const LABEL = 'links';

type Outcome = Readonly<{ edgesRead: number; pages: number } | { failure: string }>;

function positive(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError('arguments must be positive integers');
  }
  return parsed;
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

function neighbourId(index: number): string {
  return `node:${index.toString().padStart(8, '0')}`;
}

function failureOf(error: Error): string {
  const code = 'code' in error ? String(error.code) : error.name;
  return `${code} ${error.message.slice(0, 160)}`;
}

async function main(): Promise<void> {
  const hubs = hubsInOneShard(positive(process.argv[2]));
  const neighbours = positive(process.argv[3]);
  installDefaultRuntimeHostNodePorts();
  const directory = await mkdtemp(join(tmpdir(), 'hub-checkpoint-witness-'));
  spawnSync('git', ['init', '--quiet', directory], { stdio: 'inherit' });
  const storage = await GitStorage.open({ cwd: directory });
  const binding = resolveWarpStorage(storage);
  const graph = await openRuntimeHostProduct({
    persistence: binding.history,
    runtimeStorage: binding.runtimeStorage,
    graphName: 'hub-checkpoint-witness',
    writerId: 'witness',
    clock: new ManualClock(),
  });
  const nodes = [...hubs, ...Array.from({ length: neighbours }, (_unused, index) => neighbourId(index))];
  for (let first = 0; first < nodes.length; first += OPS_PER_PATCH) {
    await graph.patch((patch) => {
      for (const node of nodes.slice(first, first + OPS_PER_PATCH)) {
        patch.addNode(node);
      }
    });
  }
  for (const hub of hubs) {
    for (let first = 0; first < neighbours; first += OPS_PER_PATCH) {
      await graph.patch((patch) => {
        for (let index = first; index < Math.min(first + OPS_PER_PATCH, neighbours); index += 1) {
          patch.addEdge(hub, neighbourId(index), LABEL);
        }
      });
    }
  }
  await graph.materialize();
  await graph.createCheckpoint();
  const outcomes: Record<string, Outcome> = {};
  for (const hub of hubs) {
    outcomes[hub] = await readAllNeighbours(graph, hub);
  }
  console.log(`HUB_CHECKPOINT_WITNESS ${JSON.stringify({
    hubs, neighbours, outcomes,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
  })}`);
  await storage.close();
}

async function readAllNeighbours(graph: RuntimeHostProduct, hub: string): Promise<Outcome> {
  let edgesRead = 0;
  let pages = 0;
  let cursor: string | null = null;
  try {
    do {
      const page = await graph.worldline().optic().neighborhood(hub).read({
        direction: 'out',
        limit: PAGE_LIMIT,
        ...(cursor === null ? {} : { cursor }),
      });
      edgesRead += page.edges.length;
      pages += 1;
      cursor = page.cursor;
    } while (cursor !== null);
    return { edgesRead, pages };
  } catch (error) {
    return { failure: error instanceof Error ? failureOf(error) : String(error) };
  }
}

await main();
