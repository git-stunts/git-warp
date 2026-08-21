import { describe, it, expect } from 'vitest';
import InMemoryGraphAdapter from '../../../../test/helpers/InMemoryGraphAdapter.ts';

/**
 * First-parent traversal contract for the in-memory persistence.
 *
 * `LogNodesOptions.firstParent` is a persistence contract, not a caller
 * convention: a conforming adapter must not emit a merge's side branch at all.
 * Verifying only that PatchDiscovery follows `parents[0]` would leave an
 * adapter free to stream side-parent commits and still pass.
 */

const RECORD_FORMAT = '%H%n%an <%ae>%n%aI%n%P%n%B';

/**
 * Extracts the SHA of each emitted commit record.
 *
 * Asserting on emitted commits rather than raw text matters: a merge record
 * legitimately names its side parent in the parents field even when that
 * commit is correctly excluded from the walk.
 */
function emittedShas(output: string): string[] {
  return output
    .split('\0')
    .filter((record) => record.length > 0)
    .map((record) => record.split('\n')[0] ?? '');
}

/**
 * Builds a merge DAG:
 *
 *   root <- mainline <- merge
 *   root <- side     <-'
 *
 * `merge` has parents [mainline, side]; `side` is reachable only as a second
 * parent, so first-parent traversal must never emit it.
 */
async function mergeDag(): Promise<{
  adapter: InMemoryGraphAdapter;
  shas: { root: string; mainline: string; side: string; merge: string };
}> {
  const adapter = new InMemoryGraphAdapter();
  const root = await adapter.commitNode({ message: 'root' });
  const mainline = await adapter.commitNode({ message: 'mainline', parents: [root] });
  const side = await adapter.commitNode({ message: 'side', parents: [root] });
  const merge = await adapter.commitNode({ message: 'merge', parents: [mainline, side] });
  await adapter.updateRef('refs/heads/main', merge);
  return { adapter, shas: { root, mainline, side, merge } };
}

async function drain(stream: AsyncIterable<string | Uint8Array>): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
  }
  return chunks.join('');
}

describe('InMemoryGraphAdapter stopAt range', () => {
  it('excludes the stopAt commit and its ancestors', async () => {
    const { adapter, shas } = await mergeDag();

    const emitted = emittedShas(
      await adapter.logNodes({
        ref: 'refs/heads/main',
        limit: 50,
        format: RECORD_FORMAT,
        firstParent: true,
        stopAt: shas.mainline,
      }),
    );

    expect(emitted).toContain(shas.merge);
    expect(emitted).not.toContain(shas.mainline);
    expect(emitted).not.toContain(shas.root);
  });

  it('excludes nothing when stopAt is not an ancestor', async () => {
    // `X..Y` excludes only what is reachable from X. A stopAt on an unrelated
    // branch must therefore leave Y's history intact — over-exclusion would
    // drop commits the caller still needs.
    const { adapter, shas } = await mergeDag();

    const emitted = emittedShas(
      await adapter.logNodes({
        ref: 'refs/heads/main',
        limit: 50,
        format: RECORD_FORMAT,
        firstParent: true,
        stopAt: shas.side,
      }),
    );

    expect(emitted).toContain(shas.merge);
    expect(emitted).toContain(shas.mainline);
    // `root` IS reachable from `side`, so it is correctly excluded.
    expect(emitted).not.toContain(shas.root);
  });

  it('emits the whole chain when stopAt is absent', async () => {
    const { adapter, shas } = await mergeDag();

    const emitted = emittedShas(
      await adapter.logNodes({ ref: 'refs/heads/main', limit: 50, format: RECORD_FORMAT, firstParent: true }),
    );

    expect(emitted).toEqual(expect.arrayContaining([shas.merge, shas.mainline, shas.root]));
  });
});

describe('InMemoryGraphAdapter first-parent traversal', () => {
  it('logNodes emits only the first-parent chain when firstParent is true', async () => {
    const { adapter, shas } = await mergeDag();

    const shasEmitted = emittedShas(
      await adapter.logNodes({ ref: 'refs/heads/main', limit: 50, format: RECORD_FORMAT, firstParent: true }),
    );

    expect(shasEmitted).toEqual(expect.arrayContaining([shas.merge, shas.mainline, shas.root]));
    expect(shasEmitted).not.toContain(shas.side);
  });

  it('logNodes emits the side parent by default', async () => {
    const { adapter, shas } = await mergeDag();

    const shasEmitted = emittedShas(
      await adapter.logNodes({ ref: 'refs/heads/main', limit: 50, format: RECORD_FORMAT }),
    );

    expect(shasEmitted).toContain(shas.side);
  });

  it('logNodesStream emits only the first-parent chain when firstParent is true', async () => {
    const { adapter, shas } = await mergeDag();

    const shasEmitted = emittedShas(
      await drain(
        await adapter.logNodesStream({
          ref: 'refs/heads/main',
          limit: 50,
          format: RECORD_FORMAT,
          firstParent: true,
        }),
      ),
    );

    expect(shasEmitted).toEqual(expect.arrayContaining([shas.merge, shas.mainline, shas.root]));
    expect(shasEmitted).not.toContain(shas.side);
  });

  it('logNodesStream emits the side parent by default', async () => {
    const { adapter, shas } = await mergeDag();

    const shasEmitted = emittedShas(
      await drain(
        await adapter.logNodesStream({ ref: 'refs/heads/main', limit: 50, format: RECORD_FORMAT }),
      ),
    );

    expect(shasEmitted).toContain(shas.side);
  });
});
