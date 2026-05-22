import { describe, expect, it } from 'vitest';

import ContinuumArtifactAuthorityError from '../../../../src/domain/errors/ContinuumArtifactAuthorityError.ts';
import ContinuumArtifactAuthority from '../../../../src/domain/continuum/ContinuumArtifactAuthority.ts';
import ContinuumArtifactDescriptor from '../../../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumArtifactIngestionPolicy from '../../../../src/domain/continuum/ContinuumArtifactIngestionPolicy.ts';
import ContinuumFamilyId from '../../../../src/domain/continuum/ContinuumFamilyId.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

const RECEIPT_SCHEMA_PATH = 'schemas/continuum-receipt-family.graphql';
const CONTINUUM_FIXTURE_KIND = 'continuum.family.fixture';
const WESLEY_REALIZATION_MANIFEST_KIND = 'wesley.realization.manifest.v1';
const AUTHORITY_GENERATED_FIXTURE = 'generated-fixture';
const AUTHORITY_GENERATED_ARTIFACT = 'generated-artifact';
const AUTHORITY_LOCAL_MIRROR = 'local-mirror';
const AUTHORITY_HANDWRITTEN_MIRROR = 'handwritten-mirror';

type DescriptorFixtureFields = {
  readonly artifactKind?: string;
  readonly authority?: string;
};

/** Builds a receipt-family descriptor for policy tests. */
function makeDescriptor(fields: DescriptorFixtureFields = {}): ContinuumArtifactDescriptor {
  return new ContinuumArtifactDescriptor({
    familyId: 'receipt-family',
    sourceSchemaPath: RECEIPT_SCHEMA_PATH,
    generatedBy: 'wesley witness-continuum --scope receipt-family',
    artifactKind: fields.artifactKind ?? CONTINUUM_FIXTURE_KIND,
    authority: fields.authority ?? AUTHORITY_GENERATED_FIXTURE,
    targets: ['typescript', 'echo'],
    version: '0.1.0',
    witnessScope: 'receipt-family',
  });
}

describe('ContinuumArtifactIngestionPolicy', () => {
  it('accepts documented generated fixtures', () => {
    const descriptor = makeDescriptor({ authority: AUTHORITY_GENERATED_FIXTURE });
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(policy.ingest(descriptor)).toBe(descriptor);
  });

  it('accepts generated artifacts', () => {
    const descriptor = makeDescriptor({
      artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
      authority: AUTHORITY_GENERATED_ARTIFACT,
    });
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(policy.ingest(descriptor)).toBe(descriptor);
  });

  it('rejects generated authority that does not match the descriptor kind', () => {
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(() => policy.ingest(makeDescriptor({
      artifactKind: CONTINUUM_FIXTURE_KIND,
      authority: AUTHORITY_GENERATED_ARTIFACT,
    }))).toThrow(ContinuumArtifactAuthorityError);

    expect(() => policy.ingest(makeDescriptor({
      artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
      authority: AUTHORITY_GENERATED_FIXTURE,
    }))).toThrow(ContinuumArtifactAuthorityError);
  });

  it('rejects generated authority for unknown artifact kinds', () => {
    const descriptor = makeDescriptor({
      artifactKind: 'continuum.unknown.fixture',
      authority: AUTHORITY_GENERATED_FIXTURE,
    });
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(() => policy.ingest(descriptor)).toThrow(ContinuumArtifactAuthorityError);
  });

  it('rejects local mirrors as family authority', () => {
    const descriptor = makeDescriptor({ authority: AUTHORITY_LOCAL_MIRROR });
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(() => policy.ingest(descriptor)).toThrow(ContinuumArtifactAuthorityError);
  });

  it('rejects handwritten mirrors as family authority', () => {
    const descriptor = makeDescriptor({ authority: AUTHORITY_HANDWRITTEN_MIRROR });
    const policy = new ContinuumArtifactIngestionPolicy();

    expect(() => policy.ingest(descriptor)).toThrow(ContinuumArtifactAuthorityError);
  });

  it('keeps family ids runtime-backed', () => {
    const descriptor = makeDescriptor({ authority: AUTHORITY_GENERATED_FIXTURE });

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
      sourceSchemaPath: RECEIPT_SCHEMA_PATH,
      generatedBy: 'wesley compile',
      artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
      authority: new ContinuumArtifactAuthority(AUTHORITY_GENERATED_ARTIFACT),
      targets: ['warp-ttd'],
      generatedLegs: ['warpTtd'],
      generatedFiles: ['manifest/schema.json'],
    });

    expect(descriptor.familyId.toString()).toBe('receipt-family');
    expect(descriptor.authority.toString()).toBe(AUTHORITY_GENERATED_ARTIFACT);
    expect(descriptor.generatedLegs).toEqual(['warpTtd']);
    expect(descriptor.generatedFiles).toEqual(['manifest/schema.json']);
  });

  it('rejects invalid descriptor fields with WarpError', () => {
    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: '',
      generatedBy: 'wesley compile',
      artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
      authority: AUTHORITY_GENERATED_ARTIFACT,
      targets: ['warp-ttd'],
    })).toThrow(WarpError);

    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: RECEIPT_SCHEMA_PATH,
      generatedBy: 'wesley compile',
      artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
      authority: AUTHORITY_GENERATED_ARTIFACT,
      targets: [],
    })).toThrow(WarpError);

    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: RECEIPT_SCHEMA_PATH,
      generatedBy: 'wesley compile',
      artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
      authority: AUTHORITY_GENERATED_ARTIFACT,
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
      artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
      authority: AUTHORITY_GENERATED_ARTIFACT,
      targets: ['warp-ttd'],
    })).toThrow(WarpError);

    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: RECEIPT_SCHEMA_PATH,
      generatedBy: 'wesley compile',
      artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
      authority: AUTHORITY_GENERATED_ARTIFACT,
      // @ts-expect-error runtime guard for JS callers
      targets: 'warp-ttd',
    })).toThrow(WarpError);

    expect(() => new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: RECEIPT_SCHEMA_PATH,
      generatedBy: 'wesley compile',
      artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
      authority: AUTHORITY_GENERATED_ARTIFACT,
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
