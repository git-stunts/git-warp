import { describe, expect, it } from 'vitest';

import GenesisDivergenceReporter
  from '../../../../src/domain/migrations/GenesisDivergenceReporter.ts';
import GenesisEquivalenceBoundary
  from '../../../../src/domain/migrations/GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceMismatch
  from '../../../../src/domain/migrations/GenesisEquivalenceMismatch.ts';
import GenesisEquivalenceProofFailure
  from '../../../../src/domain/migrations/GenesisEquivalenceProofFailure.ts';
import GenesisEquivalenceProofSummary
  from '../../../../src/domain/migrations/GenesisEquivalenceProofSummary.ts';
import type { GenesisEquivalenceMismatchKind }
  from '../../../../src/domain/migrations/GenesisEquivalenceMismatch.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';

describe('GenesisDivergenceReporter', () => {
  it('selects the first mismatch deterministically from a proof failure', () => {
    const report = reporter().report(failure([
      mismatch('extra', 'edge:a', null, 'visible', null),
      mismatch('changed', 'node:a', 'legacy', 'migrated', boundary()),
    ]));

    expect(report.mismatchKind).toBe('changed');
    expect(report.factKey).toBe('node:a');
    expect(report.patchId).toBe('patch:a:0');
    expect(report.operationIndex).toBe(0);
  });

  it('reports missing, extra, and changed facts as distinct mismatch kinds', () => {
    const missing = reporter().report(failure([
      mismatch('missing', 'node:a', 'visible', null, boundary()),
    ]));
    const extra = reporter().report(failure([
      mismatch('extra', 'node:b', null, 'visible', boundary()),
    ]));
    const changed = reporter().report(failure([
      mismatch('changed', 'node:c', 'legacy', 'migrated', boundary()),
    ]));

    expect(missing.mismatchKind).toBe('missing');
    expect(extra.mismatchKind).toBe('extra');
    expect(changed.mismatchKind).toBe('changed');
  });

  it('keeps absent boundary evidence explicit instead of guessing', () => {
    const report = reporter().report(failure([
      mismatch('extra', 'node:b', null, 'visible', null),
    ]));

    expect(report.writerId).toBeNull();
    expect(report.patchId).toBeNull();
    expect(report.operationIndex).toBeNull();
    expect(report.toSummaryLines()).toContain('patchId: (unavailable)');
  });

  it('bounds rendered value summaries without changing mismatch evidence', () => {
    const legacyValue = 'legacy-value-with-a-long-tail-that-should-be-cut-before-operator-output-grows-too-wide';
    const migratedValue = 'migrated-value-with-a-long-tail-that-should-be-cut-before-operator-output-grows-too-wide';
    const sourceMismatch = mismatch('changed', 'node:a', legacyValue, migratedValue, boundary());
    const report = reporter().report(failure([sourceMismatch]));

    expect(sourceMismatch.legacyValue).toBe(legacyValue);
    expect(sourceMismatch.migratedValue).toBe(migratedValue);
    expect(report.legacyValueSummary?.endsWith('...')).toBe(true);
    expect(report.migratedValueSummary?.endsWith('...')).toBe(true);
  });
});

function reporter(): GenesisDivergenceReporter {
  return new GenesisDivergenceReporter();
}

function failure(
  mismatches: readonly GenesisEquivalenceMismatch[],
): GenesisEquivalenceProofFailure {
  return new GenesisEquivalenceProofFailure({
    basis: basis(),
    summary: new GenesisEquivalenceProofSummary({
      basis: basis(),
      legacyFactCount: 2,
      migratedFactCount: 2,
      mismatchCount: mismatches.length,
    }),
    mismatches,
  });
}

function mismatch(
  kind: GenesisEquivalenceMismatchKind,
  factKey: string,
  legacyValue: string | null,
  migratedValue: string | null,
  factBoundary: GenesisEquivalenceBoundary | null,
): GenesisEquivalenceMismatch {
  return new GenesisEquivalenceMismatch({
    kind,
    factKind: 'node',
    factKey,
    fieldPath: 'visibility',
    legacyValue,
    migratedValue,
    boundary: factBoundary,
  });
}

function boundary(): GenesisEquivalenceBoundary {
  return new GenesisEquivalenceBoundary({
    writerId: 'writer:a',
    patchId: 'patch:a:0',
    operationIndex: 0,
  });
}

function basis(): GenesisEquivalenceComparisonBasis {
  return new GenesisEquivalenceComparisonBasis({
    legacyBasis: new GraphModelMigrationBasis({
      graphId: 'graph:source',
      basisId: 'basis:legacy',
    }),
    migratedBasis: new GraphModelMigrationBasis({
      graphId: 'graph:source',
      basisId: 'basis:migrated',
    }),
  });
}
