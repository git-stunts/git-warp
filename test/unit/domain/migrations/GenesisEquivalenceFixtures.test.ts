import { describe, expect, it } from 'vitest';

import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceProof
  from '../../../../src/domain/migrations/GenesisEquivalenceProof.ts';
import GenesisEquivalenceProofFailure
  from '../../../../src/domain/migrations/GenesisEquivalenceProofFailure.ts';
import GenesisEquivalenceProofSuccess
  from '../../../../src/domain/migrations/GenesisEquivalenceProofSuccess.ts';
import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import {
  divergentPropertyFixture,
  genesisEquivalenceFixtureCases,
  removedNodeFixture,
} from './GenesisEquivalenceFixtures.ts';

describe('genesis equivalence fixtures', () => {
  it('proves equal fixture readings for node, edge, content, removal, and multi-writer cases', () => {
    const successCases = genesisEquivalenceFixtureCases()
      .filter((fixtureCase) => fixtureCase.expectedResult === 'success');

    expect(successCases.map((fixtureCase) => fixtureCase.name)).toEqual([
      'node lifecycle with property',
      'edge lifecycle with property',
      'content attachment metadata',
      'removed node hides later property',
      'multi-writer non-coordinated order',
    ]);
    for (const fixtureCase of successCases) {
      const result = new GenesisEquivalenceProof().compare(
        basis(),
        fixtureCase.legacyReading,
        fixtureCase.migratedReading,
      );
      expect(result).toBeInstanceOf(GenesisEquivalenceProofSuccess);
    }
  });

  it('keeps removed node facts absent from visible readings', () => {
    const fixtureCase = removedNodeFixture();
    const legacyKeys = fixtureCase.legacyReading.facts.map((fact) => fact.toKey());
    const migratedKeys = fixtureCase.migratedReading.facts.map((fact) => fact.toKey());

    expect(legacyKeys).toEqual(['node\0node:survivor\0visibility']);
    expect(migratedKeys).toEqual(legacyKeys);
  });

  it('uses divergent fixture output to produce a structured mismatch', () => {
    const fixtureCase = divergentPropertyFixture();
    const result = new GenesisEquivalenceProof().compare(
      basis(),
      fixtureCase.legacyReading,
      fixtureCase.migratedReading,
    );

    expect(result).toBeInstanceOf(GenesisEquivalenceProofFailure);
    if (result instanceof GenesisEquivalenceProofFailure) {
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]?.kind).toBe('changed');
      expect(result.mismatches[0]?.factKind).toBe('property');
      expect(result.mismatches[0]?.factKey).toBe('node:article/title');
      expect(result.mismatches[0]?.legacyValue).toBe('Legacy');
      expect(result.mismatches[0]?.migratedValue).toBe('Migrated');
    }
  });

  it('emits deterministic fixture fact keys', () => {
    const fixtureKeys = genesisEquivalenceFixtureCases()
      .map((fixtureCase) => fixtureCase.legacyReading.facts.map((fact) => fact.toKey()).join('|'));

    expect(fixtureKeys).toEqual([
      'node\0node:article\0visibility|property\0node:article/title\0value',
      'edge\0node:article->node:topic/mentions\0visibility|property\0edge:mentions/weight\0value',
      'content-attachment\0node:article\0payload.mime|content-attachment\0node:article\0payload.oid|content-attachment\0node:article\0payload.size',
      'node\0node:survivor\0visibility',
      'edge\0node:left->node:right/links\0visibility|node\0node:left\0visibility|node\0node:right\0visibility',
      'property\0node:article/title\0value',
    ]);
  });
});

function basis(): GenesisEquivalenceComparisonBasis {
  return new GenesisEquivalenceComparisonBasis({
    legacyBasis: new GraphModelMigrationBasis({
      graphId: 'graph:fixture',
      basisId: 'basis:legacy',
    }),
    migratedBasis: new GraphModelMigrationBasis({
      graphId: 'graph:fixture',
      basisId: 'basis:migrated',
    }),
  });
}
