import { describe, expect, it } from 'vitest';

import ContinuumArtifactAuthorityError from '../../../../src/domain/errors/ContinuumArtifactAuthorityError.ts';
import ContinuumArtifactDescriptor from '../../../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumArtifactIngestionPolicy from '../../../../src/domain/continuum/ContinuumArtifactIngestionPolicy.ts';
import ContinuumFamilyId from '../../../../src/domain/continuum/ContinuumFamilyId.ts';

/** Builds a receipt-family descriptor for policy tests. */
function makeDescriptor(authority: string): ContinuumArtifactDescriptor {
  return new ContinuumArtifactDescriptor({
    familyId: 'receipt-family',
    version: '0.1.0',
    sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
    generatedBy: 'wesley witness-continuum --scope receipt-family',
    artifactKind: 'continuum.family.fixture',
    authority,
    targets: ['typescript', 'echo'],
    witnessScope: 'receipt-family',
  });
}

describe('ContinuumArtifactIngestionPolicy', () => {
  it('accepts documented generated fixtures', () => {
    const descriptor = makeDescriptor('generated-fixture');
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(policy.ingest(descriptor)).toBe(descriptor);
  });

  it('accepts generated artifacts', () => {
    const descriptor = makeDescriptor('generated-artifact');
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(policy.ingest(descriptor)).toBe(descriptor);
  });

  it('rejects local mirrors as family authority', () => {
    const descriptor = makeDescriptor('local-mirror');
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(() => policy.ingest(descriptor)).toThrow(ContinuumArtifactAuthorityError);
  });

  it('rejects handwritten mirrors as family authority', () => {
    const descriptor = makeDescriptor('handwritten-mirror');
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(() => policy.ingest(descriptor)).toThrow(ContinuumArtifactAuthorityError);
  });

  it('keeps family ids runtime-backed', () => {
    const descriptor = makeDescriptor('generated-fixture');

    expect(descriptor.familyId).toBeInstanceOf(ContinuumFamilyId);
    expect(descriptor.familyId.toString()).toBe('receipt-family');
  });
});
