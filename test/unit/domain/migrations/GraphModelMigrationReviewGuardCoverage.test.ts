import { describe, expect, it } from 'vitest';

import GraphModelMigrationFinalizationRequest
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationRequest.ts';
import GraphModelMigrationFinalizationSafetyResult
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationSafetyResult.ts';
import GraphModelMigrationNotice from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationScratchRef
  from '../../../../src/domain/migrations/GraphModelMigrationScratchRef.ts';
import V17GoldenGraphFixtureManifest, {
  V17GoldenGraphFixtureVisibleFact,
  V17GoldenGraphFixtureWriterChain,
} from '../../../../scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureManifest.ts';

describe('graph model migration review guard coverage', () => {
  it('covers scratch ref validation branches without native TypeError escapes', () => {
    const scratchRef = new GraphModelMigrationScratchRef({
      refName: 'refs/warp-migration-scratch/graph/migration',
    });

    expect(scratchRef.toString()).toBe('refs/warp-migration-scratch/graph/migration');
    expect(GraphModelMigrationScratchRef.validateRefName(null)?.code)
      .toBe('E_MISSING_SCRATCH_REF');
    expect(GraphModelMigrationScratchRef.validateRefName('refs/warp/graph/writers/alice')?.code)
      .toBe('E_LIVE_REF_TARGET');
    expect(GraphModelMigrationScratchRef.validateRefName('refs/not-scratch/graph')?.code)
      .toBe('E_INVALID_SCRATCH_REF');
    expect(GraphModelMigrationScratchRef.validateRefName('refs/warp-migration-scratch/bad~name')?.code)
      .toBe('E_INVALID_SCRATCH_REF');
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationScratchRef(null);
    }).toThrow(/fields/);
  });

  it('covers finalization request and safety result malformed envelopes', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationFinalizationRequest(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationFinalizationRequest({
      liveRefName: '',
      expectedLiveHead: null,
      observedLiveHead: null,
      scratchRef: null,
      scratchHead: null,
      archiveRefName: null,
      confirmation: null,
      gateResult: null,
      runtimeConformance: null,
    })).toThrow(/liveRefName/);
    expect(() => new GraphModelMigrationFinalizationRequest({
      liveRefName: 'refs/warp/graph',
      expectedLiveHead: '',
      observedLiveHead: null,
      scratchRef: null,
      scratchHead: null,
      archiveRefName: null,
      confirmation: null,
      gateResult: null,
      runtimeConformance: null,
    })).toThrow(/expectedLiveHead/);
    expect(() => new GraphModelMigrationFinalizationRequest({
      liveRefName: 'refs/warp/graph',
      expectedLiveHead: null,
      observedLiveHead: null,
      // @ts-expect-error exercising runtime validation
      scratchRef: 'refs/warp-migration-scratch/graph',
      scratchHead: null,
      archiveRefName: null,
      confirmation: null,
      gateResult: null,
      runtimeConformance: null,
    })).toThrow(/scratchRef/);
    expect(() => new GraphModelMigrationFinalizationRequest({
      liveRefName: 'refs/warp/graph',
      expectedLiveHead: null,
      observedLiveHead: null,
      scratchRef: null,
      scratchHead: null,
      archiveRefName: null,
      // @ts-expect-error exercising runtime validation
      confirmation: 'confirm',
      gateResult: null,
      runtimeConformance: null,
    })).toThrow(/confirmation/);
    expect(() => new GraphModelMigrationFinalizationRequest({
      liveRefName: 'refs/warp/graph',
      expectedLiveHead: null,
      observedLiveHead: null,
      scratchRef: null,
      scratchHead: null,
      archiveRefName: null,
      confirmation: null,
      // @ts-expect-error exercising runtime validation
      gateResult: 'passed',
      runtimeConformance: null,
    })).toThrow(/gateResult/);
    expect(() => new GraphModelMigrationFinalizationRequest({
      liveRefName: 'refs/warp/graph',
      expectedLiveHead: null,
      observedLiveHead: null,
      scratchRef: null,
      scratchHead: null,
      archiveRefName: null,
      confirmation: null,
      gateResult: null,
      // @ts-expect-error exercising runtime validation
      runtimeConformance: 'passed',
    })).toThrow(/runtimeConformance/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphModelMigrationFinalizationSafetyResult(null);
    }).toThrow(/fields/);
    expect(() => new GraphModelMigrationFinalizationSafetyResult({
      // @ts-expect-error exercising runtime validation
      request: 'request',
      fatalErrors: [],
    })).toThrow(/request/);
    expect(() => new GraphModelMigrationFinalizationSafetyResult({
      request: finalizationRequest(),
      // @ts-expect-error exercising runtime validation
      fatalErrors: 'fatal',
    })).toThrow(/fatalErrors/);
    expect(() => new GraphModelMigrationFinalizationSafetyResult({
      request: finalizationRequest(),
      fatalErrors: [GraphModelMigrationNotice.warning('W_WARNING', 'warning')],
    })).toThrow(/fatalErrors/);
  });

  it('covers v17 golden fixture manifest malformed envelopes', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new V17GoldenGraphFixtureWriterChain(null);
    }).toThrow(/fields/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new V17GoldenGraphFixtureVisibleFact(null);
    }).toThrow(/fields/);
    expect(() => new V17GoldenGraphFixtureManifest({
      fixtureId: '',
      graphId: 'graph',
      sourceVersion: '17.0.1',
      generator: 'test',
      bundlePath: 'bundle',
      writerChains: [fixtureWriter('alice')],
      visibleFacts: completeFixtureFacts(),
    })).toThrow(/fixtureId/);
    expect(() => new V17GoldenGraphFixtureManifest({
      fixtureId: 'fixture',
      graphId: 'graph',
      sourceVersion: '17.0.1',
      generator: 'test',
      bundlePath: '/bundle',
      writerChains: [fixtureWriter('alice')],
      visibleFacts: completeFixtureFacts(),
    })).toThrow(/relative fixture path/);
    expect(() => new V17GoldenGraphFixtureWriterChain({
      writerId: 'alice',
      refName: 'refs/not-warp/graph/writers/alice',
      expectedHead: '1111111111111111111111111111111111111111',
      patchCount: 1,
    })).toThrow('refName must be under refs/warp/');
    expect(() => new V17GoldenGraphFixtureWriterChain({
      writerId: 'alice',
      refName: 'refs/warp/graph/writers/alice',
      expectedHead: 'not-an-oid',
      patchCount: 1,
    })).toThrow(/object id/);
    expect(() => new V17GoldenGraphFixtureWriterChain({
      writerId: 'alice',
      refName: 'refs/warp/graph/writers/alice',
      expectedHead: '1111111111111111111111111111111111111111',
      patchCount: 0,
    })).toThrow(/positive safe integer/);
    expect(() => new V17GoldenGraphFixtureManifest({
      fixtureId: 'fixture',
      graphId: 'graph',
      sourceVersion: '17.0.1',
      generator: 'test',
      bundlePath: 'bundle',
      // @ts-expect-error exercising runtime validation
      writerChains: 'alice',
      visibleFacts: completeFixtureFacts(),
    })).toThrow(/writerChains/);
    expect(() => new V17GoldenGraphFixtureManifest({
      fixtureId: 'fixture',
      graphId: 'graph',
      sourceVersion: '17.0.1',
      generator: 'test',
      bundlePath: 'bundle',
      writerChains: [fixtureWriter('alice')],
      // @ts-expect-error exercising runtime validation
      visibleFacts: 'node',
    })).toThrow(/visibleFacts/);
    expect(() => new V17GoldenGraphFixtureManifest({
      fixtureId: 'fixture',
      graphId: 'graph',
      sourceVersion: '17.0.1',
      generator: 'test',
      bundlePath: 'bundle',
      // @ts-expect-error exercising runtime validation
      writerChains: [{ writerId: 'alice' }],
      visibleFacts: completeFixtureFacts(),
    })).toThrow(/writerChains/);
    expect(() => new V17GoldenGraphFixtureManifest({
      fixtureId: 'fixture',
      graphId: 'graph',
      sourceVersion: '17.0.1',
      generator: 'test',
      bundlePath: 'bundle',
      writerChains: [fixtureWriter('alice')],
      visibleFacts: [{ kind: 'node', key: 'node:a', description: 'node' }],
    })).toThrow(/visibleFacts/);
  });
});

function finalizationRequest(): GraphModelMigrationFinalizationRequest {
  return new GraphModelMigrationFinalizationRequest({
    liveRefName: 'refs/warp/graph',
    expectedLiveHead: null,
    observedLiveHead: null,
    scratchRef: null,
    scratchHead: null,
    archiveRefName: null,
    confirmation: null,
    gateResult: null,
    runtimeConformance: null,
  });
}

function fixtureWriter(writerId: string): V17GoldenGraphFixtureWriterChain {
  return new V17GoldenGraphFixtureWriterChain({
    writerId,
    refName: `refs/warp/graph/writers/${writerId}`,
    expectedHead: '1111111111111111111111111111111111111111',
    patchCount: 1,
  });
}

function completeFixtureFacts(): readonly V17GoldenGraphFixtureVisibleFact[] {
  return Object.freeze([
    fixtureFact('node', 'node:a'),
    fixtureFact('edge', 'edge:a'),
    fixtureFact('property', 'property:a'),
    fixtureFact('content', 'content:a'),
    fixtureFact('removal', 'node:removed'),
    fixtureFact('multi-writer', 'writers:a+b'),
  ]);
}

function fixtureFact(
  kind: 'node' | 'edge' | 'property' | 'content' | 'removal' | 'multi-writer',
  key: string,
): V17GoldenGraphFixtureVisibleFact {
  return new V17GoldenGraphFixtureVisibleFact({
    kind,
    key,
    description: `${kind}:${key}`,
  });
}
