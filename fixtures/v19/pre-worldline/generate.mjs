// Generates the v19.1.0 pre-worldline fixture repository.
//
// Usage: node generate.mjs <v19.1.0-worktree> <empty-target-directory>
//
// The worktree must be a built checkout of the v19.1.0 release tag
// (`git worktree add --detach <dir> v19.1.0 && npm ci && npm run build`).
// Every import below resolves into that release's own `dist`, so the
// history is authored by released code, not by the current source tree.
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { git, openRelease, pinFixtureClock } from './release.mjs';

const [releaseArg, targetArg] = process.argv.slice(2);
if (releaseArg === undefined || targetArg === undefined) {
  throw new Error('usage: node generate.mjs <v19.1.0-worktree> <empty-target>');
}
const release = resolve(releaseArg);
const target = resolve(targetArg);

mkdirSync(target, { recursive: true });
if (readdirSync(target).length > 0) {
  throw new Error(`${target} must be empty`);
}
pinFixtureClock();
git(target, ['init', '-q', '--initial-branch=fixture']);

const { intent, withRuntime, withHost } = await openRelease(release, target);

// golden: two writers on one lane, a forked strand settled back into the
// lane. Each writer keeps one lane handle, so no dot is minted twice.
await withRuntime('alice', async (runtime) => {
  const lane = await runtime.lane('golden');
  await lane.write(intent.node.add({ subject: 'user:alice' }));
  await lane.write(intent.node.add({ subject: 'user:bob' }));
  await lane.write(intent.property.set({ subject: 'user:alice', key: 'role', value: 'admin' }));
  await lane.write(intent.edge.add({ from: 'user:alice', to: 'user:bob', label: 'knows' }));
  await lane.write(intent.entity.add({ subject: 'doc:readme', properties: { title: 'Read me' } }));
});
await withRuntime('bob', async (runtime) => {
  const lane = await runtime.lane('golden');
  await lane.write(intent.node.add({ subject: 'user:carol' }));
  await lane.write(intent.edge.add({ from: 'user:bob', to: 'user:carol', label: 'follows' }));
  await lane.write(intent.property.set({ subject: 'user:bob', key: 'role', value: 'editor' }));
});
await withRuntime('alice', async (runtime) => {
  const lane = await runtime.lane('golden');
  const strand = await runtime.fork(lane, { name: 'review' });
  await strand.write(intent.node.add({ subject: 'draft:1' }));
  await strand.write(intent.property.set({ subject: 'draft:1', key: 'status', value: 'ready' }));
  await strand.write(intent.edge.add({ from: 'draft:1', to: 'doc:readme', label: 'revises' }));
  const preview = await runtime.previewSettlement({ source: strand, target: lane });
  await runtime.settle(preview.plan);
});

// dot-reuse (known failure): v19.1.0 seeds each fresh lane handle from an
// empty version vector, so two sessions of one writer both mint (alice, 1).
for (const subject of ['note:first', 'note:second']) {
  await withRuntime('alice', async (runtime) => {
    const lane = await runtime.lane('dot-reuse');
    await lane.write(intent.node.add({ subject }));
  });
}

// dot-reuse-tombstone (known failure): the same reuse, then a remove of one
// node. Its observed dot is the shared (alice, 1), so the remove also hides
// the other node. The corruption is already in authoritative history.
for (const subject of ['note:keep', 'note:drop']) {
  await withRuntime('alice', async (runtime) => {
    const lane = await runtime.lane('dot-reuse-tombstone');
    await lane.write(intent.node.add({ subject }));
  });
}
await withHost('dot-reuse-tombstone', 'alice', async (host) => {
  await host.materialize();
  await host.patch((patch) => {
    patch.removeNode('note:drop');
  });
});

// counter-reset (known failure): 100 adds in one session, then a restarted
// session mints alice:1 again. The chain head's context says alice -> 1, so a
// mint seeded from the head alone would issue alice:2, which already exists
// (#1021). The migration must establish a floor of 100 from history.
await withRuntime('alice', async (runtime) => {
  const lane = await runtime.lane('counter-reset');
  for (let index = 1; index <= 100; index += 1) {
    await lane.write(intent.node.add({ subject: `item:${String(index).padStart(3, '0')}` }));
  }
});
await withRuntime('alice', async (runtime) => {
  const lane = await runtime.lane('counter-reset');
  await lane.write(intent.node.add({ subject: 'item:after-restart' }));
});

// collision-remove (edge case): lane writer `next` mints next:1. Alice forks
// strand `next`, whose overlay then mints next:2 and next:3 under the same
// legacy key. The strand's removes observe next:1 (a lane dot) and next:3
// (its own), so the migration must re-key by origin, not by string.
await withRuntime('next', async (runtime) => {
  const lane = await runtime.lane('collision-remove');
  await lane.write(intent.node.add({ subject: 'lane:1' }));
});
await withRuntime('alice', async (runtime) => {
  const lane = await runtime.lane('collision-remove');
  const strand = await runtime.fork(lane, { name: 'next' });
  await strand.write(intent.node.add({ subject: 'strand:1' }));
  await strand.write(intent.node.add({ subject: 'strand:2' }));
  await strand.write(intent.node.remove({ subject: 'lane:1' }));
  await strand.write(intent.node.remove({ subject: 'strand:2' }));
});

// dotted-ids (edge case): `.` is legal in v19 writer and strand ids and is
// also the sigil separator in `@w.<writer>`, so the codec must not split on it.
await withRuntime('ops.bot-1', async (runtime) => {
  const lane = await runtime.lane('dotted-ids');
  await lane.write(intent.node.add({ subject: 'job:1' }));
  const strand = await runtime.fork(lane, { name: 'rel.v2' });
  await strand.write(intent.node.add({ subject: 'job:2' }));
});

// strand-writer-collision (edge case): lane writer `next` and alice's strand
// `next` both mint dots under the writer id `next`.
await withRuntime('alice', async (runtime) => {
  const lane = await runtime.lane('collision');
  await lane.write(intent.node.add({ subject: 'base:1' }));
  const strand = await runtime.fork(lane, { name: 'next' });
  await strand.write(intent.node.add({ subject: 'strand:1' }));
  await strand.write(intent.node.add({ subject: 'strand:2' }));
});
await withRuntime('next', async (runtime) => {
  const lane = await runtime.lane('collision');
  await lane.write(intent.node.add({ subject: 'lane:1' }));
});

// ownerless-strand (known failure): the release's internal createStrand
// leaves `owner` null when the caller omits it.
await withHost('ownerless', 'alice', async (host) => {
  await host.patch((patch) => {
    patch.addNode('base:1');
  });
  await host.createStrand({ strandId: 'orphan' });
  await host.patchStrand('orphan', (patch) => {
    patch.addNode('orphan:1');
  });
});

// braided (edge case): strand `main-work` reads strand `support` through a
// braid pin. Both are owned by alice and remain unsettled.
await withHost('braided', 'alice', async (host) => {
  await host.patch((patch) => {
    patch.addNode('base:1');
  });
  await host.createStrand({ strandId: 'support', owner: 'alice' });
  await host.patchStrand('support', (patch) => {
    patch.addNode('support:1').setProperty('support:1', 'kind', 'evidence');
  });
  await host.createStrand({ strandId: 'main-work', owner: 'alice' });
  await host.patchStrand('main-work', (patch) => {
    patch.addNode('work:1').addEdge('work:1', 'support:1', 'cites');
  });
  await host.braidStrand('main-work', { braidedStrandIds: ['support'] });
});

process.stdout.write(`${git(target, ['for-each-ref', '--format=%(objectname) %(objecttype) %(refname)'])}\n`);
