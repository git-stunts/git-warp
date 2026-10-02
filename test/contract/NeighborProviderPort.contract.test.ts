/**
 * Contract tests for NeighborProviderPort.
 *
 * Every provider implementation must satisfy these contracts.
 * Run the same battery against AdjacencyNeighborProvider (sync)
 * BitmapNeighborProvider (async-local, commit DAG — unlabeled only),
 * and the logical bitmap provider (labeled graph edges).
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  makeFixture, makeAdjacencyProvider, makeLogicalBitmapProvider, type GraphFixture,
  F6_BOTH_DIRECTION_DEDUP,
  F7_MULTILABEL_SAME_NEIGHBOR,
  F9_UNICODE_CODEPOINT_ORDER,
  F10_PROTO_POLLUTION,
} from '../helpers/fixtureDsl.ts';
import BitmapNeighborProvider from '../../src/domain/services/index/BitmapNeighborProvider.ts';
import BitmapIndexReader from '../../src/domain/services/index/BitmapIndexReader.ts';
import PatchError from '../../src/domain/errors/PatchError.ts';
import type NeighborProviderPort from '../../src/ports/NeighborProviderPort.ts';
import MockIndexStorage from '../helpers/MockIndexStorage.ts';

type ProviderFactory = (fixture: GraphFixture) => NeighborProviderPort;
afterEach(() => { vi.restoreAllMocks(); });

// ── Build providers ─────────────────────────────────────────────────────────

/**
 * Creates a mock BitmapIndexReader that stores edges in-memory
 * using the same fixture, but only supports label=''.
 * This lets us run contract tests against BitmapNeighborProvider
 * without a real Git repo.
 */
function makeMockBitmapProvider(fixture: GraphFixture): BitmapNeighborProvider {
  const fwd = new Map<string, Set<string>>();
  const rev = new Map<string, Set<string>>();
  const allNodes = new Set(fixture.nodes);
  for (const { from, to } of fixture.edges) {
    fwd.set(from, new Set([...(fwd.get(from) ?? []), to]));
    rev.set(to, new Set([...(rev.get(to) ?? []), from]));
  }

  // Exercise the real provider with a typed reader; commit ancestry carries no labels.
  const reader = new BitmapIndexReader({ indexStore: new MockIndexStorage() });
  vi.spyOn(reader, 'getChildren').mockImplementation(async sha => [...(fwd.get(sha) ?? [])].sort());
  vi.spyOn(reader, 'getParents').mockImplementation(async sha => [...(rev.get(sha) ?? [])].sort());
  vi.spyOn(reader, 'lookupId').mockImplementation(async sha => allNodes.has(sha) ? 1 : undefined);
  return new BitmapNeighborProvider({ indexReader: reader });
}

// ── Contract suite factory ──────────────────────────────────────────────────

function contractSuite(providerName: string, makeProvider: ProviderFactory, defaultLabel: string) {
  describe(`NeighborProviderPort contract: ${providerName}`, () => {
    // ── Sorting contract ──────────────────────────────────────────────

    describe('sorting', () => {
      it('returns edges sorted by (neighborId, label) with codepoint comparison', async () => {
        const fixture = makeFixture({
          nodes: ['root', 'z', 'a', 'm'],
          edges: [
            { from: 'root', to: 'z' },
            { from: 'root', to: 'a' },
            { from: 'root', to: 'm' },
          ],
        });
        const provider = makeProvider(fixture);
        const result = await provider.getNeighbors('root', 'out');

        const ids = result.map((e) => e.neighborId);
        expect(ids).toEqual(['a', 'm', 'z']);
      });

      it('sorts unicode by codepoint (F9)', async () => {
        const provider = makeProvider(F9_UNICODE_CODEPOINT_ORDER);
        const result = await provider.getNeighbors('S', 'out');

        // A (65) < a (97) < ä (228)
        const ids = result.map((e) => e.neighborId);
        expect(ids).toEqual(['A', 'a', 'ä']);
      });
    });

    // ── Direction contract ────────────────────────────────────────────

    describe('direction', () => {
      it('"out" returns only outgoing edges', async () => {
        const fixture = makeFixture({
          nodes: ['A', 'B', 'C'],
          edges: [
            { from: 'A', to: 'B' },
            { from: 'C', to: 'A' },
          ],
        });
        const provider = makeProvider(fixture);
        const out = await provider.getNeighbors('A', 'out');
        expect(out.map((e) => e.neighborId)).toEqual(['B']);
      });

      it('"in" returns only incoming edges', async () => {
        const fixture = makeFixture({
          nodes: ['A', 'B', 'C'],
          edges: [
            { from: 'A', to: 'B' },
            { from: 'C', to: 'A' },
          ],
        });
        const provider = makeProvider(fixture);
        const inc = await provider.getNeighbors('A', 'in');
        expect(inc.map((e) => e.neighborId)).toEqual(['C']);
      });

      it('"both" returns union deduped by (neighborId, label)', async () => {
        const fixture = makeFixture({
          nodes: ['A', 'B'],
          edges: [
            { from: 'A', to: 'B' },
            { from: 'B', to: 'A' },
          ],
        });
        const provider = makeProvider(fixture);
        const both = await provider.getNeighbors('A', 'both');
        // B appears as outgoing and incoming — dedup to one entry
        expect(both).toEqual([{ neighborId: 'B', label: defaultLabel }]);
      });
    });

    // ── Unknown node contract ─────────────────────────────────────────

    describe('unknown nodes', () => {
      it('getNeighbors returns [] for unknown nodeId (no throw)', async () => {
        const fixture = makeFixture({
          nodes: ['A'],
          edges: [],
        });
        const provider = makeProvider(fixture);
        const result = await provider.getNeighbors('NONEXISTENT', 'out');
        expect(result).toEqual([]);
      });

      it('hasNode returns false for unknown nodeId', async () => {
        const fixture = makeFixture({
          nodes: ['A'],
          edges: [],
        });
        const provider = makeProvider(fixture);
        expect(await provider.hasNode('NONEXISTENT')).toBe(false);
      });

      it('hasNode returns true for known nodeId', async () => {
        const fixture = makeFixture({
          nodes: ['A'],
          edges: [],
        });
        const provider = makeProvider(fixture);
        expect(await provider.hasNode('A')).toBe(true);
      });
    });

    // ── Backend label contract ──────────────────────────────

    describe('backend label semantics', () => {
      it('preserves logical fixture labels or emits the commit-DAG sentinel', async () => {
        const fixture = makeFixture({
          nodes: ['A', 'B'],
          edges: [{ from: 'A', to: 'B' }],
        });
        const provider = makeProvider(fixture);
        const result = await provider.getNeighbors('A', 'out');
        // The fixture explicitly normalizes an omitted logical label to e.
        expect(fixture.edges).toEqual([{ from: 'A', to: 'B', label: 'e' }]);
        expect(result).toEqual([{ neighborId: 'B', label: defaultLabel }]);
      });
    });

    // ── Proto-pollution safety (F10) ──────────────────────────────────

    describe('proto pollution safety (F10)', () => {
      it('handles __proto__, constructor, toString as node IDs', async () => {
        const provider = makeProvider(F10_PROTO_POLLUTION);

        // Lookups work normally
        expect(await provider.hasNode('__proto__')).toBe(true);
        expect(await provider.hasNode('constructor')).toBe(true);
        expect(await provider.hasNode('toString')).toBe(true);

        // Edges resolve
        const out = await provider.getNeighbors('node:1', 'out');
        expect(out.length).toBeGreaterThan(0);
        expect(out[0]?.neighborId).toBe('__proto__');

        // Object.prototype not mutated
        expect(Reflect.has(Object.prototype, 'polluted')).toBe(false);
        expect(({}).constructor).toBe(Object);
      });
    });
  });
}

// ── Label-specific contract (only for label-aware providers) ────────────────

function labelContractSuite(providerName: string, makeProvider: ProviderFactory) {
  describe(`NeighborProviderPort label contract: ${providerName}`, () => {
    it('label filter with undefined returns all edges', async () => {
      const provider = makeProvider(F7_MULTILABEL_SAME_NEIGHBOR);
      const result = await provider.getNeighbors('A', 'out');
      expect(result).toEqual([
        { neighborId: 'B', label: 'manages' },
        { neighborId: 'B', label: 'owns' },
      ]);
    });

    it('label filter with single label returns only matching', async () => {
      const provider = makeProvider(F7_MULTILABEL_SAME_NEIGHBOR);
      const result = await provider.getNeighbors('A', 'out', { labels: new Set(['owns']) });
      expect(result).toEqual([{ neighborId: 'B', label: 'owns' }]);
    });

    it('label filter with multiple labels returns union', async () => {
      const provider = makeProvider(F7_MULTILABEL_SAME_NEIGHBOR);
      const result = await provider.getNeighbors('A', 'out', {
        labels: new Set(['manages', 'owns']),
      });
      expect(result).toEqual([
        { neighborId: 'B', label: 'manages' },
        { neighborId: 'B', label: 'owns' },
      ]);
    });

    it('label filter with unknown label returns []', async () => {
      const provider = makeProvider(F7_MULTILABEL_SAME_NEIGHBOR);
      const result = await provider.getNeighbors('A', 'out', { labels: new Set(['nonexistent']) });
      expect(result).toEqual([]);
    });

    it('"both" direction dedup with labels (F6)', async () => {
      const provider = makeProvider(F6_BOTH_DIRECTION_DEDUP);
      const result = await provider.getNeighbors('A', 'both');

      // A's outgoing: (B,x), (C,x)
      // A's incoming: (B,x), (B,y)
      // Merged + dedup by (neighborId, label): (B,x), (B,y), (C,x)
      expect(result).toEqual([
        { neighborId: 'B', label: 'x' },
        { neighborId: 'B', label: 'y' },
        { neighborId: 'C', label: 'x' },
      ]);
    });

    it('same neighbor with multiple labels returns one entry per label', async () => {
      const provider = makeProvider(F7_MULTILABEL_SAME_NEIGHBOR);
      const result = await provider.getNeighbors('A', 'out');
      // Two edges, same neighbor, different labels
      expect(result.length).toBe(2);
      expect(result[0]?.neighborId).toBe('B');
      expect(result[1]?.neighborId).toBe('B');
      expect(result[0]?.label).not.toBe(result[1]?.label);
    });
  });
}

// ── BitmapNeighborProvider-specific label filter contract ────────────────────

function bitmapLabelFilterSuite() {
  describe('BitmapNeighborProvider label filter (commit DAG — unlabeled only)', () => {
    it('returns [] when labels filter has no empty string', async () => {
      const fixture = makeFixture({
        nodes: ['A', 'B'],
        edges: [{ from: 'A', to: 'B' }],
      });
      const provider = makeMockBitmapProvider(fixture);
      const result = await provider.getNeighbors('A', 'out', { labels: new Set(['manages']) });
      expect(result).toEqual([]);
    });

    it('returns results when labels filter includes empty string', async () => {
      const fixture = makeFixture({
        nodes: ['A', 'B'],
        edges: [{ from: 'A', to: 'B' }],
      });
      const provider = makeMockBitmapProvider(fixture);
      const result = await provider.getNeighbors('A', 'out', { labels: new Set(['']) });
      expect(result).toEqual([{ neighborId: 'B', label: '' }]);
    });
  });
}

// ── Run suites ──────────────────────────────────────────────────────────────

// Logical graph edges preserve fixture labels; commit ancestry alone uses ''.
contractSuite('AdjacencyNeighborProvider', makeAdjacencyProvider, 'e');
contractSuite('BitmapNeighborProvider (mock)', makeMockBitmapProvider, '');
contractSuite('LogicalBitmapNeighborProvider', makeLogicalBitmapProvider, 'e');

// Only label-aware providers run the label contract
labelContractSuite('AdjacencyNeighborProvider', makeAdjacencyProvider);
labelContractSuite('LogicalBitmapNeighborProvider', makeLogicalBitmapProvider);

// Bitmap-specific label filter behavior
bitmapLabelFilterSuite();

// A commit-DAG sentinel is not an admissible logical EdgeAdd label.
it('rejects an empty logical edge label at the runtime admission boundary', () => {
  const fixture = makeFixture({
    nodes: ['A', 'B'], edges: [{ from: 'A', to: 'B', label: '' }],
  });
  expect(() => makeLogicalBitmapProvider(fixture)).toThrow(PatchError);
});
