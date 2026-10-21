import { describe, expect, it } from 'vitest';

import DotRepairRecord from '../../../../src/domain/repair/DotRepairRecord.ts';
import { buildDotRepairRef, buildV21MigrationRecordRef } from '../../../../src/domain/utils/RefLayout.ts';
import { textEncode } from '../../../../src/domain/utils/bytes.ts';
import GitDotRepairStoreAdapter from '../../../../src/infrastructure/adapters/GitDotRepairStoreAdapter.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const STRAND = 'b'.repeat(64);
const RECORD = (dot: string) => new DotRepairRecord({
  repairId: 'e'.repeat(64), dot, policy: 'restore', targets: ['note:keep'], repairWriter: 'repair.alice', inputFrontier: { alice: 'a'.repeat(40) }, commits: ['c'.repeat(40)],
});

describe('GitDotRepairStoreAdapter (#1022)', () => {
  it('reads lane and strand collisions from the migration record, mapping strand names to ids', async () => {
    const history = new InMemoryGraphAdapter();
    await history.updateRef(buildV21MigrationRecordRef('g'), await history.writeBlob(textEncode(JSON.stringify({
      strands: [{ name: 'cleanup', strandId: STRAND }, { name: 'lost', strandId: null }],
      damage: { duplicateDots: [
        { scope: 'lane', identity: 'alice:1', sites: [{ sha: 's1', target: 'a' }, { sha: 's2', target: 'b' }] },
        { scope: 'strand:cleanup', identity: 'alice:1', sites: [{ sha: 's1', target: 'a' }, { sha: 's2', target: 'b' }] },
        { scope: 'strand:lost', identity: 'x:1', sites: [{ sha: 's3', target: 'c' }, { sha: 's4', target: 'd' }] },
      ] },
    }))));

    const collisions = await new GitDotRepairStoreAdapter({ history, graphName: 'g' }).collisions();

    expect(collisions.map((collision) => [collision.scope, collision.dot, collision.members])).toEqual([
      ['lane', 'alice:1', ['a', 'b']],
      [STRAND, 'alice:1', ['a', 'b']],
    ]);
  });

  it('has no collisions without a migration record, and writes each repair once', async () => {
    const history = new InMemoryGraphAdapter();
    const store = new GitDotRepairStoreAdapter({ history, graphName: 'g' });

    expect(await store.collisions()).toEqual([]);
    await store.writeRepair(RECORD('alice:1'));
    await store.writeRepair(RECORD('alice:9'));

    expect(await store.repairs()).toEqual([RECORD('alice:1')]);
    expect(await store.readRepair('d'.repeat(64))).toBeNull();
  });

  it('refuses a corrupt repair record', async () => {
    const history = new InMemoryGraphAdapter();
    await history.updateRef(buildDotRepairRef('g', 'e'.repeat(64)), await history.writeBlob(textEncode('{"dot": 1}')));

    await expect(new GitDotRepairStoreAdapter({ history, graphName: 'g' }).repairs())
      .rejects.toMatchObject({ code: 'E_DOT_REPAIR_RECORD_CORRUPT' });
  });
});
