import { describe, expect, it } from 'vitest';

import GraphModelMigrationNotice from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import GraphModelMigrationRuntimeReplayResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
} from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';
import GraphModelMigrationScratchRef
  from '../../../../src/domain/migrations/GraphModelMigrationScratchRef.ts';

describe('GraphModelMigrationRuntimeReplayResult', () => {
  it('models a passing production-runtime scratch replay result', () => {
    const result = new GraphModelMigrationRuntimeReplayResult({
      request: runtimeReplayRequest(),
      status: GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
      witness: 'runtime-replay-v1 operations=1',
      replayedOperationCount: 1,
      fatalErrors: [],
    });

    expect(result.allowsFinalization()).toBe(true);
    expect(result.request.graphId).toBe('v17-golden-graph');
    expect(result.replayedOperationCount).toBe(1);
  });

  it('models a failing production-runtime scratch replay result', () => {
    const result = new GraphModelMigrationRuntimeReplayResult({
      request: runtimeReplayRequest(),
      status: GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED,
      witness: 'runtime-replay-v1',
      replayedOperationCount: 0,
      fatalErrors: [
        GraphModelMigrationNotice.fatal('E_RUNTIME_REPLAY_FAILED', 'runtime replay failed'),
      ],
    });

    expect(result.allowsFinalization()).toBe(false);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual(['E_RUNTIME_REPLAY_FAILED']);
  });

  it('rejects malformed request and result envelopes', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationRuntimeReplayRequest(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationRuntimeReplayRequest({
      graphId: '',
      writerId: 'scratch-migration',
      scratchRef: scratchRef(),
      scratchHead: '1111111111111111111111111111111111111111',
    })).toThrow(/graphId/);
    expect(() => new GraphModelMigrationRuntimeReplayRequest({
      graphId: 'v17-golden-graph',
      writerId: 'scratch-migration',
      // @ts-expect-error exercising runtime validation
      scratchRef: 'refs/warp-migration-scratch/v17-golden-graph/migration',
      scratchHead: '1111111111111111111111111111111111111111',
    })).toThrow(/scratchRef/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationRuntimeReplayResult(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationRuntimeReplayResult({
      request: runtimeReplayRequest(),
      status: GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
      witness: 'runtime-replay-v1',
      replayedOperationCount: 1,
      fatalErrors: [GraphModelMigrationNotice.fatal('E_FATAL', 'fatal')],
    })).toThrow(/passed runtime replay/);
    expect(() => new GraphModelMigrationRuntimeReplayResult({
      request: runtimeReplayRequest(),
      status: GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED,
      witness: 'runtime-replay-v1',
      replayedOperationCount: 0,
      fatalErrors: [],
    })).toThrow(/failed runtime replay/);
    expect(() => new GraphModelMigrationRuntimeReplayResult({
      request: runtimeReplayRequest(),
      status: GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
      witness: 'runtime-replay-v1',
      replayedOperationCount: -1,
      fatalErrors: [],
    })).toThrow(/replayedOperationCount/);
  });
});

function runtimeReplayRequest(): GraphModelMigrationRuntimeReplayRequest {
  return new GraphModelMigrationRuntimeReplayRequest({
    graphId: 'v17-golden-graph',
    writerId: 'scratch-migration',
    scratchRef: scratchRef(),
    scratchHead: '1111111111111111111111111111111111111111',
  });
}

function scratchRef(): GraphModelMigrationScratchRef {
  return new GraphModelMigrationScratchRef({
    refName: 'refs/warp-migration-scratch/v17-golden-graph/migration',
  });
}
