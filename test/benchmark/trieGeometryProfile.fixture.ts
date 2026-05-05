import ORSet from "../../src/domain/crdt/ORSet.ts";
import { Dot } from "../../src/domain/crdt/Dot.ts";
import StateSession from "../../src/domain/orset/session/StateSession.ts";
import PageCache from "../../src/domain/orset/trie/PageCache.ts";
import TrieBranch from "../../src/domain/orset/trie/TrieBranch.ts";
import TrieGeometry from "../../src/domain/orset/trie/TrieGeometry.ts";
import TrieLeaf from "../../src/domain/orset/trie/TrieLeaf.ts";
import TrieStoreError from "../../src/domain/errors/TrieStoreError.ts";
import { encodeEdgeKey } from "../../src/domain/services/KeyCodec.ts";
import cborCodec from "../../src/infrastructure/codecs/CborCodec.ts";
import { InMemoryTrieStore } from "../helpers/trieHelpers.ts";
import { forceGC } from "./benchmarkUtils.ts";

export const TRIE_GEOMETRY_PROFILE_DEFAULT_SCALES = [
  1_000,
  10_000,
  100_000,
] as const;
export const TRIE_GEOMETRY_PROFILE_STRESS_SCALE = 1_000_000;
export const TRIE_GEOMETRY_PROFILE_VARIANTS = [
  {
    name: "f16-l64-c128",
    fanout: 16,
    nibbleBits: 4,
    leafCapacity: 64,
    leafFloor: 16,
    maxResident: 128,
  },
  {
    name: "f16-l32-c64",
    fanout: 16,
    nibbleBits: 4,
    leafCapacity: 32,
    leafFloor: 8,
    maxResident: 64,
  },
  {
    name: "f256-l64-c128",
    fanout: 256,
    nibbleBits: 8,
    leafCapacity: 64,
    leafFloor: 16,
    maxResident: 128,
  },
] as const;

type ProfileVariant = (typeof TRIE_GEOMETRY_PROFILE_VARIANTS)[number];

export type TrieGeometryProfileScenario = {
  readonly label: string;
  readonly totalEntries: number;
  readonly fanout: number;
  readonly nibbleBits: number;
  readonly leafCapacity: number;
  readonly leafFloor: number;
  readonly maxResident: number;
};

export type TrieGeometryProfileRow = {
  readonly label: string;
  readonly totalEntries: number;
  readonly fanout: number;
  readonly leafCapacity: number;
  readonly leafFloor: number;
  readonly maxResident: number;
  readonly trieBuildMs: number;
  readonly trieReadMs: number;
  readonly baselineBuildMs: number;
  readonly heapDeltaMb: number;
  readonly rssDeltaMb: number;
  readonly pageHitRatio: number;
  readonly pageFaultRate: number;
  readonly evictions: number;
  readonly writeCount: number;
  readonly maxDepth: number;
  readonly averageLeafOccupancy: number;
};

export type TrieGeometryProfileRecommendation = {
  readonly variantName: string;
  readonly fanout: number;
  readonly leafCapacity: number;
  readonly leafFloor: number;
  readonly maxResident: number;
  readonly testedScales: readonly number[];
  readonly rationale: string;
};

type MemorySnapshot = {
  readonly heapUsed: number;
  readonly rss: number;
};

type ScenarioRoots = {
  readonly nodeAliveRootOid: string | null;
  readonly edgeAliveRootOid: string | null;
};

type ScanCounts = {
  readonly nodes: number;
  readonly edges: number;
};

type TrieShapeMetrics = {
  readonly leafCount: number;
  readonly branchCount: number;
  readonly maxDepth: number;
  readonly leafOccupancies: readonly number[];
};

type PageCacheSummary = {
  readonly hitRatio: number;
  readonly faultRate: number;
  readonly evictions: number;
};

export function createTrieGeometryProfilePlan(args?: {
  readonly includeStress?: boolean;
}): TrieGeometryProfileScenario[] {
  const scales = [
    ...TRIE_GEOMETRY_PROFILE_DEFAULT_SCALES,
    ...(args?.includeStress === true ? [TRIE_GEOMETRY_PROFILE_STRESS_SCALE] : []),
  ];
  const scenarios: TrieGeometryProfileScenario[] = [];
  for (const totalEntries of scales) {
    for (const variant of TRIE_GEOMETRY_PROFILE_VARIANTS) {
      scenarios.push({
        label: `${variant.name}@${totalEntries}`,
        totalEntries,
        fanout: variant.fanout,
        nibbleBits: variant.nibbleBits,
        leafCapacity: variant.leafCapacity,
        leafFloor: variant.leafFloor,
        maxResident: variant.maxResident,
      });
    }
  }
  return scenarios;
}

export function recommendTrieGeometryProfile(
  rows: ReadonlyArray<TrieGeometryProfileRow>,
): TrieGeometryProfileRecommendation {
  const winner = recommendVariantAggregate(rows);
  if (winner === null) {
    throw new Error("cannot recommend trie profile from an empty row set");
  }
  return {
    variantName: winner.variantName,
    fanout: winner.fanout,
    leafCapacity: winner.leafCapacity,
    leafFloor: winner.leafFloor,
    maxResident: winner.maxResident,
    testedScales: winner.testedScales,
    rationale: formatRecommendationRationale(winner, rows),
  };
}

export function formatTrieGeometryProfileReport(args: {
  readonly recommendation: TrieGeometryProfileRecommendation;
  readonly rows: ReadonlyArray<TrieGeometryProfileRow>;
}): string {
  const lines = [
    "## Recommendation",
    "",
    `- Variant: \`${args.recommendation.variantName}\``,
    `- Fanout: \`${String(args.recommendation.fanout)}\``,
    `- Leaf capacity / floor: \`${String(args.recommendation.leafCapacity)} / ${String(args.recommendation.leafFloor)}\``,
    `- Page cache max resident: \`${String(args.recommendation.maxResident)}\``,
    `- Measured scales: \`${args.recommendation.testedScales.join(", ")}\``,
    `- Rationale: ${args.recommendation.rationale}`,
    "",
    "## Results",
    "",
    "| Scenario | Entries | Fanout | Leaf cap | Cache | Build ms | Read ms | ORSet ms | Heap Δ MB | RSS Δ MB | Hit ratio | Fault rate | Evictions | Writes | Max depth | Avg leaf occ |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const row of args.rows) {
    lines.push([
      `| ${row.label}`,
      `${row.totalEntries}`,
      `${row.fanout}`,
      `${row.leafCapacity}`,
      `${row.maxResident}`,
      `${row.trieBuildMs.toFixed(2)}`,
      `${row.trieReadMs.toFixed(2)}`,
      `${row.baselineBuildMs.toFixed(2)}`,
      `${row.heapDeltaMb.toFixed(2)}`,
      `${row.rssDeltaMb.toFixed(2)}`,
      `${row.pageHitRatio.toFixed(2)}`,
      `${row.pageFaultRate.toFixed(2)}`,
      `${row.evictions}`,
      `${row.writeCount}`,
      `${row.maxDepth}`,
      `${row.averageLeafOccupancy.toFixed(2)} |`,
    ].join(" | "));
  }

  return lines.join("\n");
}

export async function runTrieGeometryProfileScenario(
  scenario: TrieGeometryProfileScenario,
): Promise<TrieGeometryProfileRow> {
  const memoryBefore = snapshotMemory();
  const { baselineBuildMs } = await measureOrSetBaseline(scenario.totalEntries);
  const trieRun = await measureTrieScenario(scenario);
  const memoryAfter = snapshotMemory();

  return {
    label: scenario.label,
    totalEntries: scenario.totalEntries,
    fanout: scenario.fanout,
    leafCapacity: scenario.leafCapacity,
    leafFloor: scenario.leafFloor,
    maxResident: scenario.maxResident,
    trieBuildMs: trieRun.buildMs,
    trieReadMs: trieRun.readMs,
    baselineBuildMs,
    heapDeltaMb: toMegabytes(memoryAfter.heapUsed - memoryBefore.heapUsed),
    rssDeltaMb: toMegabytes(memoryAfter.rss - memoryBefore.rss),
    pageHitRatio: trieRun.cache.hitRatio,
    pageFaultRate: trieRun.cache.faultRate,
    evictions: trieRun.cache.evictions,
    writeCount: trieRun.writeCount,
    maxDepth: trieRun.shape.maxDepth,
    averageLeafOccupancy: average(trieRun.shape.leafOccupancies),
  };
}

async function measureOrSetBaseline(totalEntries: number): Promise<{
  readonly baselineBuildMs: number;
}> {
  forceGC();
  const start = performance.now();
  const nodeAlive = ORSet.empty();
  const edgeAlive = ORSet.empty();
  const counts = fixtureCounts(totalEntries);
  for (let index = 0; index < counts.nodeCount; index += 1) {
    nodeAlive.add(nodeId(index), Dot.create("bench", index + 1));
  }
  for (let index = 0; index < counts.edgeCount; index += 1) {
    edgeAlive.add(edgeKey(index, counts.nodeCount), Dot.create("bench", counts.nodeCount + index + 1));
  }
  void nodeAlive.elements();
  void edgeAlive.elements();
  return {
    baselineBuildMs: performance.now() - start,
  };
}

async function measureTrieScenario(
  scenario: TrieGeometryProfileScenario,
): Promise<{
  readonly buildMs: number;
  readonly readMs: number;
  readonly cache: PageCacheSummary;
  readonly writeCount: number;
  readonly shape: TrieShapeMetrics;
}> {
  const store = new InMemoryTrieStore();
  const geometry = createGeometry(scenario);
  const buildPageCache = new PageCache({ maxResident: scenario.maxResident });
  const buildSession = await openSession({
    store,
    geometry,
    pageCache: buildPageCache,
    roots: {
      nodeAliveRootOid: null,
      edgeAliveRootOid: null,
    },
  });
  const counts = fixtureCounts(scenario.totalEntries);

  forceGC();
  const buildStart = performance.now();
  for (let index = 0; index < counts.nodeCount; index += 1) {
    await buildSession.addNode(nodeId(index), Dot.create("bench", index + 1));
  }
  for (let index = 0; index < counts.edgeCount; index += 1) {
    await buildSession.addEdge(
      edgeKey(index, counts.nodeCount),
      Dot.create("bench", counts.nodeCount + index + 1),
    );
  }
  const roots = await buildSession.close();
  const buildMs = performance.now() - buildStart;

  const readPageCache = new PageCache({ maxResident: scenario.maxResident });
  const readSession = await openSession({
    store,
    geometry,
    pageCache: readPageCache,
    roots,
  });

  forceGC();
  const readStart = performance.now();
  const firstPass = await scanSession(readSession);
  const secondPass = await scanSession(readSession);
  const readMs = performance.now() - readStart;
  await readSession.close();

  if (firstPass.nodes !== counts.nodeCount || secondPass.nodes !== counts.nodeCount) {
    throw new Error(
      `node scan count mismatch for ${scenario.label}: expected=${String(counts.nodeCount)} first=${String(firstPass.nodes)} second=${String(secondPass.nodes)}`,
    );
  }
  if (firstPass.edges !== counts.edgeCount || secondPass.edges !== counts.edgeCount) {
    throw new Error(
      `edge scan count mismatch for ${scenario.label}: expected=${String(counts.edgeCount)} first=${String(firstPass.edges)} second=${String(secondPass.edges)}`,
    );
  }

  return {
    buildMs,
    readMs,
    cache: summarizePageCache(readPageCache),
    writeCount: store.writeCounts().leaf + store.writeCounts().branch,
    shape: await collectShapeMetrics(store, roots, geometry),
  };
}

function createGeometry(
  scenario: TrieGeometryProfileScenario,
): TrieGeometry {
  return new TrieGeometry({
    fanout: scenario.fanout,
    nibbleBits: scenario.nibbleBits,
    leafCapacity: scenario.leafCapacity,
    leafFloor: scenario.leafFloor,
  });
}

async function openSession(args: {
  readonly store: InMemoryTrieStore;
  readonly geometry: TrieGeometry;
  readonly pageCache: PageCache;
  readonly roots: ScenarioRoots;
}): Promise<StateSession> {
  return await StateSession.open({
    nodeAliveRootOid: args.roots.nodeAliveRootOid,
    edgeAliveRootOid: args.roots.edgeAliveRootOid,
    store: args.store,
    codec: cborCodec,
    geometry: args.geometry,
    pageCache: args.pageCache,
  });
}

async function scanSession(session: StateSession): Promise<ScanCounts> {
  let nodes = 0;
  for await (const _nodeId of session.scanNodes()) {
    nodes += 1;
  }
  let edges = 0;
  for await (const _edgeKey of session.scanEdges()) {
    edges += 1;
  }
  return { nodes, edges };
}

async function collectShapeMetrics(
  store: InMemoryTrieStore,
  roots: ScenarioRoots,
  geometry: TrieGeometry,
): Promise<TrieShapeMetrics> {
  const nodeShape = await collectShapeMetricsForRoot(
    store,
    roots.nodeAliveRootOid,
    geometry,
  );
  const edgeShape = await collectShapeMetricsForRoot(
    store,
    roots.edgeAliveRootOid,
    geometry,
  );
  return {
    leafCount: nodeShape.leafCount + edgeShape.leafCount,
    branchCount: nodeShape.branchCount + edgeShape.branchCount,
    maxDepth: Math.max(nodeShape.maxDepth, edgeShape.maxDepth),
    leafOccupancies: [
      ...nodeShape.leafOccupancies,
      ...edgeShape.leafOccupancies,
    ],
  };
}

async function collectShapeMetricsForRoot(
  store: InMemoryTrieStore,
  rootOid: string | null,
  geometry: TrieGeometry,
): Promise<TrieShapeMetrics> {
  if (rootOid === null) {
    return {
      leafCount: 0,
      branchCount: 0,
      maxDepth: 0,
      leafOccupancies: [],
    };
  }
  return await walkTrie(store, rootOid, geometry, 0);
}

async function walkTrie(
  store: InMemoryTrieStore,
  oid: string,
  geometry: TrieGeometry,
  depth: number,
): Promise<TrieShapeMetrics> {
  const page = await readPageAtOid(store, oid, geometry);
  if (page.kind === "leaf") {
    return {
      leafCount: 1,
      branchCount: 0,
      maxDepth: depth,
      leafOccupancies: [page.leaf.size()],
    };
  }

  let leafCount = 0;
  let branchCount = 1;
  let maxDepth = depth;
  const occupancies: number[] = [];
  const entries = [...page.branch.entries()];
  for (const [, childOid] of entries) {
    const child = await walkTrie(store, childOid, geometry, depth + 1);
    leafCount += child.leafCount;
    branchCount += child.branchCount;
    maxDepth = Math.max(maxDepth, child.maxDepth);
    occupancies.push(...child.leafOccupancies);
  }

  return {
    leafCount,
    branchCount,
    maxDepth,
    leafOccupancies: occupancies,
  };
}

async function readPageAtOid(
  store: InMemoryTrieStore,
  oid: string,
  geometry: TrieGeometry,
): Promise<
  | { readonly kind: "leaf"; readonly leaf: TrieLeaf }
  | { readonly kind: "branch"; readonly branch: TrieBranch }
> {
  try {
    const bytes = await store.readLeaf(oid);
    return {
      kind: "leaf",
      leaf: TrieLeaf.deserialize(bytes, geometry, cborCodec),
    };
  } catch (error) {
    if (!(error instanceof TrieStoreError) || error.code !== "E_TRIE_STORE_MISSING") {
      throw error;
    }
  }
  const entries = await store.readBranch(oid);
  return {
    kind: "branch",
    branch: new TrieBranch(entries, geometry),
  };
}

function summarizePageCache(pageCache: PageCache): PageCacheSummary {
  const stats = pageCache.stats();
  const total = stats.hits + stats.misses;
  if (total === 0) {
    return {
      hitRatio: 1,
      faultRate: 0,
      evictions: stats.evictions,
    };
  }
  return {
    hitRatio: stats.hits / total,
    faultRate: stats.misses / total,
    evictions: stats.evictions,
  };
}

function fixtureCounts(totalEntries: number): {
  readonly nodeCount: number;
  readonly edgeCount: number;
} {
  const nodeCount = Math.ceil(totalEntries / 2);
  return {
    nodeCount,
    edgeCount: totalEntries - nodeCount,
  };
}

function nodeId(index: number): string {
  return `node:${index}`;
}

function edgeKey(index: number, nodeCount: number): string {
  const from = nodeId(index % nodeCount);
  const to = nodeId((index + 1) % nodeCount);
  const label = index % 2 === 0 ? "follows" : "knows";
  return encodeEdgeKey(from, to, label);
}

function snapshotMemory(): MemorySnapshot {
  forceGC();
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    rss: usage.rss,
  };
}

function toMegabytes(bytes: number): number {
  return bytes / (1024 * 1024);
}

function average(values: ReadonlyArray<number>): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function scoreProfileRow(row: TrieGeometryProfileRow): number {
  return (
    row.trieBuildMs
    + row.trieReadMs
    + row.heapDeltaMb * 5
    + row.rssDeltaMb
    + row.pageFaultRate * 100
    + row.evictions * 0.1
    + row.maxDepth * 2
  );
}

type VariantAggregate = {
  readonly variantName: string;
  readonly fanout: number;
  readonly leafCapacity: number;
  readonly leafFloor: number;
  readonly maxResident: number;
  readonly testedScales: readonly number[];
  readonly rankTotal: number;
  readonly rawScoreTotal: number;
};

function recommendVariantAggregate(
  rows: ReadonlyArray<TrieGeometryProfileRow>,
): VariantAggregate | null {
  if (rows.length === 0) {
    return null;
  }

  const scales = [...new Set(rows.map((row) => row.totalEntries))].sort((left, right) => left - right);
  type MutableVariantAggregate = {
    fanout: number;
    leafCapacity: number;
    leafFloor: number;
    maxResident: number;
    testedScales: number[];
    rankTotal: number;
    rawScoreTotal: number;
  };
  const byVariant = new Map<string, MutableVariantAggregate>();

  for (const scale of scales) {
    const scaleRows = rows
      .filter((row) => row.totalEntries === scale)
      .map((row) => ({ row, score: scoreProfileRow(row) }))
      .sort((left, right) => left.score - right.score);

    for (const [index, entry] of scaleRows.entries()) {
      const { row, score } = entry;
      const variantName = variantNameOfRow(row);
      const current: MutableVariantAggregate = byVariant.get(variantName) ?? {
        fanout: row.fanout,
        leafCapacity: row.leafCapacity,
        leafFloor: row.leafFloor,
        maxResident: row.maxResident,
        testedScales: [],
        rankTotal: 0,
        rawScoreTotal: 0,
      };
      current.testedScales.push(scale);
      current.rankTotal += index;
      current.rawScoreTotal += score;
      byVariant.set(variantName, current);
    }
  }

  const ranked = [...byVariant.entries()]
    .map(([variantName, aggregate]) => ({
      variantName,
      fanout: aggregate.fanout,
      leafCapacity: aggregate.leafCapacity,
      leafFloor: aggregate.leafFloor,
      maxResident: aggregate.maxResident,
      testedScales: [...aggregate.testedScales].sort((left, right) => left - right),
      rankTotal: aggregate.rankTotal,
      rawScoreTotal: aggregate.rawScoreTotal,
    }))
    .sort((left, right) => {
      if (left.rankTotal !== right.rankTotal) {
        return left.rankTotal - right.rankTotal;
      }
      return left.rawScoreTotal - right.rawScoreTotal;
    });

  return ranked[0] ?? null;
}

function formatRecommendationRationale(
  winner: VariantAggregate,
  rows: ReadonlyArray<TrieGeometryProfileRow>,
): string {
  const parts = [
    `best average per-scale score across ${String(winner.testedScales.length)} measured scales`,
  ];

  const smallestLeafCapacity = Math.min(...rows.map((row) => row.leafCapacity));
  if (winner.leafCapacity > smallestLeafCapacity) {
    parts.push("avoids the split and eviction churn of the smaller-leaf variant");
  }

  const widestFanout = Math.max(...rows.map((row) => row.fanout));
  if (winner.fanout < widestFanout) {
    parts.push("avoids the write amplification of the widest-fanout variant");
  }

  return parts.join("; ");
}

function variantNameOfRow(row: TrieGeometryProfileRow): string {
  const atIndex = row.label.indexOf("@");
  return atIndex === -1 ? row.label : row.label.slice(0, atIndex);
}
