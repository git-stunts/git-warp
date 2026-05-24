import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  parseGraphModelMigrationCommandCliArgs,
  runGraphModelMigrationCommandCli,
} from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationCommandCli.ts';

const execFileAsync = promisify(execFile);
const FIXTURE_MANIFEST = 'fixtures/v17/graph-model-golden/manifest.json';
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/cli';

describe('v18 graph-model migration command CLI', () => {
  it('prints usage when help is requested', async () => {
    const result = await runGraphModelMigrationCommandCli(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--legacy-fixture-manifest <path>');
    expect(result.stderr).toBe('');
  });

  it('refuses finalization flags until live-ref CLI finalization is designed', () => {
    expect(() => parseGraphModelMigrationCommandCliArgs(['--finalize']))
      .toThrow(/finalization is not supported/);
  });

  it('writes scratch history and emits a deterministic command report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v18-command-cli-'));
    const repositoryPath = join(directory, 'repo');
    const requestPath = join(directory, 'request.json');
    const reportPath = join(directory, 'report.txt');
    await execFileAsync('git', ['init', '-q', repositoryPath]);
    await writeFile(requestPath, completeRequestJson(), 'utf8');

    const result = await runGraphModelMigrationCommandCli([
      '--repo',
      repositoryPath,
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

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe(report);
    expect(report).toContain('scratch: written');
    expect(report).toContain(`scratchRef: ${SCRATCH_REF}`);
    expect(report).toContain('equivalence: blocked');
    expect(report).toContain('finalization: skipped');
  });
});

function completeRequestJson(): string {
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
    { "legacyNodeId": "node:alpha", "targetNodeId": "node:alpha" }
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
    }
  ]
}
`;
}
