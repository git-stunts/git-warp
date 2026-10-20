// Reads a generated fixture repository with the v19.1.0 release and prints
// what that release itself observes: every patch chain, every minted add dot,
// duplicate dots, strand descriptors, and visible lane and strand state.
//
// Usage: node census.mjs <v19.1.0-worktree> <repository>
//
// The output is the release-side evidence recorded in manifest.json. Run it
// against a scratch restore of the bundle; materialization may write caches.
import { resolve } from 'node:path';
import process from 'node:process';

import { git, openRelease } from './release.mjs';

const [releaseArg, repositoryArg] = process.argv.slice(2);
if (releaseArg === undefined || repositoryArg === undefined) {
  throw new Error('usage: node census.mjs <v19.1.0-worktree> <repository>');
}
const repository = resolve(repositoryArg);
const { withHost } = await openRelease(resolve(releaseArg), repository);

const refs = git(repository, ['for-each-ref', '--format=%(refname)', 'refs/warp/'])
  .split('\n')
  .map((refName) => refName.split('/'))
  .filter((parts) => parts.length >= 5);
const graphs = [...new Set(refs.map((parts) => parts[2]))].sort();
const census = {};
for (const graph of graphs) {
  const writers = idsUnder(graph, 'writers');
  const strandIds = idsUnder(graph, 'strands');
  census[graph] = await withHost(graph, 'fixture-census', async (host) => {
    const chains = [];
    for (const writerId of writers) {
      chains.push(describeChain(
        `refs/warp/${graph}/writers/${writerId}`,
        await host.getWriterPatches(writerId),
      ));
    }
    const strands = [];
    for (const strandId of strandIds) {
      const descriptor = await host.getStrand(strandId);
      chains.push(describeChain(
        `refs/warp/${graph}/strand-overlays/${strandId}`,
        await host.getStrandOverlayPatches(strandId),
      ));
      strands.push({
        strandId,
        owner: descriptor.owner,
        overlayId: descriptor.overlay.overlayId,
        overlayPatchCount: descriptor.overlay.patchCount,
        readOverlays: descriptor.braid.readOverlays.map((overlay) => overlay.strandId),
        visible: visibleState(await host.materializeStrand(strandId)),
      });
    }
    const laneState = await host.materialize();
    return {
      chains,
      duplicateDots: duplicateDots(chains),
      strands,
      visible: await withProperties(host, visibleState(laneState)),
    };
  });
}
process.stdout.write(`${JSON.stringify(census, null, 2)}\n`);

function idsUnder(graph, family) {
  return refs
    .filter((parts) => parts[2] === graph && parts[3] === family && parts.length === 5)
    .map((parts) => parts[4])
    .sort();
}

function describeChain(refName, entries) {
  return {
    refName,
    patches: entries.map(({ sha, patch }) => ({
      sha,
      writer: patch.writer,
      lamport: patch.lamport,
      adds: patch.ops.flatMap(describeAdd),
    })),
  };
}

function describeAdd(op) {
  if (op.type === 'NodeAdd') {
    return [{ type: op.type, target: op.node, dot: dotKey(op.dot) }];
  }
  if (op.type === 'EdgeAdd') {
    return [{ type: op.type, target: `${op.from}->${op.to}:${op.label}`, dot: dotKey(op.dot) }];
  }
  return [];
}

function dotKey(dot) {
  return `${dot.writerId}:${String(dot.counter)}`;
}

function duplicateDots(chains) {
  const sites = new Map();
  for (const chain of chains) {
    for (const patch of chain.patches) {
      for (const add of patch.adds) {
        const list = sites.get(add.dot) ?? [];
        list.push({ refName: chain.refName, sha: patch.sha, target: add.target });
        sites.set(add.dot, list);
      }
    }
  }
  return [...sites]
    .filter(([, list]) => list.length > 1)
    .map(([dot, list]) => ({ dot, sites: list }))
    .sort((left, right) => left.dot.localeCompare(right.dot));
}

function visibleState(state) {
  return {
    nodes: [...state.nodeAlive.elements()].sort(),
    edges: [...state.edgeAlive.elements()].map((edge) => edge.split('\0').join('|')).sort(),
  };
}

async function withProperties(host, visible) {
  const properties = {};
  for (const node of visible.nodes) {
    const bag = await host.getNodeProps(node);
    if (bag !== null && Object.keys(bag).length > 0) {
      properties[node] = bag;
    }
  }
  return { ...visible, properties };
}
