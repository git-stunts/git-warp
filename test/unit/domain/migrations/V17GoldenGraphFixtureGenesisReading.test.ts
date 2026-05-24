import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import V17GoldenGraphFixtureGenesisReading
  from '../../../../src/domain/migrations/V17GoldenGraphFixtureGenesisReading.ts';
import V17GoldenGraphFixtureManifest, {
  V17GoldenContentFact,
  V17GoldenEdgeFact,
  V17GoldenGraphFixtureVisibleFact,
  V17GoldenGraphFixtureWriterChain,
  V17GoldenMultiWriterFact,
  V17GoldenNodeFact,
  V17GoldenPropertyFact,
  V17GoldenRemovalFact,
} from '../../../../src/domain/migrations/V17GoldenGraphFixtureManifest.ts';
import { parseV17GoldenGraphFixtureManifestJson }
  from '../../../../src/infrastructure/adapters/V17GoldenGraphFixtureManifestJsonAdapter.ts';

const FIXTURE_MANIFEST_PATH = resolve('fixtures/v17/graph-model-golden/manifest.json');

describe('V17GoldenGraphFixtureGenesisReading', () => {
  it('projects the v17 golden fixture manifest into genesis equivalence facts', async () => {
    const manifest = parseV17GoldenGraphFixtureManifestJson(
      await readFile(FIXTURE_MANIFEST_PATH, 'utf8'),
    );

    const reading = new V17GoldenGraphFixtureGenesisReading().build(manifest);

    expect(reading.readingId).toBe('v17-golden-fixture:v17-golden-graph-model-001');
    expect(reading.facts.map((fact) => fact.toKey())).toEqual([
      'content-attachment\0node:alpha:_content\0payload.oid',
      'edge\0node:alpha->node:beta:relates\0visibility',
      'node\0node:alpha\0visibility',
      'node\0node:removed\0visibility',
      'property\0node:alpha:title\0value',
      'property\0writers:alice+bob\0coverage',
    ]);
    expect(reading.facts.map((fact) => fact.boundary?.writerId)).toEqual([
      'alice',
      'bob',
      'bob',
      'bob',
      'alice',
      'alice',
    ]);
    expect(reading.facts.find((fact) => fact.factKey === 'node:alpha:title')?.value)
      .toBe('migration-source:node:alpha\0title');
  });

  it('rejects malformed genesis reading inputs through domain errors', () => {
    const builder = new V17GoldenGraphFixtureGenesisReading();

    expect(() => {
      // @ts-expect-error exercising runtime validation
      builder.build(null);
    }).toThrow(/manifest/);
    expect(() => builder.build(manifestWithBaseVisibleFacts()))
      .toThrow(/unsupported v17 fixture visible fact kind/);
    expect(() => builder.build(manifestWithBadPropertyKey()))
      .toThrow(/owner:property/);
    expect(() => builder.build(manifestWithoutWriterChains()))
      .toThrow(/writer chain evidence/);
  });
});

function manifestWithBaseVisibleFacts(): V17GoldenGraphFixtureManifest {
  return new V17GoldenGraphFixtureManifest({
    fixtureId: 'fixture:base-facts',
    graphId: 'v17-golden-graph',
    sourceVersion: '17.0.1',
    generator: 'unit-test',
    bundlePath: 'v17-golden-graph.bundle',
    writerChains: [writerChain()],
    visibleFacts: visibleFacts(),
  });
}

function manifestWithoutWriterChains(): V17GoldenGraphFixtureManifest {
  return new V17GoldenGraphFixtureManifest({
    fixtureId: 'fixture:no-writers',
    graphId: 'v17-golden-graph',
    sourceVersion: '17.0.1',
    generator: 'unit-test',
    bundlePath: 'v17-golden-graph.bundle',
    writerChains: [],
    visibleFacts: typedVisibleFacts(),
  });
}

function manifestWithBadPropertyKey(): V17GoldenGraphFixtureManifest {
  return new V17GoldenGraphFixtureManifest({
    fixtureId: 'fixture:bad-property',
    graphId: 'v17-golden-graph',
    sourceVersion: '17.0.1',
    generator: 'unit-test',
    bundlePath: 'v17-golden-graph.bundle',
    writerChains: [writerChain()],
    visibleFacts: Object.freeze([
      new V17GoldenNodeFact({ key: 'node:alpha', description: 'node' }),
      new V17GoldenEdgeFact({ key: 'edge:alpha-beta', description: 'edge' }),
      new V17GoldenPropertyFact({ key: 'title', description: 'title' }),
      new V17GoldenContentFact({ key: 'node:alpha:_content', description: 'content' }),
      new V17GoldenRemovalFact({ key: 'node:removed', description: 'removed' }),
      new V17GoldenMultiWriterFact({ key: 'writers:alice+bob', description: 'multi' }),
    ]),
  });
}

function writerChain(): V17GoldenGraphFixtureWriterChain {
  return new V17GoldenGraphFixtureWriterChain({
    writerId: 'alice',
    refName: 'refs/warp/v17-golden-graph/writers/alice',
    expectedHead: '1111111111111111111111111111111111111111',
    patchCount: 1,
  });
}

function visibleFacts(): readonly V17GoldenGraphFixtureVisibleFact[] {
  return Object.freeze([
    visibleFact('node', 'node:alpha'),
    visibleFact('edge', 'edge:alpha-beta'),
    visibleFact('property', 'node:alpha:title'),
    visibleFact('content', 'node:alpha:_content'),
    visibleFact('removal', 'node:removed'),
    visibleFact('multi-writer', 'writers:alice+bob'),
  ]);
}

function typedVisibleFacts(): readonly V17GoldenGraphFixtureVisibleFact[] {
  return Object.freeze([
    new V17GoldenNodeFact({ key: 'node:alpha', description: 'node' }),
    new V17GoldenEdgeFact({ key: 'edge:alpha-beta', description: 'edge' }),
    new V17GoldenPropertyFact({ key: 'node:alpha:title', description: 'title' }),
    new V17GoldenContentFact({ key: 'node:alpha:_content', description: 'content' }),
    new V17GoldenRemovalFact({ key: 'node:removed', description: 'removed' }),
    new V17GoldenMultiWriterFact({ key: 'writers:alice+bob', description: 'multi' }),
  ]);
}

function visibleFact(
  kind: 'node' | 'edge' | 'property' | 'content' | 'removal' | 'multi-writer',
  key: string,
): V17GoldenGraphFixtureVisibleFact {
  return new V17GoldenGraphFixtureVisibleFact({
    kind,
    key,
    description: `${kind}:${key}`,
  });
}
