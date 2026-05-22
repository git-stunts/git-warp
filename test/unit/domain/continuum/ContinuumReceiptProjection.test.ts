import { describe, expect, it } from 'vitest';
import ContinuumArtifactDescriptor from '../../../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumEvidenceStatus from '../../../../src/domain/continuum/ContinuumEvidenceStatus.ts';
import ContinuumFamilyId from '../../../../src/domain/continuum/ContinuumFamilyId.ts';
import ContinuumReceipt from '../../../../src/domain/continuum/ContinuumReceipt.ts';
import ContinuumReceiptProjector from '../../../../src/domain/continuum/ContinuumReceiptProjector.ts';
import { createTickReceipt, type TickReceipt } from '../../../../src/domain/types/TickReceipt.ts';

const PATCH_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SECOND_PATCH_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const WRITER_ID = 'writer-a';

function createReceiptDescriptor(): ContinuumArtifactDescriptor {
  return new ContinuumArtifactDescriptor({
    familyId: 'receipt-family',
    sourceSchemaPath: 'schemas/continuum-receipt-family.graphql',
    generatedBy: 'wesley witness-continuum --scope receipt-family',
    artifactKind: 'continuum.family.fixture',
    authority: 'generated-fixture',
    targets: ['warp-ttd', 'typescript'],
  });
}

function createSettlementDescriptor(): ContinuumArtifactDescriptor {
  return new ContinuumArtifactDescriptor({
    familyId: 'settlement-family',
    sourceSchemaPath: 'schemas/continuum-settlement-family.graphql',
    generatedBy: 'wesley witness-continuum --scope settlement-family',
    artifactKind: 'continuum.family.fixture',
    authority: 'generated-fixture',
    targets: ['warp-ttd', 'typescript'],
  });
}

function createReceipt(patchSha = PATCH_SHA, lamport = 7): TickReceipt {
  return createTickReceipt({
    patchSha,
    writer: WRITER_ID,
    lamport,
    ops: [
      { op: 'NodeAdd', target: 'node:a', result: 'applied' },
      { op: 'NodePropSet', target: 'node:a', result: 'redundant' },
      { op: 'EdgeAdd', target: 'node:a\0node:b\0rel', result: 'superseded' },
    ],
  });
}

function translatedEvidence(): ContinuumEvidenceStatus {
  return ContinuumEvidenceStatus.translatedGitWarp({
    basisRef: PATCH_SHA,
    summary: 'git-warp tick receipt projected into receipt-family shape',
  });
}

describe('ContinuumReceiptProjector', () => {
  it('maps TickReceipt into the Continuum receipt-family Receipt shape', () => {
    const receipt = new ContinuumReceiptProjector().projectTickReceipt(createReceipt());

    expect(receipt).toBeInstanceOf(ContinuumReceipt);
    expect(receipt.receiptId).toBe(`git-warp:receipt:${PATCH_SHA}`);
    expect(receipt.headId).toBe(PATCH_SHA);
    expect(receipt.frameIndex).toBe(7);
    expect(receipt.laneId).toBe(WRITER_ID);
    expect(receipt.writerId).toBe(WRITER_ID);
    expect(receipt.inputTick).toBe(6);
    expect(receipt.outputTick).toBe(7);
    expect(receipt.admittedRewriteCount).toBe(2);
    expect(receipt.rejectedRewriteCount).toBe(1);
    expect(receipt.counterfactualCount).toBe(0);
    expect(receipt.digest).toBe(PATCH_SHA);
    expect(receipt.summary).toContain('2 admitted');
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('wraps projected receipts with generated artifact authority and evidence status', () => {
    const artifact = createReceiptDescriptor();
    const evidence = translatedEvidence();
    const projection = new ContinuumReceiptProjector().projectTickReceipts({
      artifact,
      evidence,
      tickReceipts: [
        createReceipt(PATCH_SHA, 7),
        createReceipt(SECOND_PATCH_SHA, 8),
      ],
    });

    expect(projection.artifact).toBe(artifact);
    expect(projection.evidence).toBe(evidence);
    expect(projection.artifact.familyId.equals(new ContinuumFamilyId('receipt-family'))).toBe(true);
    expect(projection.evidence.isTranslatedSubstrate()).toBe(true);
    expect(projection.receipts).toHaveLength(2);
    expect(projection.receiptsForHead(PATCH_SHA)).toHaveLength(1);
    expect(projection.receiptsForHead(SECOND_PATCH_SHA, 8)).toHaveLength(1);
    expect(projection.receiptsForHead(SECOND_PATCH_SHA, 7)).toHaveLength(0);
  });

  it('rejects non-receipt-family artifacts', () => {
    expect(() => new ContinuumReceiptProjector().projectTickReceipts({
      artifact: createSettlementDescriptor(),
      evidence: translatedEvidence(),
      tickReceipts: [createReceipt()],
    })).toThrow('receipt-family');
  });
});
