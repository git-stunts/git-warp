import { describe, expect, it } from 'vitest';

import GenesisEquivalenceBoundary
  from '../../../../src/domain/migrations/GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceGate from '../../../../src/domain/migrations/GenesisEquivalenceGate.ts';
import GenesisEquivalenceProofFailure
  from '../../../../src/domain/migrations/GenesisEquivalenceProofFailure.ts';
import GenesisEquivalenceProofSuccess
  from '../../../../src/domain/migrations/GenesisEquivalenceProofSuccess.ts';
import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact, {
  type GenesisEquivalenceReadingFactKind,
} from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import {
  divergentPropertyFixture,
  nodeLifecycleFixture,
} from './GenesisEquivalenceFixtures.ts';

describe('GenesisEquivalenceGate', () => {
  it('allows promotion when legacy and scratch readings prove equivalent', () => {
    const fixture = nodeLifecycleFixture();

    const result = gate().evaluate(
      basis(),
      fixture.legacyReading,
      fixture.migratedReading,
    );

    expect(result.allowsPromotion()).toBe(true);
    expect(result.proofResult).toBeInstanceOf(GenesisEquivalenceProofSuccess);
    expect(result.divergenceReport).toBeNull();
    expect(result.fatalErrors).toEqual([]);
    expect(result.proofResult.summary.legacyFactCount).toBe(2);
    expect(result.proofResult.summary.migratedFactCount).toBe(2);
    expect(result.proofResult.summary.mismatchCount).toBe(0);
  });

  it('blocks promotion and reports the first divergent property fact', () => {
    const fixture = divergentPropertyFixture();

    const result = gate().evaluate(
      basis(),
      fixture.legacyReading,
      fixture.migratedReading,
    );

    expect(result.allowsPromotion()).toBe(false);
    expect(result.proofResult).toBeInstanceOf(GenesisEquivalenceProofFailure);
    expect(result.divergenceReport?.mismatchKind).toBe('changed');
    expect(result.divergenceReport?.factKind).toBe('property');
    expect(result.divergenceReport?.factKey).toBe('node:article/title');
    expect(result.divergenceReport?.legacyValueSummary).toBe('Legacy');
    expect(result.divergenceReport?.migratedValueSummary).toBe('Migrated');
  });

  it('blocks promotion and reports divergent content attachment facts', () => {
    const result = gate().evaluate(
      basis(),
      reading('legacy:content', [
        fact('content-attachment', 'node:article', 'payload.oid', 'oid:legacy', boundary('writer:a', 'patch:a:2', 0)),
      ]),
      reading('scratch:content', [
        fact('content-attachment', 'node:article', 'payload.oid', 'oid:scratch', boundary('writer:a', 'patch:a:2', 0)),
      ]),
    );

    expect(result.allowsPromotion()).toBe(false);
    expect(result.divergenceReport?.factKind).toBe('content-attachment');
    expect(result.divergenceReport?.fieldPath).toBe('payload.oid');
    expect(result.divergenceReport?.legacyValueSummary).toBe('oid:legacy');
    expect(result.divergenceReport?.migratedValueSummary).toBe('oid:scratch');
  });

  it('blocks otherwise equivalent readings when boundary evidence is missing', () => {
    const legacy = reading('legacy:missing-boundary', [
      fact('node', 'node:orphan', 'visibility', 'visible', null),
    ]);
    const scratch = reading('scratch:missing-boundary', [
      fact('node', 'node:orphan', 'visibility', 'visible', null),
    ]);

    const result = gate().evaluate(basis(), legacy, scratch);

    expect(result.proofResult).toBeInstanceOf(GenesisEquivalenceProofSuccess);
    expect(result.allowsPromotion()).toBe(false);
    expect(result.fatalErrors.map((notice) => notice.code)).toEqual([
      'E_MISSING_EQUIVALENCE_BOUNDARY',
    ]);
    expect(result.fatalErrors[0]?.message).toContain('2 visible fact(s)');
  });
});

function gate(): GenesisEquivalenceGate {
  return new GenesisEquivalenceGate();
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

function reading(
  readingId: string,
  facts: readonly GenesisEquivalenceReadingFact[],
): GenesisEquivalenceReading {
  return new GenesisEquivalenceReading({ readingId, facts });
}

function fact(
  kind: GenesisEquivalenceReadingFactKind,
  factKey: string,
  fieldPath: string,
  value: string,
  factBoundary: GenesisEquivalenceBoundary | null,
): GenesisEquivalenceReadingFact {
  return new GenesisEquivalenceReadingFact({
    kind,
    factKey,
    fieldPath,
    value,
    boundary: factBoundary,
  });
}

function boundary(
  writerId: string,
  patchId: string,
  operationIndex: number,
): GenesisEquivalenceBoundary {
  return new GenesisEquivalenceBoundary({ writerId, patchId, operationIndex });
}
