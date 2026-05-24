import { describe, expect, it } from 'vitest';

import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceGate from '../../../../src/domain/migrations/GenesisEquivalenceGate.ts';
import GenesisEquivalenceGateResult
  from '../../../../src/domain/migrations/GenesisEquivalenceGateResult.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationFinalizationConfirmation, {
  V18_GRAPH_MODEL_FINALIZATION_CONFIRMATION,
} from '../../../../src/domain/migrations/GraphModelMigrationFinalizationConfirmation.ts';
import GraphModelMigrationFinalizationRequest
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationRequest.ts';
import GraphModelMigrationFinalizationSafety
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationSafety.ts';
import GraphModelMigrationRuntimeConformanceResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
} from '../../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import GraphModelMigrationScratchRef
  from '../../../../src/domain/migrations/GraphModelMigrationScratchRef.ts';
import {
  divergentPropertyFixture,
  nodeLifecycleFixture,
} from './GenesisEquivalenceFixtures.ts';

const LIVE_REF = 'refs/warp/v17-golden-graph/writers/alice';
const ARCHIVE_REF = 'refs/warp-migration-archive/v17-golden-graph/writers/alice';
const SCRATCH_REF = 'refs/warp-migration-scratch/v17-golden-graph/migration';
const LIVE_HEAD = '1111111111111111111111111111111111111111';
const STALE_HEAD = '2222222222222222222222222222222222222222';
const SCRATCH_HEAD = '3333333333333333333333333333333333333333';

describe('GraphModelMigrationFinalizationSafety', () => {
  it('allows finalization only when every safety precondition is present', () => {
    const result = safety().evaluate(completeRequest());

    expect(result.allowsFinalization()).toBe(true);
    expect(result.fatalErrors).toEqual([]);
  });

  it('rejects finalization without explicit confirmation', () => {
    const result = safety().evaluate(completeRequest({
      confirmation: null,
    }));

    expect(result.allowsFinalization()).toBe(false);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_MISSING_FINALIZATION_CONFIRMATION',
    ]);
  });

  it('rejects finalization when scratch equivalence did not pass', () => {
    const result = safety().evaluate(completeRequest({
      gateResult: failedGateResult(),
    }));

    expect(result.allowsFinalization()).toBe(false);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_EQUIVALENCE_GATE_NOT_PASSED',
    ]);
  });

  it('requires an explicit archive ref target outside live graph refs', () => {
    const missing = safety().evaluate(completeRequest({
      archiveRefName: null,
    }));
    const live = safety().evaluate(completeRequest({
      archiveRefName: LIVE_REF,
    }));

    expect(missing.fatalErrors.map((notice) => notice.code)).toEqual(['E_MISSING_ARCHIVE_REF']);
    expect(live.fatalErrors.map((notice) => notice.code)).toEqual(['E_LIVE_ARCHIVE_REF_TARGET']);
  });

  it('fails closed when the live ref expected head is stale', () => {
    const result = safety().evaluate(completeRequest({
      observedLiveHead: STALE_HEAD,
    }));

    expect(result.allowsFinalization()).toBe(false);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_STALE_LIVE_REF_EXPECTATION',
    ]);
  });

  it('requires runtime conformance evidence matching the scratch output', () => {
    const missing = safety().evaluate(completeRequest({
      runtimeConformance: null,
    }));
    const mismatch = safety().evaluate(completeRequest({
      runtimeConformance: runtimeConformance('4444444444444444444444444444444444444444'),
    }));

    expect(missing.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_RUNTIME_CONFORMANCE_NOT_PASSED',
    ]);
    expect(mismatch.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_RUNTIME_CONFORMANCE_MISMATCH',
    ]);
  });

  it('has no force mode on the finalization request shape', () => {
    const request = completeRequest();

    expect('force' in request).toBe(false);
    expect(Object.keys(request)).not.toContain('force');
  });
});

function safety(): GraphModelMigrationFinalizationSafety {
  return new GraphModelMigrationFinalizationSafety();
}

function completeRequest(overrides: {
  readonly expectedLiveHead?: string | null;
  readonly observedLiveHead?: string | null;
  readonly archiveRefName?: string | null;
  readonly confirmation?: GraphModelMigrationFinalizationConfirmation | null;
  readonly gateResult?: GenesisEquivalenceGateResult | null;
  readonly runtimeConformance?: GraphModelMigrationRuntimeConformanceResult | null;
} = {}): GraphModelMigrationFinalizationRequest {
  const scratchRef = new GraphModelMigrationScratchRef({ refName: SCRATCH_REF });
  const scratchHead = SCRATCH_HEAD;
  return new GraphModelMigrationFinalizationRequest({
    liveRefName: LIVE_REF,
    expectedLiveHead: overrides.expectedLiveHead === undefined ? LIVE_HEAD : overrides.expectedLiveHead,
    observedLiveHead: overrides.observedLiveHead === undefined ? LIVE_HEAD : overrides.observedLiveHead,
    scratchRef,
    scratchHead,
    archiveRefName: overrides.archiveRefName === undefined ? ARCHIVE_REF : overrides.archiveRefName,
    confirmation: overrides.confirmation === undefined ? confirmation() : overrides.confirmation,
    gateResult: overrides.gateResult === undefined ? passedGateResult() : overrides.gateResult,
    runtimeConformance: overrides.runtimeConformance === undefined
      ? runtimeConformance(scratchHead)
      : overrides.runtimeConformance,
  });
}

function confirmation(): GraphModelMigrationFinalizationConfirmation {
  return new GraphModelMigrationFinalizationConfirmation({
    token: V18_GRAPH_MODEL_FINALIZATION_CONFIRMATION,
  });
}

function passedGateResult(): GenesisEquivalenceGateResult {
  const fixture = nodeLifecycleFixture();
  return new GenesisEquivalenceGate().evaluate(
    basis(),
    fixture.legacyReading,
    fixture.migratedReading,
  );
}

function failedGateResult(): GenesisEquivalenceGateResult {
  const fixture = divergentPropertyFixture();
  return new GenesisEquivalenceGate().evaluate(
    basis(),
    fixture.legacyReading,
    fixture.migratedReading,
  );
}

function runtimeConformance(scratchHead: string): GraphModelMigrationRuntimeConformanceResult {
  return new GraphModelMigrationRuntimeConformanceResult({
    scratchRef: new GraphModelMigrationScratchRef({ refName: SCRATCH_REF }),
    scratchHead,
    status: GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
    witness: 'unit-test-runtime-conformance',
    fatalErrors: [],
  });
}

function basis(): GenesisEquivalenceComparisonBasis {
  return new GenesisEquivalenceComparisonBasis({
    legacyBasis: new GraphModelMigrationBasis({
      graphId: 'graph:fixture',
      basisId: 'basis:legacy',
    }),
    migratedBasis: new GraphModelMigrationBasis({
      graphId: 'graph:fixture',
      basisId: 'basis:scratch',
    }),
  });
}
