import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalBitmapShard, { LIVENESS_INDEX } from '../../../../src/domain/retained/OrdinalBitmapShard.ts';
import OrdinalChunk from '../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionGeometry from '../../../../src/domain/retained/SelectionGeometry.ts';
import ConeRoot from '../../../../src/domain/services/cone/ConeRoot.ts';
import GitConeRecordStoreAdapter from '../../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import SequenceRandomPort from '../../../helpers/SequenceRandomPort.ts';

const directories: string[] = [];
const histories: GitTimelineHistoryAdapter[] = [];

afterEach(async () => {
  for (const history of histories.splice(0)) {
    await history.close();
  }
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixture(): Promise<{ plumbing: Plumbing; history: GitTimelineHistoryAdapter; store: GitConeRecordStoreAdapter }> {
  const directory = await mkdtemp(join(tmpdir(), 'cone-selection-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  histories.push(history);
  return { plumbing, history, store: new GitConeRecordStoreAdapter({ history, codec: new CborCodec(), random: new SequenceRandomPort() }) };
}

const chunkOf = (counter: number): OrdinalChunk =>
  OrdinalChunk.of(new GraphOrdinal({ kind: 'node', writerId: 'w1', counter }), SelectionGeometry.chunks());

describe('GitConeRecordStoreAdapter selection shards (#816)', () => {
  it('stores selection shards in their own family directory and reads them back', async () => {
    const { plumbing, store } = await fixture();
    const shard = new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(1), offsets: [1, 2, 300] });
    const root = await store.writeRecords(ConeRoot.empty(), [shard]);
    const paths = (await plumbing.execute({ args: ['ls-tree', '-r', '--name-only', root.revision()] })).trim().split('\n');
    expect(paths).toEqual([`s/${shard.key().route}`]);
    const read = (await store.readRecords(root, [shard.key()])).selectionShard(LIVENESS_INDEX, chunkOf(1));
    expect(read?.equals(shard)).toBe(true);
  });

  it('refuses a stored shard whose members are corrupt, naming the Roaring refusal', async () => {
    const { history, store } = await fixture();
    const shard = OrdinalBitmapShard.empty(LIVENESS_INDEX, chunkOf(1));
    const corrupt = new CborCodec().encode({ kind: 'selection', index: 'live', set: 'node', writer: 'w1', segment: 0, chunk: 0, members: new Uint8Array(9000) });
    const family = await history.writeTree([`100644 blob ${await history.writeBlob(corrupt)}\t${shard.key().route}`]);
    const root = ConeRoot.at(await history.writeTree([`040000 tree ${family}\ts`]));
    await expect(store.readRecords(root, [shard.key()]))
      .rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT', context: { decodeCode: 'E_ROARING_SHARD_TOO_LARGE' } });
  });
});
