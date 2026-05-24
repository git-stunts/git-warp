import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import V17GoldenGraphFixtureGenesisReading
  from '../../../../src/domain/migrations/V17GoldenGraphFixtureGenesisReading.ts';
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
  });
});
