import AllocationFloor from '../crdt/AllocationFloor.ts';
import DotMint from '../crdt/DotMint.ts';
import VersionVector from '../crdt/VersionVector.ts';
import PatchError from '../errors/PatchError.ts';
import EdgeAdd from '../types/ops/EdgeAdd.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import type AllocationFloorStorePort from '../../ports/AllocationFloorStorePort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type { NodeInfo } from '../../ports/CommitPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type StoredAllocationFloor from '../crdt/StoredAllocationFloor.ts';
import type Patch from '../types/Patch.ts';

const FLOOR_ATTEMPTS = 3;

type DotMintRequest = Readonly<{
  writerId: string;
  commits: { showNode(sha: string): Promise<string>; getNodeInfo(sha: string): Promise<NodeInfo> };
  codec: CommitMessageCodecPort;
  journal: PatchJournalPort | null | undefined;
  headSha: string | null;
  floors: AllocationFloorStorePort | null | undefined;
}>;

/**
 * Opens the dot mint for a writer chain at `headSha`.
 *
 * The mint starts above the writer's allocation floor (#1021): every counter
 * the chain has used, not only the head's. Chains written before #1013 could
 * reset their counter, so a head can sit below counters used earlier. The
 * floor is computed by walking the chain back to the head a stored floor
 * already covers (to the root when none does) and is then stored again.
 * Without a floor store the whole chain is walked on every open.
 *
 * The chain is read by SHA because a forked chain's first head belongs to
 * another writer.
 */
export default async function openDotMint(request: DotMintRequest): Promise<DotMint> {
  const floors = request.floors ?? null;
  for (let attempt = 0; attempt < FLOOR_ATTEMPTS; attempt += 1) {
    const stored = floors === null ? null : await floors.read(request.writerId);
    const floor = await floorAt(request, stored);
    // A lost race may hide a reservation, so the floor is recomputed.
    if (await publishFloor(floors, floor, stored)) {
      return DotMint.after(request.writerId, floor.counter);
    }
  }
  throw contended(request.writerId);
}

/**
 * Reserves the next counter for `writerId` without carrying it on an add,
 * and persists the reservation before returning it. A caller that crashes
 * after this wastes the counter; it is never issued again.
 */
export async function reserveAllocation(request: DotMintRequest): Promise<number> {
  const floors = request.floors ?? null;
  if (floors === null) {
    throw new PatchError('An allocation floor store is required to reserve a counter', {
      code: 'E_ALLOCATION_FLOOR_REQUIRED',
      context: { writerId: request.writerId },
    });
  }
  for (let attempt = 0; attempt < FLOOR_ATTEMPTS; attempt += 1) {
    const stored = await floors.read(request.writerId);
    const floor = await floorAt(request, stored);
    const reserved = floor.counter + 1;
    if (await floors.publish(floor.advancedTo(reserved, floor.coveredHead), stored)) {
      return reserved;
    }
  }
  throw contended(request.writerId);
}

/** Mints above every dot `writerId` used in already-loaded patches. */
export function dotMintAfterPatches(writerId: string, patches: Iterable<{ readonly patch: Patch }>): DotMint {
  let issued = 0;
  for (const { patch } of patches) { issued = Math.max(issued, highWaterMark(patch, writerId)); }
  return DotMint.after(writerId, issued);
}

async function floorAt(request: DotMintRequest, stored: StoredAllocationFloor | null): Promise<AllocationFloor> {
  const base = stored === null ? new AllocationFloor(request.writerId, 0, null) : stored.floor;
  const { headSha } = request;
  if (headSha === null || headSha === base.coveredHead) { return base; }
  return base.advancedTo(await usedSince(request, headSha, base.coveredHead), headSha);
}

/** Highest counter `writerId` used from `headSha` back to (not including) `coveredHead`. */
async function usedSince(request: DotMintRequest, headSha: string, coveredHead: string | null): Promise<number> {
  let used = 0;
  let sha: string | null = headSha;
  while (sha !== null && sha !== coveredHead) {
    const message = await request.commits.showNode(sha);
    if (request.codec.detectKind(message) === 'patch') {
      const patch = await requireJournal(request.journal).readPatch(request.codec.decodePatch(message));
      used = Math.max(used, highWaterMark(patch, request.writerId));
    }
    sha = (await request.commits.getNodeInfo(sha)).parents[0] ?? null;
  }
  return used;
}

async function publishFloor(
  floors: AllocationFloorStorePort | null,
  floor: AllocationFloor,
  stored: StoredAllocationFloor | null,
): Promise<boolean> {
  if (floors === null || sameFloor(stored, floor)) { return true; }
  return await floors.publish(floor, stored);
}

function sameFloor(stored: StoredAllocationFloor | null, floor: AllocationFloor): boolean {
  return stored !== null && stored.floor.counter === floor.counter && stored.floor.coveredHead === floor.coveredHead;
}

function contended(writerId: string): PatchError {
  return new PatchError('Allocation floor kept changing under concurrent publishers', {
    code: 'E_ALLOCATION_FLOOR_CONTENDED',
    context: { writerId, attempts: FLOOR_ATTEMPTS },
  });
}

function requireJournal(journal: PatchJournalPort | null | undefined): PatchJournalPort {
  if (journal === null || journal === undefined) {
    throw new PatchError('A patch journal is required to continue an existing writer', { code: 'E_MISSING_JOURNAL' });
  }
  return journal;
}

function highWaterMark(patch: Patch, writerId: string): number {
  let issued = VersionVector.from(patch.context).get(writerId) ?? 0;
  for (const op of patch.ops) {
    issued = Math.max(issued, ownAddCounter(op, writerId));
  }
  return issued;
}

function ownAddCounter(op: Patch['ops'][number], writerId: string): number {
  if (!(op instanceof NodeAdd || op instanceof EdgeAdd)) { return 0; }
  return op.dot.writerId === writerId ? op.dot.counter : 0;
}
