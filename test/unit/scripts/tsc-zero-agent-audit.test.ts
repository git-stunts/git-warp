import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);
const AUDIT_PATH = 'docs/audit/2026-06-20_tsc-zero-agent-merge-audit.md';
const RETRO_PATH = 'docs/archive/retrospectives/2026-04-01-tsc-zero-and-joinreducer-strategy.md';

const EXPECTED_REMERGE_PATHS: readonly string[] = [
  'bin/cli/commands/bisect.js',
  'bin/cli/commands/debug/conflicts.js',
  'bin/cli/commands/query.js',
  'bin/cli/commands/strand/materialize.js',
  'bin/cli/commands/verify-audit.js',
  'bin/cli/commands/verify-index.js',
  'bin/presenters/index.js',
  'bin/presenters/text.js',
  'bin/warp-graph.js',
  'eslint.config.js',
  'src/domain/WarpRuntime.js',
  'src/domain/services/AdjacencyNeighborProvider.js',
  'src/domain/services/AnchorMessageCodec.js',
  'src/domain/services/AuditMessageCodec.js',
  'src/domain/services/BitmapIndexBuilder.js',
  'src/domain/services/BoundaryTransitionRecord.js',
  'src/domain/services/CheckpointMessageCodec.js',
  'src/domain/services/CheckpointSerializerV5.js',
  'src/domain/services/CheckpointService.js',
  'src/domain/services/ConflictAnalyzerService.js',
  'src/domain/services/HttpSyncServer.js',
  'src/domain/services/IncrementalIndexUpdater.js',
  'src/domain/services/IndexRebuildService.js',
  'src/domain/services/JoinReducer.js',
  'src/domain/services/PatchBuilderV2.js',
  'src/domain/services/PatchMessageCodec.js',
  'src/domain/services/QueryBuilder.js',
  'src/domain/services/StateReaderV5.js',
  'src/domain/services/StrandService.js',
  'src/domain/services/SyncAuthService.js',
  'src/domain/services/SyncController.js',
  'src/domain/services/TemporalQuery.js',
  'src/domain/services/WarpStateIndexBuilder.js',
  'src/domain/services/WormholeService.js',
  'src/domain/trust/TrustCanonical.js',
  'src/domain/trust/TrustEvaluator.js',
  'src/domain/trust/TrustRecordService.js',
  'src/domain/trust/TrustStateBuilder.js',
  'src/domain/types/DeliveryObservation.js',
  'src/domain/utils/MinHeap.js',
  'src/domain/warp/comparison.methods.js',
  'src/infrastructure/adapters/CasSeekCacheAdapter.js',
  'src/infrastructure/adapters/GitGraphAdapter.js',
  'src/visualization/renderers/ascii/path.js',
  'src/visualization/renderers/ascii/seek.js',
  'test/unit/domain/WarpCore.emit.test.js',
  'test/unit/domain/WarpGraph.audit.test.js',
  'test/unit/domain/services/AuditReceiptService.test.js',
  'test/unit/domain/services/AuditVerifierService.test.js',
  'test/unit/domain/services/LogicalBitmapIndexBuilder.test.js',
  'test/unit/domain/services/LogicalIndexBuildService.test.js',
  'test/unit/domain/services/MaterializedViewService.test.js',
  'test/unit/domain/trust/TrustAdversarial.test.js',
  'test/unit/domain/trust/TrustEvaluator.test.js',
  'test/unit/domain/trust/TrustRecordService.convergence.test.js',
];

function repoPath(relativePath: string): URL {
  return new URL(relativePath, REPO_ROOT);
}

function extractReconstructedPaths(markdown: string): string[] {
  const startMarker = '<!-- tsc-zero-agent-merge-audit-paths:start -->';
  const endMarker = '<!-- tsc-zero-agent-merge-audit-paths:end -->';
  const start = markdown.indexOf(startMarker);
  const end = markdown.indexOf(endMarker);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return markdown
    .slice(start + startMarker.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- `') && line.endsWith('`'))
    .map((line) => line.slice(3, -1));
}

describe('TSC zero agent merge audit closeout', () => {
  it('preserves the exact reconstructed PR 73 conflict-resolution scope', async () => {
    const audit = await readFile(repoPath(AUDIT_PATH), 'utf8');
    const paths = extractReconstructedPaths(audit);

    expect(paths).toEqual(EXPECTED_REMERGE_PATHS);
    expect(paths).toHaveLength(55);
    expect(paths.filter((path) => path.startsWith('test/'))).toHaveLength(10);
    expect(paths.filter((path) => path === 'eslint.config.js')).toHaveLength(1);
    expect(paths.filter((path) => !path.startsWith('test/') && path !== 'eslint.config.js')).toHaveLength(44);
  });

  it('records the closeout verdict and links the original retrospective forward', async () => {
    const audit = await readFile(repoPath(AUDIT_PATH), 'utf8');
    const retro = await readFile(repoPath(RETRO_PATH), 'utf8');

    expect(audit).toContain('Retired. No revert is required.');
    expect(audit).toContain('No suspicious semantic drift remains');
    expect(audit).toContain('The original backlog card said 27 files');
    expect(retro).toContain('../../audit/2026-06-20_tsc-zero-agent-merge-audit.md');
  });
});
