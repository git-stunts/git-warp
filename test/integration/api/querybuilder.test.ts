import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestRepo } from './helpers/setup.ts';
import type { AggregateResult } from '../../../src/domain/services/query/QueryAggregation.ts';
import type { QueryResult } from '../../../src/domain/services/query/QueryRunner.ts';

type TestRepo = Awaited<ReturnType<typeof createTestRepo>>;
type TestGraph = Awaited<ReturnType<TestRepo['openGraph']>>;

function requireQueryResult(result: AggregateResult | QueryResult): QueryResult {
  if (!('nodes' in result)) {
    throw new Error('QueryBuilder fixture expected a node result');
  }
  return result;
}

describe('API: QueryBuilder', () => {
  let repo: TestRepo;
  let graph: TestGraph;

  beforeAll(async () => {
    repo = await createTestRepo('query');
    graph = await repo.openGraph('test', 'alice');

    // Seed a small graph: users with properties and edges
    const p1 = await graph.createPatch();
    await p1
      .addNode('user:alice')
      .setProperty('user:alice', 'role', 'engineering')
      .setProperty('user:alice', 'level', 'senior')
      .addNode('user:bob')
      .setProperty('user:bob', 'role', 'engineering')
      .setProperty('user:bob', 'level', 'junior')
      .addNode('user:carol')
      .setProperty('user:carol', 'role', 'marketing')
      .addNode('project:alpha')
      .commit();

    const p2 = await graph.createPatch();
    await p2
      .addEdge('user:alice', 'user:bob', 'manages')
      .addEdge('user:alice', 'project:alpha', 'owns')
      .addEdge('user:bob', 'user:carol', 'knows')
      .commit();

    await graph.materialize();
  }, 30_000);

  afterAll(async () => {
    await repo.cleanup();
  });

  it('match glob returns matching nodes', async () => {
    const result = requireQueryResult(
      await graph.query().match('user:*').select(['id']).run(),
    );
    const ids = result.nodes.map((node) => node.id);
    expect(ids).toContain('user:alice');
    expect(ids).toContain('user:bob');
    expect(ids).toContain('user:carol');
    expect(ids).not.toContain('project:alpha');
  });

  it('where filters by property', async () => {
    const result = requireQueryResult(
      await graph
        .query()
        .match('user:*')
        .where({ role: 'engineering' })
        .select(['id'])
        .run(),
    );
    const ids = result.nodes.map((node) => node.id);
    expect(ids).toContain('user:alice');
    expect(ids).toContain('user:bob');
    expect(ids).not.toContain('user:carol');
  });

  it('outgoing traversal follows edges', async () => {
    const result = requireQueryResult(
      await graph
        .query()
        .match('user:alice')
        .outgoing('manages')
        .select(['id'])
        .run(),
    );
    const ids = result.nodes.map((node) => node.id);
    expect(ids).toEqual(['user:bob']);
  });

  it('incoming traversal follows reverse edges', async () => {
    const result = requireQueryResult(
      await graph
        .query()
        .match('user:bob')
        .incoming('manages')
        .select(['id'])
        .run(),
    );
    const ids = result.nodes.map((node) => node.id);
    expect(ids).toEqual(['user:alice']);
  });

  it('chained traversal works', async () => {
    const result = requireQueryResult(
      await graph
        .query()
        .match('user:alice')
        .outgoing('manages')
        .outgoing('knows')
        .select(['id'])
        .run(),
    );
    const ids = result.nodes.map((node) => node.id);
    expect(ids).toEqual(['user:carol']);
  });

  it('select with props returns properties', async () => {
    const result = requireQueryResult(
      await graph
        .query()
        .match('user:alice')
        .select(['id', 'props'])
        .run(),
    );
    const [alice] = result.nodes;
    expect(result.nodes).toHaveLength(1);
    expect(alice?.id).toBe('user:alice');
    expect(alice?.props?.['role']).toBe('engineering');
  });

  it('empty result set when no matches', async () => {
    const result = requireQueryResult(
      await graph
        .query()
        .match('nonexistent:*')
        .select(['id'])
        .run(),
    );
    expect(result.nodes).toHaveLength(0);
  });
});
