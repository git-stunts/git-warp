import { describe, expect, it } from 'vitest';
import AllocationFloor from '../../../../src/domain/crdt/AllocationFloor.ts';
import { textDecode, textEncode } from '../../../../src/domain/utils/bytes.ts';
import GitAllocationFloorStoreAdapter from '../../../../src/infrastructure/adapters/GitAllocationFloorStoreAdapter.ts';

const HEAD = 'c'.repeat(40);

class MemoryHistory {
  readonly refs = new Map<string, string>();
  readonly blobs = new Map<string, Uint8Array>();
  failNextSwap = false;

  async writeBlob(content: Uint8Array | string): Promise<string> {
    const bytes = typeof content === 'string' ? textEncode(content) : content;
    const oid = `blob-${textDecode(bytes).length}-${this.blobs.size}`;
    this.blobs.set(oid, bytes);
    return oid;
  }

  async readBlob(oid: string): Promise<Uint8Array> {
    const blob = this.blobs.get(oid);
    if (blob === undefined) { throw new Error(`missing ${oid}`); }
    return blob;
  }

  async readRef(ref: string): Promise<string | null> {
    return this.refs.get(ref) ?? null;
  }

  async compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void> {
    if (this.failNextSwap) {
      this.failNextSwap = false;
      throw new Error('transient');
    }
    if ((this.refs.get(ref) ?? null) !== expectedOid) { throw new Error('cas mismatch'); }
    this.refs.set(ref, newOid);
  }
}

function store(history: MemoryHistory): GitAllocationFloorStoreAdapter {
  return new GitAllocationFloorStoreAdapter({ history, graphName: 'events' });
}

describe('GitAllocationFloorStoreAdapter (#1021)', () => {
  it('stores a floor as a text blob under refs/warp/<graph>/allocation/<writer>', async () => {
    const history = new MemoryHistory();

    expect(await store(history).publish(new AllocationFloor('ops.bot-1', 100, HEAD), null)).toBe(true);

    const oid = history.refs.get('refs/warp/events/allocation/ops.bot-1');
    expect(textDecode(await history.readBlob(oid ?? ''))).toBe(
      `git-warp-allocation-floor\nwriter: ops.bot-1\ncounter: 100\nhead: ${HEAD}\n`,
    );
  });

  it('round-trips a floor with and without a covered head', async () => {
    const history = new MemoryHistory();
    const floors = store(history);

    await floors.publish(new AllocationFloor('alice', 4, null), null);
    const first = await floors.read('alice');
    expect(first?.floor).toEqual(new AllocationFloor('alice', 4, null));

    await floors.publish(new AllocationFloor('alice', 9, HEAD), first);
    expect((await floors.read('alice'))?.floor).toEqual(new AllocationFloor('alice', 9, HEAD));
    expect(await floors.read('bob')).toBeNull();
  });

  it('reports a lost race instead of overwriting a newer floor', async () => {
    const history = new MemoryHistory();
    const floors = store(history);
    await floors.publish(new AllocationFloor('alice', 4, null), null);

    expect(await floors.publish(new AllocationFloor('alice', 2, null), null)).toBe(false);
    expect((await floors.read('alice'))?.floor.counter).toBe(4);
  });

  it('rethrows a failed swap when the ref did not move', async () => {
    const history = new MemoryHistory();
    history.failNextSwap = true;

    await expect(store(history).publish(new AllocationFloor('alice', 1, null), null)).rejects.toThrow('transient');
  });

  it('refuses a corrupt or mismatched record', async () => {
    const history = new MemoryHistory();
    const ref = 'refs/warp/events/allocation/alice';
    const records = [
      'not a floor\n',
      'git-warp-allocation-floor\nwriter: alice\ncounter: -1\nhead: -\n',
      'git-warp-allocation-floor\nwriter: alice\ncounter: 1\nhead: nope\n',
      'git-warp-allocation-floor\nwriter: alice\ncount: 1\nhead: -\n',
      'git-warp-allocation-floor\nwriter: bob\ncounter: 1\nhead: -\n',
    ];
    for (const record of records) {
      history.refs.set(ref, await history.writeBlob(record));
      await expect(store(history).read('alice'), record).rejects.toMatchObject({ code: 'E_ALLOCATION_FLOOR_CORRUPT' });
    }
  });
});
