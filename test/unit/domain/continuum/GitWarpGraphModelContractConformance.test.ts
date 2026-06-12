import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import ContinuumArtifactDescriptor from '../../../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import GitWarpGraphModelContractConformance
  from '../../../../scripts/v18.0.0/migrations/graph-model/GitWarpGraphModelContractConformance.ts';
import ContinuumArtifactJsonFileAdapter, {
  type ContinuumArtifactJsonLoadContext,
} from '../../../../src/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.ts';
import { parseV17GoldenGraphFixtureManifestJson }
  from '../../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureManifestJsonAdapter.ts';

const runtimeBoundaryFixturePath = fileURLToPath(
  new URL('../../../fixtures/continuum/runtime-boundary-family-generated-artifact.json', import.meta.url),
);

const v17ManifestPath = fileURLToPath(
  new URL('../../../../fixtures/v17/graph-model-golden/manifest.json', import.meta.url),
);

const runtimeBoundaryFixtureContext: ContinuumArtifactJsonLoadContext = {
  familyId: 'runtime-boundary-family',
  authority: 'generated-fixture',
  sourceSchemaPath: '~/git/continuum/schemas/continuum-runtime-boundary-family.graphql',
  witnessScope: 'runtime-boundary-family',
  artifactDigest: 'sha256:runtime-boundary-fixture',
  targets: ['continuum-fixture', 'warp-ttd'],
};

describe('GitWarpGraphModelContractConformance', () => {
  it('accepts runtime-boundary generated contracts for the v17 graph-model fixture', async () => {
    const result = new GitWarpGraphModelContractConformance().evaluate(
      await runtimeBoundaryDescriptor(),
      parseV17GoldenGraphFixtureManifestJson(await readFile(v17ManifestPath, 'utf8')),
    );

    expect(result.passed()).toBe(true);
    expect(result.failedChecks()).toEqual([]);
    expect(result.evidenceLines()).toContain('contract-family=runtime-boundary-family');
    expect(result.evidenceLines()).toContain('graph-id=v17-golden-graph');
    expect(result.evidenceLines()).toContain('status=passed');
  });

  it('rejects descriptors that do not carry the runtime-boundary generated contract shape', async () => {
    const descriptor = new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
      generatedBy: 'fixture',
      artifactKind: 'continuum.family.fixture',
      authority: 'generated-fixture',
      targets: ['continuum-fixture'],
    });

    const result = new GitWarpGraphModelContractConformance().evaluate(
      descriptor,
      parseV17GoldenGraphFixtureManifestJson(await readFile(v17ManifestPath, 'utf8')),
    );

    expect(result.passed()).toBe(false);
    expect(result.failedChecks().map((check) => check.name)).toEqual([
      'runtime-boundary-family',
      'runtime-boundary-schema',
      'target:warp-ttd',
    ]);
    expect(result.evidenceLines()).toContain('status=failed');
  });
});

async function runtimeBoundaryDescriptor(): Promise<ContinuumArtifactDescriptor> {
  return await new ContinuumArtifactJsonFileAdapter().loadFile(
    runtimeBoundaryFixturePath,
    runtimeBoundaryFixtureContext,
  );
}
