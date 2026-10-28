import { expect, it } from 'vitest';
import WorldlineOptic from '../../../src/domain/services/optic/WorldlineOptic.ts';
import prepareStrandOpticBasis from '../../../src/domain/WarpWorldlineStrandOptic.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';

it('prepares a strand optic over its pinned base frontier, and refuses an unknown strand', async () => {
  const graph = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(), graphName: 'events', writerId: 'app' });
  await graph.patch((patch) => { patch.addNode('n'); });
  await graph.materialize();
  const checkpointSha = await graph.createCheckpoint();
  await graph.createStrand({ strandId: 'draft', owner: 'app' });
  await graph.createStrand({ strandId: 'support', owner: 'app' });
  await graph.patchStrand('support', (patch) => { patch.setProperty('n', 'held', true); });
  await graph.braidStrand('draft', { braidedStrandIds: ['support'] });
  const basis = await prepareStrandOpticBasis(graph, 'draft', checkpointSha);
  expect(basis.checkpointSha).toBe(checkpointSha);
  expect(basis.optic).toBeInstanceOf(WorldlineOptic);
  expect(basis.frontierEntries.length).toBeGreaterThan(1);
  await expect(prepareStrandOpticBasis(graph, 'missing', checkpointSha))
    .rejects.toMatchObject({ code: 'E_WARP_WORLDLINE_STRAND_UNAVAILABLE' });
});
