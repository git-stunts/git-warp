/**
 * Contract tests for NeighborProviderPort.
 *
 * Every provider implementation must satisfy these contracts.
 * Run the same battery against AdjacencyNeighborProvider (sync)
 * and BitmapNeighborProvider (async-local, commit DAG — unlabeled only).
 *
 * When Phase 2 ships labeled bitmap index, add a third provider.
 */

import { describe, it, expect } from 'vitest';
import {
  makeFixture, makeAdjacencyProvider, makeLogicalBitmapProvider,
  F6_BOTH_DIRECTION_DEDUP,
  F7_MULTILABEL_SAME_NEIGHBOR,
  F9_UNICODE_CODEPOINT_ORDER,
  F10_PROTO_POLLUTION,
} from '../helpers/fixtureDsl.js';
import BitmapNeighborProvider from '../../src/domain/services/index/BitmapNeighborProvider.ts';

// ── Build providers ─────────────────────────────────────────────────────────

/**
 * Creates a mock BitmapIndexReader that stores edges in-memory
 * using the same fixture, but only supports label=''.
 * This lets us run contract tests against BitmapNeighborProvider
 * without a real Git repo.
 */
/** @param {*} fixture */
function makeMockBitmapProvider(fixture) {
  const fwd = new Map(); // nodeId → children (Set)
  const rev = new Map(); // nodeId → parents (Set)
  const allNodes = new Set(fixture.nodes);

  for (const { from, to } of fixture.edges) {
    if (!fwd.has(from)) fwd.set(from, new Set());
    fwd.get(from).add(to);
    if (!rev.has(to)) rev.set(to, new Set());
    rev.get(to).add(from);
  }

  const mockReader = {
    getChildren: async (/** @type {string} */ sha) => [...(fwd.get(sha) || [])].sort(),
    getParents: async (/** @type {string} */ sha) => [...(rev.get(sha) || [])].sort(),
    lookupId: async (/** @type {string} */ sha) => allNodes.has(sha) ? 1 : undefined,
  };

  return new BitmapNeighborProvider({ indexReader: /** @type {*} */ (mockReader) });
}

// ── Contract suite factory ──────────────────────────────────────────────────

/** @param {string} providerName @param {(fixture: *) => *} makeProvider */
function contractSuite(providerName, makeProvider) {
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

        const ids = result.map((/** @type {*} */ e) => e.neighborId);
        expect(ids).toEqual(['a', 'm', 'z']);
      });

      it('sorts unicode by codepoint (F9)', async () => {
        const provider = makeProvider(F9_UNICODE_CODEPOINT_ORDER);
        const result = await provider.getNeighbors('S', 'out');

        // A (65) < a (97) < ä (228)
        const ids = result.map((/** @type {*} */ e) => e.neighborId);
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
        expect(out.map((/** @type {*} */ e) => e.neighborId)).toEqual(['B']);
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
        expect(inc.map((/** @type {*} */ e) => e.neighborId)).toEqual(['C']);
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
        expect(both).toEqual([{ neighborId: 'B', label: '' }]);
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

    // ── Unlabeled edge sentinel contract ──────────────────────────────

    describe('unlabeled edges', () => {
      it('uses label="" for edges without explicit label', async () => {
        const fixture = makeFixture({
          nodes: ['A', 'B'],
          edges: [{ from: 'A', to: 'B' }],
        });
        const provider = makeProvider(fixture);
        const result = await provider.getNeighbors('A', 'out');
        expect(result).toEqual([{ neighborId: 'B', label: '' }]);
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
        expect(out[0].neighborId).toBe('__proto__');

        // Object.prototype not mutated
        expect((/** @type {Record<string, unknown>} */ ({}))['polluted']).toBeUndefined();
        expect(({}).constructor).toBe(Object);
      });
    });
  });
}

// ── Label-specific contract (only for label-aware providers) ────────────────

/** @param {string} providerName @param {(fixture: *) => *} makeProvider */
function labelContractSuite(providerName, makeProvider) {
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
      expect(result[0].neighborId).toBe('B');
      expect(result[1].neighborId).toBe('B');
      expect(result[0].label).not.toBe(result[1].label);
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

// All providers must pass the base contract (unlabeled fixtures only)
contractSuite('AdjacencyNeighborProvider', (/** @type {*} */ fixture) => makeAdjacencyProvider(fixture));
contractSuite('BitmapNeighborProvider (mock)', (/** @type {*} */ fixture) => makeMockBitmapProvider(fixture));
contractSuite('LogicalBitmapNeighborProvider', (/** @type {*} */ fixture) => makeLogicalBitmapProvider(fixture));

// Only label-aware providers run the label contract
labelContractSuite('AdjacencyNeighborProvider', (/** @type {*} */ fixture) => makeAdjacencyProvider(fixture));
labelContractSuite('LogicalBitmapNeighborProvider', (/** @type {*} */ fixture) => makeLogicalBitmapProvider(fixture));

// Bitmap-specific label filter behavior
bitmapLabelFilterSuite();
