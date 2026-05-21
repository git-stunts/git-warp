import { describe, expect, it } from 'vitest';

import ContinuumArtifactAuthorityError from '../../../../src/domain/errors/ContinuumArtifactAuthorityError.ts';
import ContinuumArtifactAuthority from '../../../../src/domain/continuum/ContinuumArtifactAuthority.ts';
import ContinuumArtifactDescriptor from '../../../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumArtifactIngestionPolicy from '../../../../src/domain/continuum/ContinuumArtifactIngestionPolicy.ts';
import ContinuumFamilyId from '../../../../src/domain/continuum/ContinuumFamilyId.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

/** Builds a receipt-family descriptor for policy tests. */
function makeDescriptor(authority: string): ContinuumArtifactDescriptor {
  return new ContinuumArtifactDescriptor({
    familyId: 'receipt-family',
    sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
    generatedBy: 'wesley witness-continuum --scope receipt-family',
    artifactKind: 'continuum.family.fixture',
    authority,
    targets: ['typescript', 'echo'],
    version: '0.1.0',
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

  it('accepts every Continuum family id and compares ids by value', () => {
    const receipt = new ContinuumFamilyId('receipt-family');

    expect(receipt.equals(new ContinuumFamilyId('receipt-family'))).toBe(true);
    expect(receipt.equals(new ContinuumFamilyId('settlement-family'))).toBe(false);
    expect(new ContinuumFamilyId('neighborhood-core-family').toString()).toBe('neighborhood-core-family');
    expect(new ContinuumFamilyId('runtime-boundary-family').toString()).toBe('runtime-boundary-family');
  });

  it('rejects unknown family ids and authorities', () => {
    expect(() => new ContinuumFamilyId('not-a-family')).toThrow(WarpError);
    expect(() => new ContinuumArtifactAuthority('not-authority')).toThrow(WarpError);
  });

  it('constructs descriptors from runtime-backed carriers', () => {
    const descriptor = new ContinuumArtifactDescriptor({
      familyId: new ContinuumFamilyId('receipt-family'),
      sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
      generatedBy: 'wesley compile',
      artifactKind: 'wesley.realization.manifest.v1',
      authority: new ContinuumArtifactAuthority('generated-artifact'),
      targets: ['warp-ttd'],
      generatedLegs: ['warpTtd'],
      generatedFiles: ['manifest/schema.json'],
    });

    expect(descriptor.familyId.toString()).toBe('receipt-family');
    expect(descriptor.authority.toString()).toBe('generated-artifact');
    expect(descriptor.generatedLegs).toEqual(['warpTtd']);
    expect(descriptor.generatedFiles).toEqual(['manifest/schema.json']);
  });

  it('rejects invalid descriptor fields with WarpError', () => {
    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: '',
      generatedBy: 'wesley compile',
      artifactKind: 'wesley.realization.manifest.v1',
      authority: 'generated-artifact',
      targets: ['warp-ttd'],
    })).toThrow(WarpError);

    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
      generatedBy: 'wesley compile',
      artifactKind: 'wesley.realization.manifest.v1',
      authority: 'generated-artifact',
      targets: [],
    })).toThrow(WarpError);

    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
      generatedBy: 'wesley compile',
      artifactKind: 'wesley.realization.manifest.v1',
      authority: 'generated-artifact',
      targets: ['warp-ttd'],
      generatedLegs: [''],
    })).toThrow(WarpError);
  });

  it('rejects wrong runtime types even when JavaScript bypasses TypeScript', () => {
    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      // @ts-expect-error runtime guard for JS callers
      sourceSchemaPath: 7,
      generatedBy: 'wesley compile',
      artifactKind: 'wesley.realization.manifest.v1',
      authority: 'generated-artifact',
      targets: ['warp-ttd'],
    })).toThrow(WarpError);

    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
      generatedBy: 'wesley compile',
      artifactKind: 'wesley.realization.manifest.v1',
      authority: 'generated-artifact',
      // @ts-expect-error runtime guard for JS callers
      targets: 'warp-ttd',
    })).toThrow(WarpError);

    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
      generatedBy: 'wesley compile',
      artifactKind: 'wesley.realization.manifest.v1',
      authority: 'generated-artifact',
      targets: ['warp-ttd'],
      // @ts-expect-error runtime guard for JS callers
      generatedFiles: 'manifest/schema.json',
    })).toThrow(WarpError);

    // @ts-expect-error runtime guard for JS callers
    expect(() => new ContinuumFamilyId(null)).toThrow(WarpError);
    // @ts-expect-error runtime guard for JS callers
    expect(() => new ContinuumArtifactAuthority(null)).toThrow(WarpError);
  });
});
