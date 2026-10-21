import AllocationFloor from '../../domain/crdt/AllocationFloor.ts';
import StoredAllocationFloor from '../../domain/crdt/StoredAllocationFloor.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import { buildAllocationFloorRef } from '../../domain/utils/RefLayout.ts';
import { textDecode, textEncode } from '../../domain/utils/bytes.ts';
import AllocationFloorStorePort from '../../ports/AllocationFloorStorePort.ts';

const FLOOR_HEADER = 'git-warp-allocation-floor';
const NO_HEAD = '-';
const SHA_PATTERN = /^[0-9a-f]{40,64}$/;
const COUNTER_PATTERN = /^(0|[1-9][0-9]*)$/;

type AllocationFloorHistory = {
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  readBlob(oid: string): Promise<Uint8Array>;
  readRef(ref: string): Promise<string | null>;
  writeBlob(content: Uint8Array | string): Promise<string>;
};

/**
 * Stores each writer's allocation floor as a small text blob at
 * `refs/warp/<graph>/allocation/<writer>`:
 *
 * ```text
 * git-warp-allocation-floor
 * writer: alice
 * counter: 100
 * head: <writer chain tip, or ->
 * ```
 */
export default class GitAllocationFloorStoreAdapter extends AllocationFloorStorePort {
  readonly #history: AllocationFloorHistory;
  readonly #graphName: string;

  constructor(options: { readonly history: AllocationFloorHistory; readonly graphName: string }) {
    super();
    this.#history = options.history;
    this.#graphName = options.graphName;
  }

  async read(writerId: string): Promise<StoredAllocationFloor | null> {
    const ref = buildAllocationFloorRef(this.#graphName, writerId);
    const oid = await this.#history.readRef(ref);
    if (oid === null) { return null; }
    const floor = decodeFloor(ref, textDecode(await this.#history.readBlob(oid)));
    if (floor.writerId !== writerId) {
      throw floorCorrupt(ref, `records writer '${floor.writerId}'`);
    }
    return new StoredAllocationFloor(floor, oid);
  }

  async publish(floor: AllocationFloor, expected: StoredAllocationFloor | null): Promise<boolean> {
    const ref = buildAllocationFloorRef(this.#graphName, floor.writerId);
    const oid = await this.#history.writeBlob(textEncode(encodeFloor(floor)));
    const expectedOid = expected === null ? null : expected.revision;
    if (oid === expectedOid) { return true; }
    try {
      await this.#history.compareAndSwapRef(ref, oid, expectedOid);
      return true;
    } catch (error) {
      const current = await this.#history.readRef(ref);
      if (current !== expectedOid) { return false; }
      throw error;
    }
  }
}

function encodeFloor(floor: AllocationFloor): string {
  return `${FLOOR_HEADER}\nwriter: ${floor.writerId}\ncounter: ${floor.counter}\nhead: ${floor.coveredHead ?? NO_HEAD}\n`;
}

function decodeFloor(ref: string, text: string): AllocationFloor {
  const lines = text.split('\n');
  if (lines.length !== 5 || lines[0] !== FLOOR_HEADER || lines[4] !== '') {
    throw floorCorrupt(ref, 'is not an allocation floor record');
  }
  const writerId = field(ref, lines[1], 'writer');
  return new AllocationFloor(writerId, decodeCounter(ref, field(ref, lines[2], 'counter')), decodeHead(ref, field(ref, lines[3], 'head')));
}

function decodeCounter(ref: string, text: string): number {
  if (!COUNTER_PATTERN.test(text)) { throw floorCorrupt(ref, `has counter '${text}'`); }
  return Number(text);
}

function decodeHead(ref: string, text: string): string | null {
  if (text === NO_HEAD) { return null; }
  if (!SHA_PATTERN.test(text)) { throw floorCorrupt(ref, `has head '${text}'`); }
  return text;
}

function field(ref: string, line: string | undefined, name: string): string {
  const prefix = `${name}: `;
  if (line === undefined || !line.startsWith(prefix)) {
    throw floorCorrupt(ref, `has no '${name}' field`);
  }
  return line.slice(prefix.length);
}

function floorCorrupt(ref: string, detail: string): WarpError {
  return new WarpError(`Allocation floor ${ref} ${detail}`, 'E_ALLOCATION_FLOOR_CORRUPT', {
    context: { ref },
  });
}
