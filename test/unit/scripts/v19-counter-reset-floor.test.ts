import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import {
  advanceLaneOnlyMarker,
  readV19PreWorldlineManifest,
  restoreV19PreWorldlineFixture,
  withFixtureHost,
} from '../../helpers/V19PreWorldlineFixture.ts';

const GRAPH = 'counter-reset';

/** Writes one node as alice without materializing first: the graph-first path. */
async function writeUnmaterialized(repository: string, subject: string): Promise<void> {
  await withFixtureHost(repository, GRAPH, 'alice', async (host) => {
    const builder = await host.createPatch();
    builder.addNode(subject);
    await builder.commit();
  });
}

async function aliceDotFor(repository: string, subject: string): Promise<number> {
  return await withFixtureHost(repository, GRAPH, 'reader', async (host) => {
    const counters = (await host.getWriterPatches('alice')).flatMap(({ patch }) => patch.ops
      .filter((op): op is NodeAdd => op instanceof NodeAdd && op.node === subject)
      .map((op) => op.dot.counter));
    expect(counters).toHaveLength(1);
    return counters[0] ?? 0;
  });
}

describe('allocation floor on the v19.1.0 counter-reset fixture (#1021)', () => {
  let repository: string | undefined;

  afterEach(async () => {
    if (repository !== undefined) {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it('mints above alice:100 although the reset head says alice -> 1, and stays above after a reopen', async () => {
    repository = await restoreV19PreWorldlineFixture(await readV19PreWorldlineManifest());
    advanceLaneOnlyMarker(repository, GRAPH);

    await writeUnmaterialized(repository, 'item:after-floor');
    await writeUnmaterialized(repository, 'item:after-reopen');

    expect(await aliceDotFor(repository, 'item:after-floor')).toBe(101);
    expect(await aliceDotFor(repository, 'item:after-reopen')).toBe(102);
  });
});
