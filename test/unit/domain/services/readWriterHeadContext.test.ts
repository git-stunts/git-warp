import { describe, expect, it, vi } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import readWriterHeadContext from '../../../../src/domain/services/readWriterHeadContext.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC, encodePatchMessage } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import PatchJournalPort from '../../../../src/ports/PatchJournalPort.ts';

const HEAD = 'a'.repeat(40);
const PATCH_MESSAGE = encodePatchMessage({ graph: 'g', writer: 'alice', lamport: 3, patchOid: 'b'.repeat(40), schema: 2 });

function journalFor(patch: Patch): PatchJournalPort {
  return Object.assign(Object.create(PatchJournalPort.prototype), { readPatch: vi.fn(async () => patch) });
}

function read(message: string, journal: PatchJournalPort | null, headSha: string | null = HEAD): Promise<VersionVector> {
  return readWriterHeadContext({
    commits: { showNode: async () => message }, codec: DEFAULT_COMMIT_MESSAGE_CODEC, journal, headSha,
  });
}

describe('readWriterHeadContext', () => {
  it('starts empty for a writer with no head', async () => {
    expect(VersionVector.serialize(await read(PATCH_MESSAGE, null, null))).toEqual({});
  });

  it('starts empty when the head is not a patch commit', async () => {
    expect(VersionVector.serialize(await read('plain commit', null))).toEqual({});
  });

  it('refuses to continue an existing writer without a patch journal', async () => {
    await expect(read(PATCH_MESSAGE, null)).rejects.toMatchObject({ code: 'E_MISSING_JOURNAL' });
  });

  it('adopts the head context and every add dot the head used', async () => {
    const head = new Patch({
      writer: 'alice', lamport: 3, context: { alice: 2, bob: 4 },
      ops: [new NodeAdd('n', new Dot('alice', 5)), new EdgeAdd({ from: 'n', to: 'm', label: 'l', dot: new Dot('alice', 6) })],
    });

    expect(VersionVector.serialize(await read(PATCH_MESSAGE, journalFor(head)))).toEqual({ alice: 6, bob: 4 });
  });

  it('reads a head written by another writer, as after a fork', async () => {
    const head = new Patch({ writer: 'origin', lamport: 3, context: { origin: 9 }, ops: [] });

    expect(VersionVector.serialize(await read(PATCH_MESSAGE, journalFor(head)))).toEqual({ origin: 9 });
  });
});
