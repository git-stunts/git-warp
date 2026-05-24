import { describe, expect, it } from 'vitest';

import GenesisEquivalenceBoundary
  from '../../../../src/domain/migrations/GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceMismatch
  from '../../../../src/domain/migrations/GenesisEquivalenceMismatch.ts';
import GenesisEquivalenceProof
  from '../../../../src/domain/migrations/GenesisEquivalenceProof.ts';
import GenesisEquivalenceProofFailure
  from '../../../../src/domain/migrations/GenesisEquivalenceProofFailure.ts';
import GenesisEquivalenceProofSuccess
  from '../../../../src/domain/migrations/GenesisEquivalenceProofSuccess.ts';
import GenesisEquivalenceProofSummary
  from '../../../../src/domain/migrations/GenesisEquivalenceProofSummary.ts';
import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact, {
  type GenesisEquivalenceReadingFactKind,
} from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';

describe('GenesisEquivalenceProof', () => {
  it('returns a success value for equal legacy and migrated readings', () => {
    const result = proof().compare(
      basis(),
      reading('legacy', [nodeFact('node:a', 'visible')]),
      reading('migrated', [nodeFact('node:a', 'visible')]),
    );

    expect(result).toBeInstanceOf(GenesisEquivalenceProofSuccess);
    expect(result.summary.mismatchCount).toBe(0);
    expect(result.summary.legacyFactCount).toBe(1);
    expect(result.summary.migratedFactCount).toBe(1);
  });

  it('returns a changed node mismatch with patch boundary evidence', () => {
    const result = proof().compare(
      basis(),
      reading('legacy', [nodeFact('node:a', 'visible')]),
      reading('migrated', [nodeFact('node:a', 'hidden')]),
    );

    expect(result).toBeInstanceOf(GenesisEquivalenceProofFailure);
    if (result instanceof GenesisEquivalenceProofFailure) {
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]?.kind).toBe('changed');
      expect(result.mismatches[0]?.factKind).toBe('node');
      expect(result.mismatches[0]?.factKey).toBe('node:a');
      expect(result.mismatches[0]?.fieldPath).toBe('visibility');
      expect(result.mismatches[0]?.legacyValue).toBe('visible');
      expect(result.mismatches[0]?.migratedValue).toBe('hidden');
      expect(result.mismatches[0]?.boundary?.patchId).toBe('patch:a:0');
      expect(result.mismatches[0]?.boundary?.operationIndex).toBe(0);
    }
  });

  it('identifies content attachment field mismatches', () => {
    const result = proof().compare(
      basis(),
      reading('legacy', [fact('content-attachment', 'node:a', 'payload.oid', 'oid:legacy')]),
      reading('migrated', [fact('content-attachment', 'node:a', 'payload.oid', 'oid:migrated')]),
    );

    expect(result).toBeInstanceOf(GenesisEquivalenceProofFailure);
    if (result instanceof GenesisEquivalenceProofFailure) {
      expect(result.mismatches[0]?.factKind).toBe('content-attachment');
      expect(result.mismatches[0]?.fieldPath).toBe('payload.oid');
      expect(result.mismatches[0]?.legacyValue).toBe('oid:legacy');
      expect(result.mismatches[0]?.migratedValue).toBe('oid:migrated');
    }
  });

  it('collects multiple mismatches in deterministic order', () => {
    const result = proof().compare(
      basis(),
      reading('legacy', [
        fact('property', 'node:z/title', 'value', 'Z'),
        fact('node', 'node:a', 'visibility', 'visible'),
      ]),
      reading('migrated', [
        fact('property', 'node:z/title', 'value', 'Z2'),
        fact('edge', 'node:a->node:b/knows', 'visibility', 'visible'),
      ]),
    );

    expect(result).toBeInstanceOf(GenesisEquivalenceProofFailure);
    if (result instanceof GenesisEquivalenceProofFailure) {
      expect(result.summary.mismatchCount).toBe(3);
      expect(result.mismatches.map((mismatch) => mismatch.toKey())).toEqual([
        'changed\0property\0node:z/title\0value',
        'extra\0edge\0node:a->node:b/knows\0visibility',
        'missing\0node\0node:a\0visibility',
      ]);
    }
  });

  it('returns expected proof failure as a value instead of throwing', () => {
    const result = proof().compare(
      basis(),
      reading('legacy', [nodeFact('node:a', 'visible')]),
      reading('migrated', []),
    );

    expect(result).toBeInstanceOf(GenesisEquivalenceProofFailure);
    if (result instanceof GenesisEquivalenceProofFailure) {
      expect(result.mismatches[0]?.kind).toBe('missing');
      expect(result.mismatches[0]?.migratedValue).toBeNull();
    }
  });

  it('rejects invalid proof noun envelopes', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GenesisEquivalenceReading(null);
    }).toThrow(/fields/);
    expect(() => new GenesisEquivalenceReading({
      readingId: 'legacy',
      facts: [
        nodeFact('node:a', 'visible'),
        nodeFact('node:a', 'visible'),
      ],
    })).toThrow(/duplicates visible fact/);
    expect(() => new GenesisEquivalenceMismatch({
      kind: 'missing',
      factKind: 'node',
      factKey: 'node:a',
      fieldPath: 'visibility',
      legacyValue: null,
      migratedValue: null,
      boundary: null,
    })).toThrow(/missing mismatches/);
  });

  it('rejects invalid proof noun fields before comparison', () => {
    expect(boundary().toKey()).toBe(['writer:a', 'patch:a:0', '0'].join('\0'));
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GenesisEquivalenceBoundary(null);
    }).toThrow(/fields/);
    expect(() => new GenesisEquivalenceBoundary({
      writerId: '',
      patchId: 'patch:a:0',
      operationIndex: 0,
    })).toThrow(/writerId/);
    expect(() => new GenesisEquivalenceBoundary({
      writerId: 'writer:a',
      patchId: 'patch:a:0',
      operationIndex: -1,
    })).toThrow(/operationIndex/);

    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GenesisEquivalenceComparisonBasis(null);
    }).toThrow(/fields/);
    expect(() => new GenesisEquivalenceComparisonBasis({
      // @ts-expect-error exercising runtime validation
      legacyBasis: 'legacy',
      migratedBasis: new GraphModelMigrationBasis({
        graphId: 'graph:source',
        basisId: 'basis:migrated',
      }),
    })).toThrow(/legacyBasis/);

    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GenesisEquivalenceReadingFact(null);
    }).toThrow(/fields/);
    expect(() => new GenesisEquivalenceReadingFact({
      // @ts-expect-error exercising runtime validation
      kind: 'unsupported',
      factKey: 'node:a',
      fieldPath: 'visibility',
      value: 'visible',
      boundary: null,
    })).toThrow(/kind/);
    expect(() => new GenesisEquivalenceReadingFact({
      kind: 'node',
      factKey: '',
      fieldPath: 'visibility',
      value: 'visible',
      boundary: null,
    })).toThrow(/factKey/);
    expect(() => new GenesisEquivalenceReadingFact({
      kind: 'node',
      factKey: 'node:a',
      fieldPath: 'visibility',
      // @ts-expect-error exercising runtime validation
      value: 1,
      boundary: null,
    })).toThrow(/value/);
    expect(() => new GenesisEquivalenceReadingFact({
      kind: 'node',
      factKey: 'node:a',
      fieldPath: 'visibility',
      value: 'visible',
      // @ts-expect-error exercising runtime validation
      boundary: 'boundary',
    })).toThrow(/boundary/);

    expect(() => new GenesisEquivalenceReading({
      readingId: '',
      facts: [],
    })).toThrow(/readingId/);
    expect(() => new GenesisEquivalenceReading({
      readingId: 'legacy',
      // @ts-expect-error exercising runtime validation
      facts: null,
    })).toThrow(/facts/);
    expect(() => new GenesisEquivalenceReading({
      readingId: 'legacy',
      // @ts-expect-error exercising runtime validation
      facts: ['fact'],
    })).toThrow(/facts/);

    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GenesisEquivalenceProofSummary(null);
    }).toThrow(/fields/);
    expect(() => new GenesisEquivalenceProofSummary({
      // @ts-expect-error exercising runtime validation
      basis: 'basis',
      legacyFactCount: 1,
      migratedFactCount: 1,
      mismatchCount: 0,
    })).toThrow(/basis/);
    expect(() => new GenesisEquivalenceProofSummary({
      basis: basis(),
      legacyFactCount: -1,
      migratedFactCount: 1,
      mismatchCount: 0,
    })).toThrow(/legacyFactCount/);
  });

  it('rejects inconsistent proof result envelopes', () => {
    const matchingBasis = basis();
    const matchingSummary = summary(matchingBasis, 1);

    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GenesisEquivalenceProofSuccess(null);
    }).toThrow(/fields/);
    expect(() => new GenesisEquivalenceProofSuccess({
      // @ts-expect-error exercising runtime validation
      basis: 'basis',
      summary: summary(matchingBasis, 0),
    })).toThrow(/basis/);
    expect(() => new GenesisEquivalenceProofSuccess({
      basis: matchingBasis,
      // @ts-expect-error exercising runtime validation
      summary: 'summary',
    })).toThrow(/summary/);
    expect(() => new GenesisEquivalenceProofSuccess({
      basis: matchingBasis,
      summary: matchingSummary,
    })).toThrow(/zero mismatches/);

    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GenesisEquivalenceProofFailure(null);
    }).toThrow(/fields/);
    expect(() => new GenesisEquivalenceProofFailure({
      basis: matchingBasis,
      summary: matchingSummary,
      mismatches: [],
    })).toThrow(/contain mismatches/);
    expect(() => new GenesisEquivalenceProofFailure({
      basis: matchingBasis,
      summary: matchingSummary,
      // @ts-expect-error exercising runtime validation
      mismatches: null,
    })).toThrow(/mismatches/);
    expect(() => new GenesisEquivalenceProofFailure({
      basis: matchingBasis,
      summary: matchingSummary,
      // @ts-expect-error exercising runtime validation
      mismatches: ['mismatch'],
    })).toThrow(/mismatches/);
    expect(() => new GenesisEquivalenceProofFailure({
      basis: matchingBasis,
      summary: summary(matchingBasis, 2),
      mismatches: [missingMismatch()],
    })).toThrow(/count/);
    expect(() => new GenesisEquivalenceProofFailure({
      basis: matchingBasis,
      summary: summary(otherBasis(), 1),
      mismatches: [missingMismatch()],
    })).toThrow(/basis/);
  });
});

function proof(): GenesisEquivalenceProof {
  return new GenesisEquivalenceProof();
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

function otherBasis(): GenesisEquivalenceComparisonBasis {
  return new GenesisEquivalenceComparisonBasis({
    legacyBasis: new GraphModelMigrationBasis({
      graphId: 'graph:other',
      basisId: 'basis:legacy',
    }),
    migratedBasis: new GraphModelMigrationBasis({
      graphId: 'graph:other',
      basisId: 'basis:migrated',
    }),
  });
}

function summary(
  summaryBasis: GenesisEquivalenceComparisonBasis,
  mismatchCount: number,
): GenesisEquivalenceProofSummary {
  return new GenesisEquivalenceProofSummary({
    basis: summaryBasis,
    legacyFactCount: 1,
    migratedFactCount: 1,
    mismatchCount,
  });
}

function missingMismatch(): GenesisEquivalenceMismatch {
  return new GenesisEquivalenceMismatch({
    kind: 'missing',
    factKind: 'node',
    factKey: 'node:a',
    fieldPath: 'visibility',
    legacyValue: 'visible',
    migratedValue: null,
    boundary: null,
  });
}

function reading(
  readingId: string,
  facts: readonly GenesisEquivalenceReadingFact[],
): GenesisEquivalenceReading {
  return new GenesisEquivalenceReading({ readingId, facts });
}

function nodeFact(factKey: string, value: string): GenesisEquivalenceReadingFact {
  return fact('node', factKey, 'visibility', value);
}

function boundary(): GenesisEquivalenceBoundary {
  return new GenesisEquivalenceBoundary({
    writerId: 'writer:a',
    patchId: 'patch:a:0',
    operationIndex: 0,
  });
}

function fact(
  kind: GenesisEquivalenceReadingFactKind,
  factKey: string,
  fieldPath: string,
  value: string,
): GenesisEquivalenceReadingFact {
  return new GenesisEquivalenceReadingFact({
    kind,
    factKey,
    fieldPath,
    value,
    boundary: boundary(),
  });
}
