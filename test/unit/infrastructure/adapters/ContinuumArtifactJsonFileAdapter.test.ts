import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

import ContinuumArtifactJsonFileAdapter from '../../../../src/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.ts';
import ContinuumArtifactAuthorityError from '../../../../src/domain/errors/ContinuumArtifactAuthorityError.ts';
import AdapterValidationError from '../../../../src/domain/errors/AdapterValidationError.ts';

const generatedFixtureJson = `{
  "familyId": "receipt-family",
  "version": "0.1.0",
  "sourceSchemaPath": "~/git/continuum/schemas/continuum-receipt-family.graphql",
  "generatedBy": "wesley witness-continuum --scope receipt-family",
  "artifactKind": "continuum.family.fixture",
  "authority": "generated-fixture",
  "targets": ["typescript", "echo"],
  "witnessScope": "receipt-family",
  "artifactDigest": "sha256:receipt-fixture"
}`;

const localMirrorJson = `{
  "familyId": "receipt-family",
  "version": "0.1.0",
  "sourceSchemaPath": "src/domain/continuum/local-receipt.ts",
  "generatedBy": "git-warp",
  "artifactKind": "continuum.family.fixture",
  "authority": "local-mirror",
  "targets": ["typescript"]
}`;

const generatedFixturePath = fileURLToPath(
  new URL('../../../fixtures/continuum/receipt-family-generated-artifact.json', import.meta.url),
);

describe('ContinuumArtifactJsonFileAdapter', () => {
  it('loads generated fixture descriptors', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();
    const descriptor = adapter.loadString(generatedFixtureJson);

    expect(descriptor.familyId.toString()).toBe('receipt-family');
    expect(descriptor.hasTarget('typescript')).toBe(true);
    expect(descriptor.hasGeneratedAuthority()).toBe(true);
    expect(descriptor.artifactDigest).toBe('sha256:receipt-fixture');
  });

  it('loads generated fixture descriptor files', async () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();
    const descriptor = await adapter.loadFile(generatedFixturePath);

    expect(descriptor.familyId.toString()).toBe('receipt-family');
    expect(descriptor.witnessScope).toBe('receipt-family');
  });

  it('rejects local mirrors before they become authority', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(() => adapter.loadString(localMirrorJson)).toThrow(ContinuumArtifactAuthorityError);
  });

  it('rejects malformed descriptor JSON', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(() => adapter.loadString('{ "familyId": "receipt-family" }')).toThrow(AdapterValidationError);
  });
});
