import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

import ContinuumArtifactJsonFileAdapter, {
  type ContinuumArtifactJsonLoadContext,
} from '../../../../src/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.ts';
import AdapterValidationError from '../../../../src/domain/errors/AdapterValidationError.ts';

const generatedFixturePath = fileURLToPath(
  new URL('../../../fixtures/continuum/receipt-family-generated-artifact.json', import.meta.url),
);

const wesleyManifestPath = fileURLToPath(
  new URL('../../../fixtures/continuum/receipt-family-wesley-realization-manifest.json', import.meta.url),
);

const fixtureContext: ContinuumArtifactJsonLoadContext = {
  familyId: 'receipt-family',
  authority: 'generated-fixture',
  sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
  witnessScope: 'receipt-family',
  artifactDigest: 'sha256:receipt-fixture',
};

const artifactContext: ContinuumArtifactJsonLoadContext = {
  familyId: 'receipt-family',
  authority: 'generated-artifact',
  witnessScope: 'receipt-family',
};

const localMirrorContext: ContinuumArtifactJsonLoadContext = {
  familyId: 'receipt-family',
  authority: 'local-mirror',
  sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
};

const fixtureAsArtifactContext: ContinuumArtifactJsonLoadContext = {
  familyId: 'receipt-family',
  authority: 'generated-artifact',
  sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
};

const artifactAsFixtureContext: ContinuumArtifactJsonLoadContext = {
  familyId: 'receipt-family',
  authority: 'generated-fixture',
  witnessScope: 'receipt-family',
};

const selfAttestedFixtureJson = `{
  "objectTypes": ["Receipt"],
  "enumTypes": [],
  "ops": [
    {
      "name": "receipts",
      "resultType": "Receipt"
    }
  ],
  "invariants": [],
  "footprints": [],
  "authority": "generated-artifact"
}`;

const unknownFixtureFieldJson = `{
  "objectTypes": ["Receipt"],
  "enumTypes": [],
  "ops": [
    {
      "name": "receipts",
      "resultType": "Receipt"
    }
  ],
  "invariants": [],
  "footprints": [],
  "extra": "drift"
}`;

const invalidOperationJson = `{
  "objectTypes": ["Receipt"],
  "enumTypes": [],
  "ops": [
    {
      "name": 7,
      "resultType": "Receipt"
    }
  ],
  "invariants": [],
  "footprints": []
}`;

const fixtureWithoutFootprintsJson = `{
  "objectTypes": ["Receipt"],
  "enumTypes": [],
  "ops": [
    {
      "name": "receipts",
      "resultType": "Receipt"
    }
  ],
  "invariants": []
}`;

const emptyOperationsJson = `{
  "objectTypes": ["Receipt"],
  "enumTypes": [],
  "ops": [],
  "invariants": [],
  "footprints": []
}`;

const invalidFootprintsJson = `{
  "objectTypes": ["Receipt"],
  "enumTypes": [],
  "ops": [
    {
      "name": "receipts",
      "resultType": "Receipt"
    }
  ],
  "invariants": [],
  "footprints": "none"
}`;

const typeMapFixtureJson = `{
  "objectTypes": ["Receipt"],
  "enumTypes": [],
  "ops": [
    {
      "name": "receipts",
      "resultType": "Receipt"
    }
  ],
  "invariants": [],
  "footprints": [],
  "types": {
    "Receipt": ["receiptId"]
  }
}`;

const unsealedWesleyManifestJson = `{
  "kind": "wesley.realization.manifest.v1",
  "schemaPath": "schemas/continuum-receipt-family.graphql",
  "schemaHash": "hash",
  "sourceHash": "hash",
  "targets": ["warp-ttd"],
  "integrity": {
    "status": "open",
    "scope": "generated-leg-files",
    "hashAlgorithm": "sha256",
    "signatureAlgorithm": "hmac-sha256",
    "signatureKeyId": "fixture-key"
  },
  "generatedLegs": {}
}`;

const invalidWesleyArtifactCountJson = `{
  "kind": "wesley.realization.manifest.v1",
  "schemaPath": "schemas/continuum-receipt-family.graphql",
  "schemaHash": "hash",
  "sourceHash": "hash",
  "targets": ["warp-ttd"],
  "integrity": {
    "status": "sealed",
    "scope": "generated-leg-files",
    "hashAlgorithm": "sha256",
    "signatureAlgorithm": "hmac-sha256",
    "signatureKeyId": "fixture-key"
  },
  "generatedLegs": {
    "warpTtd": {
      "outDir": "dist/warp-ttd",
      "schemaHash": "hash",
      "sourceHash": "hash",
      "artifactCount": "one"
    }
  }
}`;

const wesleyManifestWithoutGeneratedFilesJson = `{
  "kind": "wesley.realization.manifest.v1",
  "schemaPath": "schemas/continuum-receipt-family.graphql",
  "schemaHash": "hash",
  "sourceHash": "hash",
  "targets": ["warp-ttd"],
  "integrity": {
    "status": "sealed",
    "scope": "generated-leg-files",
    "hashAlgorithm": "sha256",
    "signatureAlgorithm": "hmac-sha256",
    "signatureKeyId": "fixture-key"
  },
  "generatedLegs": {
    "warpTtd": {
      "outDir": "dist/warp-ttd",
      "schemaHash": "hash",
      "sourceHash": "hash",
      "artifactCount": 0
    }
  }
}`;

const invalidWesleyGeneratedFilesJson = `{
  "kind": "wesley.realization.manifest.v1",
  "schemaPath": "schemas/continuum-receipt-family.graphql",
  "schemaHash": "hash",
  "sourceHash": "hash",
  "targets": ["warp-ttd"],
  "integrity": {
    "status": "sealed",
    "scope": "generated-leg-files",
    "hashAlgorithm": "sha256",
    "signatureAlgorithm": "hmac-sha256",
    "signatureKeyId": "fixture-key"
  },
  "generatedLegs": {
    "warpTtd": {
      "outDir": "dist/warp-ttd",
      "schemaHash": "hash",
      "sourceHash": "hash",
      "files": "dist/warp-ttd/types.ts"
    }
  }
}`;

const invalidWesleyTargetsJson = `{
  "kind": "wesley.realization.manifest.v1",
  "schemaPath": "schemas/continuum-receipt-family.graphql",
  "schemaHash": "hash",
  "sourceHash": "hash",
  "targets": "warp-ttd",
  "integrity": {
    "status": "sealed",
    "scope": "generated-leg-files",
    "hashAlgorithm": "sha256",
    "signatureAlgorithm": "hmac-sha256",
    "signatureKeyId": "fixture-key"
  },
  "generatedLegs": {}
}`;

const invalidWesleyTargetEntryJson = `{
  "kind": "wesley.realization.manifest.v1",
  "schemaPath": "schemas/continuum-receipt-family.graphql",
  "schemaHash": "hash",
  "sourceHash": "hash",
  "targets": [""],
  "integrity": {
    "status": "sealed",
    "scope": "generated-leg-files",
    "hashAlgorithm": "sha256",
    "signatureAlgorithm": "hmac-sha256",
    "signatureKeyId": "fixture-key"
  },
  "generatedLegs": {}
}`;

const emptyWesleyGeneratedLegsJson = `{
  "kind": "wesley.realization.manifest.v1",
  "schemaPath": "schemas/continuum-receipt-family.graphql",
  "schemaHash": "hash",
  "sourceHash": "hash",
  "targets": ["warp-ttd"],
  "integrity": {
    "status": "sealed",
    "scope": "generated-leg-files",
    "hashAlgorithm": "sha256",
    "signatureAlgorithm": "hmac-sha256",
    "signatureKeyId": "fixture-key"
  },
  "generatedLegs": {}
}`;

const mismatchedWesleyArtifactCountJson = `{
  "kind": "wesley.realization.manifest.v1",
  "schemaPath": "schemas/continuum-receipt-family.graphql",
  "schemaHash": "hash",
  "sourceHash": "hash",
  "targets": ["warp-ttd"],
  "integrity": {
    "status": "sealed",
    "scope": "generated-leg-files",
    "hashAlgorithm": "sha256",
    "signatureAlgorithm": "hmac-sha256",
    "signatureKeyId": "fixture-key"
  },
  "generatedLegs": {
    "warpTtd": {
      "outDir": "dist/warp-ttd",
      "schemaHash": "hash",
      "sourceHash": "hash",
      "artifactCount": 2,
      "files": [
        {
          "path": "manifest/schema.json",
          "size": 1,
          "contentHash": "hash",
          "signature": "signature"
        }
      ]
    }
  }
}`;

const positiveWesleyArtifactCountWithoutFilesJson = `{
  "kind": "wesley.realization.manifest.v1",
  "schemaPath": "schemas/continuum-receipt-family.graphql",
  "schemaHash": "hash",
  "sourceHash": "hash",
  "targets": ["warp-ttd"],
  "integrity": {
    "status": "sealed",
    "scope": "generated-leg-files",
    "hashAlgorithm": "sha256",
    "signatureAlgorithm": "hmac-sha256",
    "signatureKeyId": "fixture-key"
  },
  "generatedLegs": {
    "warpTtd": {
      "outDir": "dist/warp-ttd",
      "schemaHash": "hash",
      "sourceHash": "hash",
      "artifactCount": 1
    }
  }
}`;

describe('ContinuumArtifactJsonFileAdapter', () => {
  it('loads real Continuum receipt-family fixture descriptors', async () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();
    const descriptor = await adapter.loadFile(generatedFixturePath, fixtureContext);

    expect(descriptor.familyId.toString()).toBe('receipt-family');
    expect(descriptor.hasTarget('continuum-fixture')).toBe(true);
    expect(descriptor.hasGeneratedAuthority()).toBe(true);
    expect(descriptor.artifactDigest).toBe('sha256:receipt-fixture');
    expect(descriptor.witnessScope).toBe('receipt-family');
  });

  it('loads Wesley realization manifest descriptors without local descriptor fields', async () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();
    const descriptor = await adapter.loadFile(wesleyManifestPath, artifactContext);

    expect(descriptor.artifactKind).toBe('wesley.realization.manifest.v1');
    expect(descriptor.sourceSchemaPath).toBe('schemas/continuum-receipt-family.graphql');
    expect(descriptor.schemaHash).toBe('16bf631145b60e0ec240f97484ff2cb5f534cd38c963cf12044985915766a602');
    expect(descriptor.sourceHash).toBe('16bf631145b60e0ec240f97484ff2cb5f534cd38c963cf12044985915766a602');
    expect(descriptor.integrityStatus).toBe('sealed');
    expect(descriptor.signatureAlgorithm).toBe('hmac-sha256');
    expect(descriptor.targets).toEqual(['warp-ttd', 'echo']);
    expect(descriptor.generatedLegs).toEqual(['echo', 'warpTtd']);
    expect(descriptor.generatedFiles).toEqual([
      'ir.json',
      'manifest/schema.json',
      'typescript/types.ts',
    ]);
  });

  it('rejects local mirrors before they become authority', async () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    await expect(adapter.loadFile(generatedFixturePath, localMirrorContext)).rejects.toThrow(AdapterValidationError);
  });

  it('requires authority to match the parsed artifact shape', async () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    await expect(adapter.loadFile(wesleyManifestPath, artifactAsFixtureContext)).rejects.toThrow(AdapterValidationError);
    expect(() => adapter.loadString(typeMapFixtureJson, fixtureAsArtifactContext)).toThrow(AdapterValidationError);
  });

  it('rejects stale load context artifact kind overrides', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();
    const contextWithArtifactKind = {
      ...artifactContext,
      artifactKind: 'continuum.family.fixture',
    };

    expect(() => adapter.loadString(wesleyManifestWithoutGeneratedFilesJson, contextWithArtifactKind)).toThrow(AdapterValidationError);
  });

  it('rejects self-attested authority fields inside artifact JSON', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(() => adapter.loadString(selfAttestedFixtureJson, fixtureContext)).toThrow(AdapterValidationError);
  });

  it('wraps invalid JSON syntax as adapter validation failure', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(() => adapter.loadString('{ "objectTypes": [', fixtureContext)).toThrow(AdapterValidationError);
  });

  it('rejects unsupported top-level JSON shapes', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(() => adapter.loadString('null', fixtureContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString('[]', fixtureContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString('{ "familyId": "receipt-family" }', fixtureContext)).toThrow(AdapterValidationError);
  });

  it('rejects unknown fixture keys and malformed nested entries', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(() => adapter.loadString(unknownFixtureFieldJson, fixtureContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString(invalidOperationJson, fixtureContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString(emptyOperationsJson, fixtureContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString(invalidFootprintsJson, fixtureContext)).toThrow(AdapterValidationError);
  });

  it('accepts fixture artifacts with omitted optional footprints', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(adapter.loadString(fixtureWithoutFootprintsJson, fixtureContext).artifactKind).toBe('continuum.family.fixture');
  });

  it('requires source schema context for fixture artifacts', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();
    const contextWithoutSchemaPath: ContinuumArtifactJsonLoadContext = {
      familyId: 'receipt-family',
      authority: 'generated-fixture',
    };

    expect(() => adapter.loadString(typeMapFixtureJson, contextWithoutSchemaPath)).toThrow(AdapterValidationError);
  });

  it('rejects unsealed Wesley realization manifests', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(() => adapter.loadString(unsealedWesleyManifestJson, artifactContext)).toThrow(AdapterValidationError);
  });

  it('rejects malformed Wesley realization manifest numbers and targets', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(() => adapter.loadString(invalidWesleyArtifactCountJson, artifactContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString(invalidWesleyGeneratedFilesJson, artifactContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString(invalidWesleyTargetsJson, artifactContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString(invalidWesleyTargetEntryJson, artifactContext)).toThrow(AdapterValidationError);
  });

  it('rejects empty or inconsistent Wesley generated inventory', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();

    expect(() => adapter.loadString(emptyWesleyGeneratedLegsJson, artifactContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString(mismatchedWesleyArtifactCountJson, artifactContext)).toThrow(AdapterValidationError);
    expect(() => adapter.loadString(positiveWesleyArtifactCountWithoutFilesJson, artifactContext)).toThrow(AdapterValidationError);
  });

  it('accepts Wesley generated legs before the compiler writes file inventory', () => {
    const adapter = new ContinuumArtifactJsonFileAdapter();
    const descriptor = adapter.loadString(wesleyManifestWithoutGeneratedFilesJson, artifactContext);

    expect(descriptor.generatedLegs).toEqual(['warpTtd']);
    expect(descriptor.generatedFiles).toEqual([]);
  });
});
