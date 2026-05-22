import { describe, expect, it } from 'vitest';

import ContinuumArtifactDescriptor from '../../../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumEvidenceClaim from '../../../../src/domain/continuum/ContinuumEvidenceClaim.ts';
import ContinuumReceiptFamilyProjection from '../../../../src/domain/continuum/ContinuumReceiptFamilyProjection.ts';
import GitWarpReceiptSourceFacts from '../../../../src/domain/continuum/GitWarpReceiptSourceFacts.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import { DeliveryObservation } from '../../../../src/domain/types/DeliveryObservation.ts';
import { TickReceipt } from '../../../../src/domain/types/TickReceipt.ts';

const RECEIPT_SCHEMA_PATH = 'schemas/continuum-receipt-family.graphql';
const CONTINUUM_FIXTURE_KIND = 'continuum.family.fixture';
const AUTHORITY_GENERATED_FIXTURE = 'generated-fixture';

function makeDescriptor(fields: {
  readonly familyId?: string;
  readonly authority?: string;
  readonly witnessScope?: string;
} = {}): ContinuumArtifactDescriptor {
  return new ContinuumArtifactDescriptor({
    familyId: fields.familyId ?? 'receipt-family',
    sourceSchemaPath: RECEIPT_SCHEMA_PATH,
    generatedBy: 'wesley witness-continuum --scope receipt-family',
    artifactKind: CONTINUUM_FIXTURE_KIND,
    authority: fields.authority ?? AUTHORITY_GENERATED_FIXTURE,
    targets: ['typescript', 'warp-ttd'],
    version: '0.1.0',
    witnessScope: fields.witnessScope ?? 'receipt-family',
  });
}

function makeEvidence(fields: {
  readonly descriptor?: ContinuumArtifactDescriptor;
  readonly posture?: string;
} = {}): ContinuumEvidenceClaim {
  return new ContinuumEvidenceClaim({
    descriptor: fields.descriptor ?? makeDescriptor(),
    posture: fields.posture ?? 'translated-git-warp-evidence',
    ...(fields.posture === 'native-continuum-evidence' ? { nativeWitnessProof: 'continuum-native-proof:test' } : {}),
  });
}

function makeReceipt(fields: {
  readonly ops?: ConstructorParameters<typeof TickReceipt>[0]['ops'];
} = {}): TickReceipt {
  return new TickReceipt({
    patchSha: 'c'.repeat(40),
    writer: 'writer-a',
    lamport: 7,
    ops: fields.ops ?? [{
      op: 'NodeAdd',
      target: 'node:a',
      result: 'applied',
    }],
  });
}

function makeDeliveryObservation(): DeliveryObservation {
  return new DeliveryObservation({
    emissionId: 'effect:1',
    sinkId: 'sink:test',
    outcome: 'delivered',
    timestamp: 12,
    lens: {
      mode: 'live',
      suppressExternal: false,
    },
  });
}

function firstReceipt(projection: ContinuumReceiptFamilyProjection) {
  const receipt = projection.receipts[0];
  if (receipt === undefined) {
    expect.fail('projection must contain one receipt');
  }
  return receipt;
}

function firstWitness(projection: ContinuumReceiptFamilyProjection) {
  const witness = projection.witnesses[0];
  if (witness === undefined) {
    expect.fail('projection must contain one witness');
  }
  return witness;
}

describe('ContinuumReceiptFamilyProjection', () => {
  it('projects git-warp receipt facts into generated receipt-family shape with translated evidence', () => {
    const sourceFacts = new GitWarpReceiptSourceFacts({
      tickReceipt: makeReceipt(),
      deliveryObservations: [makeDeliveryObservation()],
    });
    const projection = new ContinuumReceiptFamilyProjection({
      evidence: makeEvidence(),
      sourceFacts,
    });

    const receipt = firstReceipt(projection);
    const witness = firstWitness(projection);
    expect(projection.familyId.toString()).toBe('receipt-family');
    expect(projection.evidence.isTranslatedGitWarpEvidence()).toBe(true);
    expect(receipt.patchSha).toBe('c'.repeat(40));
    expect(receipt.writer).toBe('writer-a');
    expect(receipt.lamport).toBe(7);
    expect(receipt.ops).toEqual([{
      op: 'NodeAdd',
      target: 'node:a',
      result: 'applied',
    }]);
    expect(witness.kind).toBe('git-warp-tick-receipt');
    expect(witness.receiptPatchSha).toBe('c'.repeat(40));
    expect(witness.evidencePosture).toBe('translated-git-warp-evidence');
    expect(projection.deliveryObservations).toEqual([{
      emissionId: 'effect:1',
      sinkId: 'sink:test',
      outcome: 'delivered',
      timestamp: 12,
      lens: {
        mode: 'live',
        suppressExternal: false,
      },
    }]);
  });

  it('rejects projection without generated receipt-family descriptor authority', () => {
    const evidence = makeEvidence({
      descriptor: makeDescriptor({ authority: 'local-mirror' }),
    });
    const sourceFacts = new GitWarpReceiptSourceFacts({ tickReceipt: makeReceipt() });

    expect(() => new ContinuumReceiptFamilyProjection({ evidence, sourceFacts })).toThrow(WarpError);
  });

  it('rejects projection against the wrong Continuum family descriptor', () => {
    const evidence = makeEvidence({
      descriptor: makeDescriptor({ familyId: 'settlement-family', witnessScope: 'settlement-family' }),
    });
    const sourceFacts = new GitWarpReceiptSourceFacts({ tickReceipt: makeReceipt() });

    expect(() => new ContinuumReceiptFamilyProjection({ evidence, sourceFacts })).toThrow(WarpError);
  });

  it('rejects projection without translated git-warp evidence posture', () => {
    const evidence = makeEvidence({ posture: 'native-continuum-evidence' });
    const sourceFacts = new GitWarpReceiptSourceFacts({ tickReceipt: makeReceipt() });

    expect(() => new ContinuumReceiptFamilyProjection({ evidence, sourceFacts })).toThrow(WarpError);
  });

  it('rejects receipt source facts missing operation outcomes', () => {
    expect(() => new GitWarpReceiptSourceFacts({
      tickReceipt: makeReceipt({ ops: [] }),
    })).toThrow(WarpError);
  });

  it('rejects missing source fact carriers at runtime', () => {
    expect(() => new ContinuumReceiptFamilyProjection(
      // @ts-expect-error runtime guard for JavaScript callers
      undefined,
    )).toThrow(WarpError);

    expect(() => new ContinuumReceiptFamilyProjection({
      evidence: makeEvidence(),
      // @ts-expect-error runtime guard for JavaScript callers
      sourceFacts: undefined,
    })).toThrow(WarpError);

    expect(() => new GitWarpReceiptSourceFacts({
      // @ts-expect-error runtime guard for JavaScript callers
      tickReceipt: undefined,
    })).toThrow(WarpError);
  });
});
