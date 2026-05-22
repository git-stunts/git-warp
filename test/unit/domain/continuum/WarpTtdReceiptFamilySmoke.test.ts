import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import ContinuumArtifactJsonFileAdapter, {
  type ContinuumArtifactJsonLoadContext,
} from '../../../../src/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.ts';
import ContinuumEvidenceStatus from '../../../../src/domain/continuum/ContinuumEvidenceStatus.ts';
import ContinuumReceiptProjector from '../../../../src/domain/continuum/ContinuumReceiptProjector.ts';
import { openRuntimeHostProduct } from '../../../../src/domain/warp/RuntimeHostProduct.ts';

const GRAPH_NAME = 'warp-ttd-receipt-smoke';
const WRITER_ID = 'writer-a';
const NODE_ID = 'node:warp-ttd';

const generatedFixturePath = fileURLToPath(
  new URL('../../../fixtures/continuum/receipt-family-generated-artifact.json', import.meta.url),
);

const generatedFixtureContext: ContinuumArtifactJsonLoadContext = {
  familyId: 'receipt-family',
  authority: 'generated-fixture',
  sourceSchemaPath: 'schemas/continuum-receipt-family.graphql',
  generatedBy: 'wesley witness-continuum --scope receipt-family',
  witnessScope: 'receipt-family',
  targets: ['warp-ttd', 'typescript'],
};

describe('warp-ttd receipt-family smoke', () => {
  it('reads live git-warp receipts as generated-family facts with participant evidence', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: GRAPH_NAME,
      writerId: WRITER_ID,
      autoMaterialize: true,
    });
    const artifact = await new ContinuumArtifactJsonFileAdapter().loadFile(
      generatedFixturePath,
      generatedFixtureContext,
    );
    expect(artifact.hasTarget('warp-ttd')).toBe(true);

    const patchSha = await graph.patch((patch) => {
      patch.addNode(NODE_ID).setProperty(NODE_ID, 'role', 'debug-target');
    });
    const materialized = await graph.materialize({ receipts: true });
    const evidence = ContinuumEvidenceStatus.gitWarpParticipant({
      basisRef: patchSha,
      summary: 'live git-warp receipt exposed as generated receipt-family facts for warp-ttd',
    });
    const projection = new ContinuumReceiptProjector().projectTickReceipts({
      artifact,
      evidence,
      tickReceipts: materialized.receipts,
    });

    const receiptFacts = projection.receiptsForHead(patchSha, 1);

    expect(projection.evidence.isParticipantRuntime()).toBe(true);
    expect(projection.evidence.isContinuumWitnessed()).toBe(false);
    expect(receiptFacts).toHaveLength(1);
    expect(receiptFacts[0]?.headId).toBe(patchSha);
    expect(receiptFacts[0]?.laneId).toBe(WRITER_ID);
    expect(receiptFacts[0]?.writerId).toBe(WRITER_ID);
    expect(receiptFacts[0]?.frameIndex).toBe(1);
    expect(receiptFacts[0]?.outputTick).toBe(1);
    expect(receiptFacts[0]?.admittedRewriteCount).toBeGreaterThan(0);
    expect(receiptFacts[0]?.digest).toBe(patchSha);
  });
});
