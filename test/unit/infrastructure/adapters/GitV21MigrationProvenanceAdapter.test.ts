import { describe, expect, it } from 'vitest';

import { buildV21MigrationRecordRef } from '../../../../src/domain/utils/RefLayout.ts';
import { textEncode } from '../../../../src/domain/utils/bytes.ts';
import GitV21MigrationProvenanceAdapter from '../../../../src/infrastructure/adapters/GitV21MigrationProvenanceAdapter.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const COMMIT = 'c'.repeat(40);
const MINT = `@w.alice@s.${'a'.repeat(64)}`;

async function withRecord(record: string): Promise<GitV21MigrationProvenanceAdapter> {
  const history = new InMemoryGraphAdapter();
  await history.updateRef(buildV21MigrationRecordRef('events'), await history.writeBlob(textEncode(record)));
  return new GitV21MigrationProvenanceAdapter({ history, graphName: 'events' });
}

describe('GitV21MigrationProvenanceAdapter (#1015)', () => {
  it('returns the recorded outcome with the original bytes', async () => {
    const provenance = await withRecord(JSON.stringify({
      provenance: [
        { commit: COMMIT, operationIndex: 0, status: 'resolved', original: 'next:2', identity: `${MINT}:2`, candidates: [`${MINT}:2`] },
        { commit: COMMIT, operationIndex: 3, status: 'ambiguous', original: 'next:5', identity: null, candidates: [`${MINT}:5`, 'next:5'] },
      ],
    }));

    expect(await provenance.resolve(COMMIT, 0, 'next:2')).toMatchObject({ status: 'resolved', original: 'next:2', identity: `${MINT}:2` });
    expect(await provenance.resolve(COMMIT, 3, 'next:5')).toMatchObject({ status: 'ambiguous', identity: null, candidates: [`${MINT}:5`, 'next:5'] });
  });

  it('is unmapped for an unlisted occurrence, a mismatched original, or an unmigrated graph', async () => {
    const provenance = await withRecord(JSON.stringify({
      provenance: [{ commit: COMMIT, operationIndex: 0, status: 'resolved', original: 'next:2', identity: 'next:2', candidates: ['next:2'] }],
    }));
    const unmigrated = new GitV21MigrationProvenanceAdapter({ history: new InMemoryGraphAdapter(), graphName: 'events' });

    expect(await provenance.resolve(COMMIT, 1, 'next:2')).toMatchObject({ status: 'unmapped', original: 'next:2' });
    expect(await provenance.resolve(COMMIT, 0, 'next:3')).toMatchObject({ status: 'unmapped', original: 'next:3' });
    expect(await unmigrated.resolve(COMMIT, 0, 'alice:1')).toMatchObject({ status: 'unmapped', identity: null });
  });

  it('refuses a corrupt record instead of guessing', async () => {
    const provenance = await withRecord(JSON.stringify({ provenance: [{ commit: COMMIT, status: 'resolved' }] }));

    await expect(provenance.resolve(COMMIT, 0, 'next:2')).rejects.toMatchObject({ code: 'E_MIGRATION_RECORD_CORRUPT' });
  });
});
