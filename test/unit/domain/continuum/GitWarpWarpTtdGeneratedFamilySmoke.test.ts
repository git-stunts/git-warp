import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import ContinuumArtifactDescriptor from '../../../../src/domain/continuum/ContinuumArtifactDescriptor.ts';
import GitWarpGraphModelContractConformance
  from '../../../../scripts/v18.0.0/migrations/graph-model/GitWarpGraphModelContractConformance.ts';
import GitWarpWarpTtdGeneratedFamilySmoke
  from '../../../../scripts/v18.0.0/migrations/graph-model/GitWarpWarpTtdGeneratedFamilySmoke.ts';
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

describe('GitWarpWarpTtdGeneratedFamilySmoke', () => {
  it('emits a present warp-ttd generated-family smoke fact for passed conformance', async () => {
    const fact = new GitWarpWarpTtdGeneratedFamilySmoke().evaluate(
      new GitWarpGraphModelContractConformance().evaluate(
        await runtimeBoundaryDescriptor(),
        parseV17GoldenGraphFixtureManifestJson(await readFile(v17ManifestPath, 'utf8')),
      ),
    );

    expect(fact.passed()).toBe(true);
    expect(fact.posture).toBe('PRESENT');
    expect(fact.sourceFamily).toBe('git-warp');
    expect(fact.artifact).toBe('runtime-boundary-family.graph-model-conformance');
    expect(fact.origin).toBe('TRANSLATED_SUBSTRATE');
    expect(fact.scope).toBe('SESSION');
    expect(fact.target).toBe('warp-ttd');
    expect(fact.reason).toBeUndefined();
    expect(fact.payloadLines).toContain('contract-family=runtime-boundary-family');
    expect(fact.payloadLines).toContain('status=passed');
  });

  it('emits an obstructed fact when graph-model conformance fails', async () => {
    const descriptor = new ContinuumArtifactDescriptor({
      familyId: 'receipt-family',
      sourceSchemaPath: '~/git/continuum/schemas/continuum-receipt-family.graphql',
      generatedBy: 'fixture',
      artifactKind: 'continuum.family.fixture',
      authority: 'generated-fixture',
      targets: ['continuum-fixture'],
    });

    const fact = new GitWarpWarpTtdGeneratedFamilySmoke().evaluate(
      new GitWarpGraphModelContractConformance().evaluate(
        descriptor,
        parseV17GoldenGraphFixtureManifestJson(await readFile(v17ManifestPath, 'utf8')),
      ),
    );

    expect(fact.passed()).toBe(false);
    expect(fact.posture).toBe('OBSTRUCTED');
    expect(fact.target).toBe('warp-ttd');
    expect(fact.reason).toBe(
      'generated-family conformance failed: runtime-boundary-family, runtime-boundary-schema, target:warp-ttd',
    );
    expect(fact.payloadLines).toContain('status=failed');
  });
});

async function runtimeBoundaryDescriptor(): Promise<ContinuumArtifactDescriptor> {
  return await new ContinuumArtifactJsonFileAdapter().loadFile(
    runtimeBoundaryFixturePath,
    runtimeBoundaryFixtureContext,
  );
}
