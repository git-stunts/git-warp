import { describe, expect, it } from 'vitest';

import PatchEntry from '../../../src/domain/artifacts/PatchEntry.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import { encodePatchMessage }
  from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import FixturePatchJournal from '../../helpers/FixturePatchJournal.ts';

const MERGE_SHA = 'a'.repeat(40);
const LEFT_SHA = 'b'.repeat(40);
const RIGHT_SHA = 'c'.repeat(40);
const MERGE_OID = '1'.repeat(40);
const LEFT_OID = '2'.repeat(40);

describe('FixturePatchJournal', () => {
  it('rejects non-linear commits through both history scan contracts', async () => {
    const journal = fixtureJournal();
    const scans = [
      journal.scanPatchHistory('writer-a', MERGE_SHA),
      journal.scanPatchRange('writer-a', null, MERGE_SHA),
    ];

    for (const scan of scans) {
      await expect(collect(scan)).rejects.toThrow(
        `Fixture history is non-linear: ${MERGE_SHA}`,
      );
    }
  });
});

function fixtureJournal(): FixturePatchJournal {
  return new FixturePatchJournal({
    commits: {
      [MERGE_SHA]: {
        message: patchMessage(2, MERGE_OID),
        parents: [LEFT_SHA, RIGHT_SHA],
      },
      [LEFT_SHA]: {
        message: patchMessage(1, LEFT_OID),
        parents: [],
      },
    },
    patches: {
      [MERGE_OID]: patch(2),
      [LEFT_OID]: patch(1),
    },
  });
}

function patchMessage(lamport: number, patchOid: string): string {
  return encodePatchMessage({
    graph: 'events',
    writer: 'writer-a',
    lamport,
    patchOid,
    schema: 2,
  });
}

function patch(lamport: number): Patch {
  return new Patch({
    writer: 'writer-a',
    lamport,
    context: {},
    ops: [],
  });
}

async function collect(source: AsyncIterable<PatchEntry>): Promise<PatchEntry[]> {
  const entries: PatchEntry[] = [];
  for await (const entry of source) {
    entries.push(entry);
  }
  return entries;
}
