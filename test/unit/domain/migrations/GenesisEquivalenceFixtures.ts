import GenesisEquivalenceBoundary
  from '../../../../src/domain/migrations/GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact, {
  type GenesisEquivalenceReadingFactKind,
} from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import GenesisEquivalenceFixtureCase
  from './GenesisEquivalenceFixtureCase.ts';

/** Returns the first compact genesis-equivalence fixture suite. */
export function genesisEquivalenceFixtureCases(): readonly GenesisEquivalenceFixtureCase[] {
  return Object.freeze([
    nodeLifecycleFixture(),
    edgeLifecycleFixture(),
    contentAttachmentFixture(),
    removedNodeFixture(),
    multiWriterFixture(),
    divergentPropertyFixture(),
  ]);
}

/** Builds a node lifecycle fixture with a visible property. */
export function nodeLifecycleFixture(): GenesisEquivalenceFixtureCase {
  const facts = [
    fact('node', 'node:article', 'visibility', 'visible', boundary('writer:a', 'patch:a:0', 0)),
    fact('property', 'node:article/title', 'value', 'Hello', boundary('writer:a', 'patch:a:1', 0)),
  ];
  return successCase('node lifecycle with property', facts, facts);
}

/** Builds an edge lifecycle fixture with a visible property. */
export function edgeLifecycleFixture(): GenesisEquivalenceFixtureCase {
  const facts = [
    fact('edge', 'node:article->node:topic/mentions', 'visibility', 'visible', boundary('writer:a', 'patch:a:0', 1)),
    fact('property', 'edge:mentions/weight', 'value', '3', boundary('writer:a', 'patch:a:1', 0)),
  ];
  return successCase('edge lifecycle with property', facts, facts);
}

/** Builds a content attachment fixture with metadata and payload identity. */
export function contentAttachmentFixture(): GenesisEquivalenceFixtureCase {
  const facts = [
    fact('content-attachment', 'node:article', 'payload.oid', 'oid:content:a', boundary('writer:a', 'patch:a:2', 0)),
    fact('content-attachment', 'node:article', 'payload.mime', 'text/markdown', boundary('writer:a', 'patch:a:2', 0)),
    fact('content-attachment', 'node:article', 'payload.size', '42', boundary('writer:a', 'patch:a:2', 0)),
  ];
  return successCase('content attachment metadata', facts, facts);
}

/** Builds a removal fixture where a later property on a removed node is hidden. */
export function removedNodeFixture(): GenesisEquivalenceFixtureCase {
  const visibleFacts = [
    fact('node', 'node:survivor', 'visibility', 'visible', boundary('writer:a', 'patch:a:0', 0)),
  ];
  return successCase('removed node hides later property', visibleFacts, visibleFacts);
}

/** Builds a multi-writer fixture with deterministic boundary evidence. */
export function multiWriterFixture(): GenesisEquivalenceFixtureCase {
  const facts = [
    fact('node', 'node:left', 'visibility', 'visible', boundary('writer:a', 'patch:a:0', 0)),
    fact('node', 'node:right', 'visibility', 'visible', boundary('writer:b', 'patch:b:0', 0)),
    fact('edge', 'node:left->node:right/links', 'visibility', 'visible', boundary('writer:b', 'patch:b:1', 0)),
  ];
  return successCase('multi-writer non-coordinated order', facts, facts);
}

/** Builds an intentionally divergent fixture with a changed property value. */
export function divergentPropertyFixture(): GenesisEquivalenceFixtureCase {
  return new GenesisEquivalenceFixtureCase(
    'divergent property value',
    reading('legacy:divergent', [
      fact('property', 'node:article/title', 'value', 'Legacy', boundary('writer:a', 'patch:a:1', 0)),
    ]),
    reading('migrated:divergent', [
      fact('property', 'node:article/title', 'value', 'Migrated', boundary('writer:a', 'patch:a:1', 0)),
    ]),
    'failure',
  );
}

/** Builds a successful fixture case. */
function successCase(
  name: string,
  legacyFacts: readonly GenesisEquivalenceReadingFact[],
  migratedFacts: readonly GenesisEquivalenceReadingFact[],
): GenesisEquivalenceFixtureCase {
  return new GenesisEquivalenceFixtureCase(
    name,
    reading(`legacy:${name}`, legacyFacts),
    reading(`migrated:${name}`, migratedFacts),
    'success',
  );
}

/** Builds a reading from explicit facts. */
function reading(
  readingId: string,
  facts: readonly GenesisEquivalenceReadingFact[],
): GenesisEquivalenceReading {
  return new GenesisEquivalenceReading({ readingId, facts });
}

/** Builds a visible reading fact. */
function fact(
  kind: GenesisEquivalenceReadingFactKind,
  factKey: string,
  fieldPath: string,
  value: string,
  factBoundary: GenesisEquivalenceBoundary,
): GenesisEquivalenceReadingFact {
  return new GenesisEquivalenceReadingFact({
    kind,
    factKey,
    fieldPath,
    value,
    boundary: factBoundary,
  });
}

/** Builds patch boundary evidence for a fixture fact. */
function boundary(
  writerId: string,
  patchId: string,
  operationIndex: number,
): GenesisEquivalenceBoundary {
  return new GenesisEquivalenceBoundary({ writerId, patchId, operationIndex });
}
