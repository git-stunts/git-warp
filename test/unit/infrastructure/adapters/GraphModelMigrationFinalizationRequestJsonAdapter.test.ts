import { describe, expect, it } from 'vitest';

import GraphModelMigrationFinalizationConfirmation, {
  GRAPH_MODEL_MIGRATION_FINALIZATION_CONFIRMATION,
} from '../../../../src/domain/migrations/GraphModelMigrationFinalizationConfirmation.ts';
import GraphModelMigrationFinalizationRequest
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationRequest.ts';
import GraphModelMigrationFinalizationSafety
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationSafety.ts';
import AdapterValidationError from '../../../../src/domain/errors/AdapterValidationError.ts';
import {
  parseGraphModelMigrationFinalizationConfirmation,
  parseGraphModelMigrationFinalizationRequest,
} from '../../../../src/infrastructure/adapters/GraphModelMigrationFinalizationRequestJsonAdapter.ts';

type FixtureJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly FixtureJsonValue[]
  | { readonly [key: string]: FixtureJsonValue };

type RequestOverrides = {
  readonly liveRefName?: FixtureJsonValue;
  readonly expectedLiveHead?: FixtureJsonValue;
  readonly observedLiveHead?: FixtureJsonValue;
  readonly scratchRefName?: FixtureJsonValue;
  readonly scratchHead?: FixtureJsonValue;
  readonly archiveRefName?: FixtureJsonValue;
  readonly confirmationToken?: FixtureJsonValue;
  readonly equivalence?: FixtureJsonValue;
  readonly runtimeReplay?: FixtureJsonValue;
  readonly extraRoot?: boolean;
};

type EquivalenceOverrides = {
  readonly mismatchCount?: FixtureJsonValue;
  readonly legacyBasis?: FixtureJsonValue;
  readonly extraEquivalence?: boolean;
};

type RuntimeReplayOverrides = {
  readonly status?: FixtureJsonValue;
  readonly witness?: FixtureJsonValue;
  readonly fatalErrors?: FixtureJsonValue;
  readonly extraRuntimeReplay?: boolean;
};

describe('GraphModelMigrationFinalizationRequestJsonAdapter', () => {
  it('parses confirmation JSON into a runtime-backed confirmation noun', () => {
    const confirmation = parseGraphModelMigrationFinalizationConfirmation(JSON.stringify({
      confirmationToken: GRAPH_MODEL_MIGRATION_FINALIZATION_CONFIRMATION,
    }));

    expect(confirmation).toBeInstanceOf(GraphModelMigrationFinalizationConfirmation);
    expect(confirmation.token).toBe(GRAPH_MODEL_MIGRATION_FINALIZATION_CONFIRMATION);
  });

  it('parses a complete finalization request into safety-gated nouns', () => {
    const request = parseGraphModelMigrationFinalizationRequest(requestJson());
    const safety = new GraphModelMigrationFinalizationSafety().evaluate(request);

    expect(request).toBeInstanceOf(GraphModelMigrationFinalizationRequest);
    expect(request.liveRefName).toBe('refs/warp/v17-golden-graph/live');
    expect(request.scratchRef?.refName).toBe('refs/warp-migration-scratch/v17-golden-graph/wet-run');
    expect(request.confirmation?.token).toBe(GRAPH_MODEL_MIGRATION_FINALIZATION_CONFIRMATION);
    expect(request.gateResult?.allowsPromotion()).toBe(true);
    expect(request.runtimeConformance?.allowsFinalization()).toBe(true);
    expect(safety.fatalErrors).toEqual([]);
  });

  it('rejects malformed request envelopes at the JSON boundary', () => {
    const cases = Object.freeze([
      {
        raw: '{',
        message: /valid JSON/,
      },
      {
        raw: requestJson({ extraRoot: true }),
        message: /finalizationRequest\.extra/,
      },
      {
        raw: requestJson({ liveRefName: '' }),
        message: /liveRefName.*non-empty string/,
      },
      {
        raw: requestJson({ equivalence: [] }),
        message: /equivalence.*object/,
      },
      {
        raw: requestJson({ runtimeReplay: runtimeReplayJson({ status: 'maybe' }) }),
        message: /runtimeReplay\.status.*passed or failed/,
      },
    ]);

    for (const candidate of cases) {
      expect(() => parseGraphModelMigrationFinalizationRequest(candidate.raw))
        .toThrow(candidate.message);
    }
  });

  it('rejects finalization requests that do not prove zero mismatches', () => {
    expect(() => parseGraphModelMigrationFinalizationRequest(requestJson({
      equivalence: equivalenceJson({ mismatchCount: 1 }),
    }))).toThrow(AdapterValidationError);
    expect(() => parseGraphModelMigrationFinalizationRequest(requestJson({
      equivalence: equivalenceJson({ mismatchCount: 1 }),
    }))).toThrow(/zero mismatches/);
  });

  it('wraps semantic runtime replay contradictions as adapter validation errors', () => {
    const failedWithoutFatalErrors = requestJson({
      runtimeReplay: runtimeReplayJson({ status: 'failed' }),
    });
    const passedWithFatalErrors = requestJson({
      runtimeReplay: runtimeReplayJson({
        fatalErrors: [{
          kind: 'fatal',
          code: 'E_RUNTIME_REPLAY_FAILED',
          message: 'runtime replay failed',
        }],
      }),
    });

    expect(() => parseGraphModelMigrationFinalizationRequest(failedWithoutFatalErrors))
      .toThrow(AdapterValidationError);
    expect(() => parseGraphModelMigrationFinalizationRequest(failedWithoutFatalErrors))
      .toThrow(/failed runtime conformance must contain fatal errors/);
    expect(() => parseGraphModelMigrationFinalizationRequest(passedWithFatalErrors))
      .toThrow(AdapterValidationError);
    expect(() => parseGraphModelMigrationFinalizationRequest(passedWithFatalErrors))
      .toThrow(/passed runtime conformance must not contain fatal errors/);
  });

  it('rejects malformed confirmation JSON', () => {
    expect(() => parseGraphModelMigrationFinalizationConfirmation('{'))
      .toThrow(/finalization confirmation JSON/);
    expect(() => parseGraphModelMigrationFinalizationConfirmation(JSON.stringify({
      confirmationToken: 'YES',
    }))).toThrow(/confirmation token/);
  });
});

function requestJson(overrides: RequestOverrides = {}): string {
  return JSON.stringify({
    liveRefName: overrides.liveRefName ?? 'refs/warp/v17-golden-graph/live',
    expectedLiveHead: overrides.expectedLiveHead ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    observedLiveHead: overrides.observedLiveHead ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    scratchRefName: overrides.scratchRefName ?? 'refs/warp-migration-scratch/v17-golden-graph/wet-run',
    scratchHead: overrides.scratchHead ?? 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    archiveRefName: overrides.archiveRefName ?? 'refs/warp-migration-archive/v17-golden-graph/pre-v18',
    confirmationToken: overrides.confirmationToken ?? GRAPH_MODEL_MIGRATION_FINALIZATION_CONFIRMATION,
    equivalence: overrides.equivalence ?? equivalenceJson(),
    runtimeReplay: overrides.runtimeReplay ?? runtimeReplayJson(),
    ...(overrides.extraRoot === true ? { extra: true } : {}),
  });
}

function equivalenceJson(overrides: EquivalenceOverrides = {}) {
  return {
    legacyBasis: overrides.legacyBasis ?? basisJson('source:v17'),
    migratedBasis: basisJson('source:v17:dry-run'),
    legacyFactCount: 7,
    migratedFactCount: 7,
    mismatchCount: overrides.mismatchCount ?? 0,
    ...(overrides.extraEquivalence === true ? { extra: true } : {}),
  };
}

function basisJson(basisId: string) {
  return {
    graphId: 'v17-golden-graph',
    basisId,
  };
}

function runtimeReplayJson(overrides: RuntimeReplayOverrides = {}) {
  return {
    scratchRefName: 'refs/warp-migration-scratch/v17-golden-graph/wet-run',
    scratchHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    status: overrides.status ?? 'passed',
    witness: overrides.witness ?? 'git-warp-v18-production-runtime-scratch-replay-v1 operations=5',
    fatalErrors: overrides.fatalErrors ?? [],
    ...(overrides.extraRuntimeReplay === true ? { extra: true } : {}),
  };
}
