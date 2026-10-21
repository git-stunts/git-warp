import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import V21MigrationSession from '../../../scripts/v20-to-v21/V21MigrationSession.ts';
import { withFixtureHost } from '../../helpers/V19PreWorldlineFixture.ts';

const FIXTURE = resolve('fixtures/v20/late-writes');

type Manifest = Readonly<{
  release: Readonly<{ tag: string; commit: string }>;
  graph: string;
  bundlePath: string;
  bundleSha256: string;
  refs: readonly Readonly<{ refName: string; expectedHead: string; expectedObjectType: string }>[];
  outcome: Readonly<{
    lateLaneCommit: string;
    lateLaneNode: string;
    lateStrandNode: string;
    freshV20Open: Readonly<{ refused: boolean; code: string | null }>;
  }>;
}>;

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

describe('a real v20.0.0 process across the v21 migration boundary (#1015)', () => {
  let manifest: Manifest;
  let repository = '';

  beforeAll(async () => {
    manifest = JSON.parse(await readFile(join(FIXTURE, 'manifest.json'), 'utf8')) as Manifest;
    const bundle = join(FIXTURE, manifest.bundlePath);
    expect(createHash('sha256').update(await readFile(bundle)).digest('hex')).toBe(manifest.bundleSha256);
    repository = await mkdtemp(join(tmpdir(), 'git-warp-v20-late-writes-'));
    git(repository, ['init', '-q', '--initial-branch=fixture']);
    git(repository, ['fetch', '-q', bundle, 'refs/warp/*:refs/warp/*']);
    expect(git(repository, ['for-each-ref', '--format=%(refname) %(objectname) %(objecttype)', 'refs/']))
      .toBe(manifest.refs.map((ref) => `${ref.refName} ${ref.expectedHead} ${ref.expectedObjectType}`).join('\n'));
  });

  afterAll(async () => {
    if (repository.length > 0) { await rm(repository, { recursive: true, force: true }); }
  });

  it('was produced by v20.0.0, whose fresh open after migration was refused', () => {
    expect(manifest.release.tag).toBe('v20.0.0');
    expect(manifest.outcome.freshV20Open).toEqual({ refused: true, code: 'E_SUBSTRATE_VERSION_UNSUPPORTED' });
  });

  it('the late v20 lane write stays readable in v21', async () => {
    await withFixtureHost(repository, manifest.graph, 'reader', async (host) => {
      expect([...(await host.materialize()).nodeAlive.elements()].sort()).toEqual(['lane:1', manifest.outcome.lateLaneNode].sort());
    });
  });

  it('the late v20 strand write moved only legacy refs, which v21 never reads', async () => {
    await withFixtureHost(repository, manifest.graph, 'reader', async (host) => {
      expect([...(await host.materializeStrand('side')).nodeAlive.elements()].sort()).toEqual(['lane:1', 'side:1']);
    });
  });

  it('reports both late writes against the migration frontier', async () => {
    const session = await V21MigrationSession.open(repository);
    try {
      const report = await session.lateWrites(manifest.graph);
      expect(report?.lanes).toEqual([
        expect.objectContaining({ writerId: 'alice', commits: [manifest.outcome.lateLaneCommit], rewritten: false }),
      ]);
      expect(report?.strands.map((write) => write.ref).sort()).toEqual([
        `refs/warp/${manifest.graph}/strand-overlays/side`,
        `refs/warp/${manifest.graph}/strands/side`,
      ]);
    } finally {
      await session.close();
    }
  });

  it('a v21 write by alice mints above the late v20 commit', async () => {
    await withFixtureHost(repository, manifest.graph, 'alice', async (host) => {
      const lateCounters = (await host.getWriterPatches('alice')).flatMap(({ patch }) => patch.ops)
        .flatMap((op) => ('dot' in op && op.dot.writerId === 'alice' ? [op.dot.counter] : []));
      const builder = await host.createPatch();
      builder.addNode('after:v21');
      await builder.commit();
      const counter = (await host.getWriterPatches('alice')).flatMap(({ patch }) => patch.ops)
        .flatMap((op) => ('dot' in op && 'node' in op && op.node === 'after:v21' ? [op.dot.counter] : []));
      expect(counter[0]).toBeGreaterThan(Math.max(...lateCounters));
    });
  });
});
