import { expect, it, vi } from 'vitest';
import { entityAdmissionsFromPatch } from '../../../../../src/domain/entity/EntityAdmissionPatchReader.ts';
import ConeAdmissionIndexer from '../../../../../src/domain/services/cone/ConeAdmissionIndexer.ts';
import ConeFoldSession from '../../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import { admissionPatch } from '../../../../helpers/entityAdmissionPatches.ts';

vi.mock('../../../../../src/domain/entity/EntityAdmissionPatchReader.ts', () => ({ entityAdmissionsFromPatch: vi.fn() }));

it('propagates an unexpected admission reader failure without indexing an unproven admission', async () => {
  const failure = new Error('admission reader invariant failed');
  vi.mocked(entityAdmissionsFromPatch).mockImplementation(() => { throw failure; });
  const store = new InMemoryConeRecordStore();
  const session = new ConeFoldSession({ store, root: ConeRoot.empty() });
  const entry = admissionPatch({ writer: 'writer', lamport: 1, sha: 'a'.repeat(40), entities: [{ subject: 'n' }], firstCounter: 1 });
  await expect(ConeAdmissionIndexer.index(session, entry)).rejects.toBe(failure);
  expect(store.recordReads).toBe(0);
  expect(store.recordWrites).toBe(0);
});
