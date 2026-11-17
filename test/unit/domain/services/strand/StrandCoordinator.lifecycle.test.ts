import { describe, expect, it } from 'vitest';

import { buildStrandRef, buildStrandsPrefix } from '../../../../../src/domain/utils/RefLayout.ts';
import type { ListRefsOptions } from '../../../../../src/ports/RefPort.ts';
import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';
import { openMemoryWarpCore } from '../../../../helpers/MemoryRuntimeHost.ts';

const GRAPH = 'strand-lifecycle';

/** A repository where another clone drops one strand just after this clone lists the strand refs. */
class ConcurrentDropRepository extends InMemoryGraphAdapter {
  private pendingDrop: string | null = null;

  dropAfterNextStrandListing(ref: string): void {
    this.pendingDrop = ref;
  }

  override async listRefs(prefix: string, options?: ListRefsOptions): Promise<string[]> {
    const refs = await super.listRefs(prefix, options);
    const drop = prefix === buildStrandsPrefix(GRAPH) ? this.pendingDrop : null;
    if (drop !== null) {
      this.pendingDrop = null;
      await this.deleteRef(drop);
    }
    return refs;
  }
}

async function open(persistence: InMemoryGraphAdapter) {
  return await openMemoryWarpCore({ persistence, graphName: GRAPH, writerId: 'alice' });
}

describe('StrandCoordinator lifecycle', () => {
  it('creates a new strand when the creation token names no earlier creation', async () => {
    const alice = await open(new InMemoryGraphAdapter());
    const first = await alice.createStrand({ name: 'first' });

    await alice.createStrand({ name: 'second', creationToken: first.genesis.occurrence + 1_000 });

    expect((await alice.listStrands()).map(({ name }) => name).sort()).toEqual(['first', 'second']);
  });

  it('renames a strand to the name it already has', async () => {
    const alice = await open(new InMemoryGraphAdapter());
    const { strandId } = await alice.createStrand({ name: 'draft' });

    const renamed = await alice.renameStrand('draft', 'draft');

    expect(renamed).toMatchObject({ strandId, name: 'draft' });
  });

  it('leaves out a strand that another clone drops while this clone lists strands', async () => {
    const persistence = new ConcurrentDropRepository();
    const alice = await open(persistence);
    const dropped = await alice.createStrand({ name: 'dropped' });
    await alice.createStrand({ name: 'kept' });
    persistence.dropAfterNextStrandListing(buildStrandRef(GRAPH, dropped.strandId));

    const listed = await alice.listStrands();

    expect(listed).toEqual([expect.objectContaining({ name: 'kept' })]);
  });

  it('refuses a braided strand reference that is not a string', async () => {
    const alice = await open(new InMemoryGraphAdapter());
    await alice.createStrand({ name: 'target' });

    await expect(alice.braidStrand('target', {
      // @ts-expect-error Exercise the JavaScript boundary with a braided reference that is not a string.
      braidedStrandIds: [42],
    })).rejects.toMatchObject({ code: 'E_STRAND_INVALID_ARGS' });
  });
});
