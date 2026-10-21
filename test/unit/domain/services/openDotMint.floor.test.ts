import { describe, expect, it } from 'vitest';
import AllocationFloor from '../../../../src/domain/crdt/AllocationFloor.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import StoredAllocationFloor from '../../../../src/domain/crdt/StoredAllocationFloor.ts';
import openDotMint, { reserveAllocation } from '../../../../src/domain/services/openDotMint.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC, encodePatchMessage } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import AllocationFloorStorePort from '../../../../src/ports/AllocationFloorStorePort.ts';
import type { NodeInfo } from '../../../../src/ports/CommitPort.ts';
import PatchJournalPort from '../../../../src/ports/PatchJournalPort.ts';
import type { PatchCommitMessage } from '../../../../src/ports/CommitMessageCodecPort.ts';

type Commit = { readonly message: string; readonly parent: string | null; readonly patch: Patch };

/** A linear writer chain: one patch per commit, each adding one node. */
class Chain {
  readonly commits = new Map<string, Commit>();
  readonly reads: string[] = [];
  head: string | null = null;

  add(counter: number, contextCounter: number = counter): string {
    const sha = (this.commits.size + 1).toString(16).padStart(40, '0');
    const patchOid = sha.replace(/^0/, 'f');
    const patch = new Patch({
      writer: 'alice', lamport: this.commits.size + 1, context: { alice: contextCounter },
      ops: [new NodeAdd(`n${this.commits.size}`, new Dot('alice', counter))],
    });
    const message = encodePatchMessage({ graph: 'g', writer: 'alice', lamport: patch.lamport, patchOid, schema: 2 });
    this.commits.set(sha, { message, parent: this.head, patch });
    this.head = sha;
    return sha;
  }

  commitPort(): { showNode(sha: string): Promise<string>; getNodeInfo(sha: string): Promise<NodeInfo> } {
    return {
      showNode: async (sha) => { this.reads.push(sha); return this.#commit(sha).message; },
      getNodeInfo: async (sha) => {
        const commit = this.#commit(sha);
        return { sha, message: commit.message, author: '', date: '', parents: commit.parent === null ? [] : [commit.parent] };
      },
    };
  }

  journal(): PatchJournalPort {
    const byLamport = new Map([...this.commits.values()].map((commit) => [commit.patch.lamport, commit.patch]));
    return Object.assign(Object.create(PatchJournalPort.prototype), {
      readPatch: async (message: PatchCommitMessage) => byLamport.get(message.lamport),
    });
  }

  #commit(sha: string): Commit {
    const commit = this.commits.get(sha);
    if (commit === undefined) { throw new Error(`no commit ${sha}`); }
    return commit;
  }
}

class MemoryFloors extends AllocationFloorStorePort {
  stored: StoredAllocationFloor | null = null;
  revisions = 0;
  /** Published by a competitor just before our next publish. */
  competitor: AllocationFloor | null = null;

  async read(): Promise<StoredAllocationFloor | null> {
    return this.stored;
  }

  async publish(floor: AllocationFloor, expected: StoredAllocationFloor | null): Promise<boolean> {
    if (this.competitor !== null) {
      this.#write(this.competitor);
      this.competitor = null;
    }
    if (this.stored !== expected) { return false; }
    this.#write(floor);
    return true;
  }

  #write(floor: AllocationFloor): void {
    this.revisions += 1;
    this.stored = new StoredAllocationFloor(floor, `rev-${this.revisions}`);
  }
}

function request(chain: Chain, floors: AllocationFloorStorePort | null) {
  return {
    writerId: 'alice', commits: chain.commitPort(), codec: DEFAULT_COMMIT_MESSAGE_CODEC,
    journal: chain.journal(), headSha: chain.head, floors,
  };
}

/** 100 adds, then a restarted session that minted alice:1 again (#1018 counter-reset). */
function counterReset(): Chain {
  const chain = new Chain();
  for (let counter = 1; counter <= 100; counter += 1) { chain.add(counter); }
  chain.add(1);
  return chain;
}

describe('openDotMint allocation floor (#1021)', () => {
  it('mints above every counter the chain used, not only the head', async () => {
    const mint = await openDotMint(request(counterReset(), null));

    expect(mint.peek()).toEqual(new Dot('alice', 101));
  });

  it('persists the floor and reuses it while the head is unchanged', async () => {
    const chain = counterReset();
    const floors = new MemoryFloors();

    await openDotMint(request(chain, floors));
    expect(floors.stored?.floor).toEqual(new AllocationFloor('alice', 100, chain.head));

    chain.reads.length = 0;
    expect((await openDotMint(request(chain, floors))).peek()).toEqual(new Dot('alice', 101));
    expect(chain.reads).toEqual([]);
  });

  it('walks only the commits a stored floor does not cover', async () => {
    const chain = counterReset();
    const floors = new MemoryFloors();
    await openDotMint(request(chain, floors));
    const covered = chain.head;
    const appended = chain.add(2, 2);

    chain.reads.length = 0;
    expect((await openDotMint(request(chain, floors))).peek()).toEqual(new Dot('alice', 101));
    expect(chain.reads).toEqual([appended]);
    expect(floors.stored?.floor.coveredHead).not.toBe(covered);
  });

  it('walks to the root when the stored floor covers a head outside the chain', async () => {
    const chain = counterReset();
    const floors = new MemoryFloors();
    floors.stored = new StoredAllocationFloor(new AllocationFloor('alice', 3, 'e'.repeat(40)), 'rev-0');

    expect((await openDotMint(request(chain, floors))).peek()).toEqual(new Dot('alice', 101));
    expect(chain.reads).toHaveLength(101);
  });

  it('re-reads after losing a publish race, so a reservation is never reissued', async () => {
    const chain = new Chain();
    chain.add(1);
    const floors = new MemoryFloors();
    floors.competitor = new AllocationFloor('alice', 7, chain.head);

    expect((await openDotMint(request(chain, floors))).peek()).toEqual(new Dot('alice', 8));
  });

  it('persists a reservation before returning it, and later mints stay above it', async () => {
    const chain = new Chain();
    chain.add(1);
    chain.add(2);
    const floors = new MemoryFloors();

    expect(await reserveAllocation(request(chain, floors))).toBe(3);
    expect(floors.stored?.floor.counter).toBe(3);
    expect(await reserveAllocation(request(chain, floors))).toBe(4);
    expect((await openDotMint(request(chain, floors))).peek()).toEqual(new Dot('alice', 5));
  });

  it('a reservation on a writer with no chain yet survives the first open', async () => {
    const chain = new Chain();
    const floors = new MemoryFloors();

    expect(await reserveAllocation(request(chain, floors))).toBe(1);
    expect((await openDotMint(request(chain, floors))).peek()).toEqual(new Dot('alice', 2));
  });

  it('refuses to reserve without a floor store', async () => {
    await expect(reserveAllocation(request(new Chain(), null)))
      .rejects.toMatchObject({ code: 'E_ALLOCATION_FLOOR_REQUIRED' });
  });

  it('gives up with a typed error when the floor keeps changing', async () => {
    const chain = new Chain();
    chain.add(1);
    const floors = new MemoryFloors();
    const contended = Object.assign(Object.create(AllocationFloorStorePort.prototype), {
      read: async () => floors.stored,
      publish: async () => false,
    });

    await expect(openDotMint(request(chain, contended))).rejects.toMatchObject({ code: 'E_ALLOCATION_FLOOR_CONTENDED' });
    await expect(reserveAllocation(request(chain, contended))).rejects.toMatchObject({ code: 'E_ALLOCATION_FLOOR_CONTENDED' });
  });
});
