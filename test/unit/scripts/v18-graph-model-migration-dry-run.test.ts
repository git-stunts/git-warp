import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  parseGraphModelMigrationDryRunCliArgs,
  runGraphModelMigrationDryRunCli,
} from '../../../scripts/v18.0.0/migrations/graph-model/GraphModelMigrationDryRunCli.ts';

describe('v18 graph-model migration dry-run CLI', () => {
  it('prints usage when help is requested', async () => {
    const result = await runGraphModelMigrationDryRunCli(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--request <path>');
    expect(result.stderr).toBe('');
  });

  it('requires request input when help is not requested', async () => {
    await expect(runGraphModelMigrationDryRunCli([])).rejects.toThrow('--request is required');
  });

  it('emits a deterministic manifest for a complete dry-run request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v18-dry-run-'));
    const requestPath = join(directory, 'request.json');
    const manifestPath = join(directory, 'manifest.json');
    await writeFile(requestPath, completeRequestJson(), 'utf8');

    const first = await runGraphModelMigrationDryRunCli([
      '--request',
      requestPath,
      '--manifest-out',
      manifestPath,
    ]);
    const firstManifest = await readFile(manifestPath, 'utf8');
    const second = await runGraphModelMigrationDryRunCli([
      '--request',
      requestPath,
      '--manifest-out',
      manifestPath,
    ]);
    const secondManifest = await readFile(manifestPath, 'utf8');

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(firstManifest).toBe(secondManifest);
    expect(first.stdout).toContain('plannedOperations: 3');
    expect(first.stdout).toContain('graphHistoryWrites: 0');
    expect(first.stderr).toBe('');
    expect(firstManifest).toContain('"basisId": "basis:source:v18-dry-run"');
    expect(firstManifest).toContain('"targetAttachmentKey": "content-attachment:node:a\\u0000_content"');
  });

  it('emits the manifest to stdout when no manifest path is provided', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v18-dry-run-'));
    const requestPath = join(directory, 'request.json');
    await writeFile(requestPath, completeRequestJson(), 'utf8');

    const result = await runGraphModelMigrationDryRunCli(['--request', requestPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('manifest: stdout');
    expect(result.stdout).toContain('"basisId": "basis:source:v18-dry-run"');
    expect(result.stderr).toBe('');
  });

  it('fails closed and writes no manifest when source inventory is incomplete', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'git-warp-v18-dry-run-'));
    const requestPath = join(directory, 'request.json');
    const manifestPath = join(directory, 'manifest.json');
    await writeFile(requestPath, missingSourceBasisRequestJson(), 'utf8');

    const result = await runGraphModelMigrationDryRunCli([
      '--request',
      requestPath,
      '--manifest-out',
      manifestPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('manifest: not-written');
    expect(result.stdout).toContain('fatalErrors: 1');
    expect(result.stderr).toContain('fatal[E_MISSING_SOURCE_BASIS]');
    await expect(stat(manifestPath)).rejects.toThrow();
  });

  it('refuses destructive migration verbs', () => {
    expect(() => parseGraphModelMigrationDryRunCliArgs(['--request', 'request.json', '--apply']))
      .toThrow(/dry-run only/);
  });
});

function completeRequestJson(): string {
  return `{
  "inventory": {
    "graphId": "graph:source",
    "sourceBasis": { "graphId": "graph:source", "basisId": "basis:source" },
    "writerChains": [
      { "writerId": "writer:a", "patchIds": ["patch:a:0"] }
    ],
    "patchDescriptors": [
      { "patchId": "patch:a:0", "writerId": "writer:a", "writerSequence": 0 }
    ],
    "stateSnapshot": { "snapshotId": "snapshot:source" },
    "contentSources": [
      { "legacyContentKey": "node:a\\u0000_content", "contentOid": "oid:content:a" }
    ],
    "warnings": [],
    "fatalErrors": []
  },
  "requiredContentKeys": ["node:a\\u0000_content"],
  "nodeMappings": [
    { "legacyNodeId": "node:a", "targetNodeId": "node:a" }
  ],
  "edgeMappings": [],
  "propertyMappings": [
    {
      "legacyOwnerId": "node:a",
      "legacyPropertyKey": "title",
      "targetOwnerId": "node:a",
      "targetPropertyKey": "title"
    }
  ]
}
`;
}

function missingSourceBasisRequestJson(): string {
  return `{
  "inventory": {
    "graphId": "graph:source",
    "sourceBasis": null,
    "writerChains": [
      { "writerId": "writer:a", "patchIds": ["patch:a:0"] }
    ],
    "patchDescriptors": [
      { "patchId": "patch:a:0", "writerId": "writer:a", "writerSequence": 0 }
    ],
    "stateSnapshot": null,
    "contentSources": [],
    "warnings": [],
    "fatalErrors": []
  },
  "requiredContentKeys": [],
  "nodeMappings": [],
  "edgeMappings": [],
  "propertyMappings": []
}
`;
}
