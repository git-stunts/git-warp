import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  parseGraphModelMigrationCommandCliArgs,
  runGraphModelMigrationCommandCli,
} from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationCommandCli.ts';
import {
  restoreV17GoldenGraphFixture,
} from '../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureRestore.ts';
import { runMigrationGit }
  from '../../../scripts/v18.0.0/migrations/graph-model/GitMigrationCommandRunner.ts';
import {
  GRAPH_MODEL_MIGRATION_FINALIZATION_CONFIRMATION,
} from '../../../src/domain/migrations/GraphModelMigrationFinalizationConfirmation.ts';
import { gitOk } from './migrationTestEnvironment.ts';

const FIXTURE_MANIFEST = 'fixtures/v17/graph-model-golden/manifest.json';
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/cli';
const LIVE_REF = 'refs/warp/v17-golden-graph/writers/alice';
const ARCHIVE_REF = 'refs/warp-migration-archive/v17-golden-graph/cli/alice';
const ALICE_HEAD = '417fe95095a6feae3042c36505065bbd7b3d2a67';
const BOB_HEAD = 'd7c3a05b3894d5c3c151e03dd972b6bd6c341b0c';
const REVIEWED_LIVE_REF = 'refs/warp/v17-golden-graph/live';
const REVIEWED_ARCHIVE_REF = 'refs/warp-migration-archive/v17-golden-graph/cli/live';
const SCRATCH_HEAD = 'eb75f3e966f5240f35106952fc42a46872df1300';

describe('v18 graph-model migration command CLI', () => {
  it('prints usage when help is requested', async () => {
    const result = await runGraphModelMigrationCommandCli(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--legacy-fixture-manifest <path>');
    expect(result.stderr).toBe('');
  });

  it('refuses legacy finalization flags in favor of request artifacts', () => {
    expect(() => parseGraphModelMigrationCommandCliArgs(['--finalize']))
      .toThrow(/direct finalization flags are not supported/);
    expect(() => parseGraphModelMigrationCommandCliArgs(['--finalize']))
      .toThrow(/--finalization-request <path>/);
  });

  it('writes scratch history and emits a deterministic command report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v18-command-cli-'));
    const requestPath = join(directory, 'request.json');
    const reportPath = join(directory, 'report.txt');
    const restoreResult = await restoreV17GoldenGraphFixture({
      manifestPath: FIXTURE_MANIFEST,
      targetDirectory: join(directory, 'repo'),
    });
    await writeFile(requestPath, canonicalRequestJson(), 'utf8');

    const result = await runGraphModelMigrationCommandCli([
      '--repo',
      restoreResult.repositoryPath,
      '--request',
      requestPath,
      '--legacy-fixture-manifest',
      FIXTURE_MANIFEST,
      '--scratch-ref',
      SCRATCH_REF,
      '--report-out',
      reportPath,
    ]);
    const report = await readFile(reportPath, 'utf8');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(report);
    expect(report).toContain('scratch: written');
    expect(report).toContain(`scratchRef: ${SCRATCH_REF}`);
    expect(report).toContain(`scratchHead: ${SCRATCH_HEAD}`);
    expect(report).toContain('equivalence: passed');
    expect(report).toContain('finalization: skipped');
  });

  it('finalizes live refs only when the reviewed request matches command evidence', async () => {
    const scratchHead = SCRATCH_HEAD;

    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v18-command-cli-finalize-'));
    const restoreResult = await restoreV17GoldenGraphFixture({
      manifestPath: FIXTURE_MANIFEST,
      targetDirectory: join(directory, 'repo'),
    });
    const requestPath = join(directory, 'request.json');
    const finalizationPath = join(directory, 'finalization.json');
    await writeFile(requestPath, canonicalRequestJson(), 'utf8');
    await writeFile(finalizationPath, finalizationRequestJson(scratchHead), 'utf8');

    const result = await runGraphModelMigrationCommandCli([
      '--repo',
      restoreResult.repositoryPath,
      '--request',
      requestPath,
      '--legacy-fixture-manifest',
      FIXTURE_MANIFEST,
      '--scratch-ref',
      SCRATCH_REF,
      '--finalization-request',
      finalizationPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('finalization: completed');
    expect(result.stdout).toContain('archivePreserved: yes');
    expect(await gitOk(restoreResult.repositoryPath, ['rev-parse', ARCHIVE_REF])).toBe(ALICE_HEAD);
    expect(await gitOk(restoreResult.repositoryPath, ['rev-parse', LIVE_REF])).toBe(scratchHead);
  });

  it('blocks finalization when the reviewed live ref head drifts', async () => {
    const scratchHead = SCRATCH_HEAD;
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v18-command-cli-drift-'));
    const restoreResult = await restoreV17GoldenGraphFixture({
      manifestPath: FIXTURE_MANIFEST,
      targetDirectory: join(directory, 'repo'),
    });
    await gitOk(restoreResult.repositoryPath, ['update-ref', REVIEWED_LIVE_REF, ALICE_HEAD]);
    await gitOk(restoreResult.repositoryPath, ['update-ref', REVIEWED_LIVE_REF, BOB_HEAD, ALICE_HEAD]);
    const requestPath = join(directory, 'request.json');
    const finalizationPath = join(directory, 'finalization.json');
    await writeFile(requestPath, canonicalRequestJson(), 'utf8');
    await writeFile(finalizationPath, finalizationRequestJson(scratchHead, {
      liveRefName: REVIEWED_LIVE_REF,
      archiveRefName: REVIEWED_ARCHIVE_REF,
    }), 'utf8');

    const result = await runGraphModelMigrationCommandCli([
      '--repo',
      restoreResult.repositoryPath,
      '--request',
      requestPath,
      '--legacy-fixture-manifest',
      FIXTURE_MANIFEST,
      '--scratch-ref',
      SCRATCH_REF,
      '--finalization-request',
      finalizationPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('finalization: blocked');
    expect(result.stdout).toContain('E_STALE_LIVE_REF_EXPECTATION');
    expect(await refExists(restoreResult.repositoryPath, REVIEWED_ARCHIVE_REF)).toBe(false);
    expect(await gitOk(restoreResult.repositoryPath, ['rev-parse', REVIEWED_LIVE_REF])).toBe(BOB_HEAD);
  });

  it('blocks finalization when the archive ref already exists', async () => {
    const scratchHead = SCRATCH_HEAD;
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v18-command-cli-archive-'));
    const restoreResult = await restoreV17GoldenGraphFixture({
      manifestPath: FIXTURE_MANIFEST,
      targetDirectory: join(directory, 'repo'),
    });
    await gitOk(restoreResult.repositoryPath, ['update-ref', REVIEWED_LIVE_REF, ALICE_HEAD]);
    await gitOk(restoreResult.repositoryPath, ['update-ref', REVIEWED_ARCHIVE_REF, ALICE_HEAD]);
    const requestPath = join(directory, 'request.json');
    const finalizationPath = join(directory, 'finalization.json');
    await writeFile(requestPath, canonicalRequestJson(), 'utf8');
    await writeFile(finalizationPath, finalizationRequestJson(scratchHead, {
      liveRefName: REVIEWED_LIVE_REF,
      archiveRefName: REVIEWED_ARCHIVE_REF,
    }), 'utf8');

    const result = await runGraphModelMigrationCommandCli([
      '--repo',
      restoreResult.repositoryPath,
      '--request',
      requestPath,
      '--legacy-fixture-manifest',
      FIXTURE_MANIFEST,
      '--scratch-ref',
      SCRATCH_REF,
      '--finalization-request',
      finalizationPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('finalization: blocked');
    expect(result.stdout).toContain('E_ARCHIVE_REF_EXISTS');
    expect(await gitOk(restoreResult.repositoryPath, ['rev-parse', REVIEWED_LIVE_REF])).toBe(ALICE_HEAD);
  });

  it('blocks finalization when the reviewed runtime witness differs from observed replay', async () => {
    const scratchHead = SCRATCH_HEAD;
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v18-command-cli-witness-'));
    const restoreResult = await restoreV17GoldenGraphFixture({
      manifestPath: FIXTURE_MANIFEST,
      targetDirectory: join(directory, 'repo'),
    });
    const requestPath = join(directory, 'request.json');
    const finalizationPath = join(directory, 'finalization.json');
    await writeFile(requestPath, canonicalRequestJson(), 'utf8');
    await writeFile(finalizationPath, finalizationRequestJson(scratchHead, {
      runtimeWitness: 'tampered-runtime-witness',
    }), 'utf8');

    const result = await runGraphModelMigrationCommandCli([
      '--repo',
      restoreResult.repositoryPath,
      '--request',
      requestPath,
      '--legacy-fixture-manifest',
      FIXTURE_MANIFEST,
      '--scratch-ref',
      SCRATCH_REF,
      '--finalization-request',
      finalizationPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('finalization: blocked');
    expect(result.stdout).toContain('E_FINALIZATION_REVIEW_MISMATCH');
    expect(result.stdout).toContain('runtimeConformance');
    expect(await refExists(restoreResult.repositoryPath, ARCHIVE_REF)).toBe(false);
    expect(await gitOk(restoreResult.repositoryPath, ['rev-parse', LIVE_REF])).toBe(ALICE_HEAD);
  });

});

function canonicalRequestJson(): string {
  return `{
  "inventory": {
    "graphId": "v17-golden-graph",
    "sourceBasis": { "graphId": "v17-golden-graph", "basisId": "basis:source" },
    "writerChains": [
      { "writerId": "alice", "patchIds": ["patch:alice:0"] }
    ],
    "patchDescriptors": [
      { "patchId": "patch:alice:0", "writerId": "alice", "writerSequence": 0 }
    ],
    "stateSnapshot": { "snapshotId": "snapshot:source" },
    "contentSources": [
      { "legacyContentKey": "node:alpha:_content", "contentOid": "oid:content:alpha" }
    ],
    "warnings": [],
    "fatalErrors": []
  },
  "requiredContentKeys": ["node:alpha:_content"],
  "nodeMappings": [
    { "legacyNodeId": "node:alpha", "targetNodeId": "node:alpha" },
    { "legacyNodeId": "node:beta", "targetNodeId": "node:beta" }
  ],
  "edgeMappings": [
    {
      "legacyEdgeId": "node:alpha->node:beta:relates",
      "targetEdgeId": "node:alpha->node:beta:relates"
    }
  ],
  "propertyMappings": [
    {
      "legacyOwnerId": "node:alpha",
      "legacyPropertyKey": "title",
      "targetOwnerId": "node:alpha",
      "targetPropertyKey": "title"
    },
    {
      "legacyOwnerId": "node:alpha->node:beta:relates",
      "legacyPropertyKey": "weight",
      "targetOwnerId": "\\u0001node:alpha\\u0000node:beta\\u0000relates",
      "targetPropertyKey": "weight"
    }
  ]
}
`;
}

type FinalizationRequestOptions = {
  readonly liveRefName?: string;
  readonly archiveRefName?: string;
  readonly runtimeWitness?: string;
};

function finalizationRequestJson(
  scratchHead: string,
  options: FinalizationRequestOptions = {},
): string {
  return JSON.stringify({
    liveRefName: options.liveRefName ?? LIVE_REF,
    expectedLiveHead: ALICE_HEAD,
    observedLiveHead: ALICE_HEAD,
    scratchRefName: SCRATCH_REF,
    scratchHead,
    archiveRefName: options.archiveRefName ?? ARCHIVE_REF,
    confirmationToken: GRAPH_MODEL_MIGRATION_FINALIZATION_CONFIRMATION,
    equivalence: {
      legacyBasis: {
        graphId: 'v17-golden-graph',
        basisId: 'basis:source',
      },
      migratedBasis: {
        graphId: 'v17-golden-graph',
        basisId: 'basis:source:dry-run',
      },
      legacyFactCount: 8,
      migratedFactCount: 8,
      mismatchCount: 0,
    },
    runtimeReplay: {
      scratchRefName: SCRATCH_REF,
      scratchHead,
      status: 'passed',
      witness: options.runtimeWitness
        ?? 'git-warp-v18-production-runtime-scratch-replay-v1 operations=6',
      fatalErrors: [],
    },
  });
}

async function refExists(repositoryPath: string, refName: string): Promise<boolean> {
  const result = await runMigrationGit(
    repositoryPath,
    ['show-ref', '--verify', '--hash', refName],
    null,
  );
  return result.ok();
}
