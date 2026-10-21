import { describe, expect, it, vi } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import type DotMint from '../../../../src/domain/crdt/DotMint.ts';
import openDotMint from '../../../../src/domain/services/openDotMint.ts';
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

function open(message: string, journal: PatchJournalPort | null, headSha: string | null = HEAD): Promise<DotMint> {
  return openDotMint({
    writerId: 'alice', commits: { showNode: async () => message }, codec: DEFAULT_COMMIT_MESSAGE_CODEC, journal, headSha,
  });
}

describe('openDotMint', () => {
  it('starts a new writer at counter 1', async () => {
    expect((await open(PATCH_MESSAGE, null, null)).peek()).toEqual(new Dot('alice', 1));
  });

  it('starts at counter 1 when the head is not a patch commit', async () => {
    expect((await open('plain commit', null)).peek()).toEqual(new Dot('alice', 1));
  });

  it('refuses to continue an existing writer without a patch journal', async () => {
    await expect(open(PATCH_MESSAGE, null)).rejects.toMatchObject({ code: 'E_MISSING_JOURNAL' });
  });

  it('continues above the head context and every add dot the head used', async () => {
    const head = new Patch({
      writer: 'alice', lamport: 3, context: { alice: 2, bob: 40 },
      ops: [new NodeAdd('n', new Dot('alice', 5)), new EdgeAdd({ from: 'n', to: 'm', label: 'l', dot: new Dot('alice', 6) })],
    });

    expect((await open(PATCH_MESSAGE, journalFor(head))).peek()).toEqual(new Dot('alice', 7));
  });

  it('ignores another writer\'s counters on a forked head', async () => {
    const head = new Patch({
      writer: 'origin', lamport: 3, context: { origin: 9 }, ops: [new NodeAdd('n', new Dot('origin', 9))],
    });

    expect((await open(PATCH_MESSAGE, journalFor(head))).peek()).toEqual(new Dot('alice', 1));
  });
});
