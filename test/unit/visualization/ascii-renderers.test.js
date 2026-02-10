/**
 * Snapshot tests for ASCII visualization renderers.
 *
 * These tests ensure that changes to the visual output of renderInfoView,
 * renderCheckView, renderMaterializeView, renderHistoryView, and renderPathView
 * are intentional and reviewed via snapshot diffs.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderInfoView as _renderInfoView } from '../../../src/visualization/renderers/ascii/info.js';
import { renderCheckView as _renderCheckView } from '../../../src/visualization/renderers/ascii/check.js';
import { renderMaterializeView as _renderMaterializeView } from '../../../src/visualization/renderers/ascii/materialize.js';
import { renderHistoryView as _renderHistoryView, summarizeOps } from '../../../src/visualization/renderers/ascii/history.js';
import { renderPathView as _renderPathView } from '../../../src/visualization/renderers/ascii/path.js';
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';

/** @type {any} */ const renderInfoView = _renderInfoView;
/** @type {any} */ const renderCheckView = _renderCheckView;
/** @type {any} */ const renderMaterializeView = _renderMaterializeView;
/** @type {any} */ const renderHistoryView = _renderHistoryView;
/** @type {any} */ const renderPathView = _renderPathView;

// Mock Date.now for stable time-based output
const FIXED_NOW = new Date('2025-01-15T12:00:00Z').getTime();

beforeAll(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => FIXED_NOW);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('ASCII Renderers', () => {
  describe('renderInfoView', () => {
    it('renders single graph with writers', () => {
      const mockData = {
        repo: '/test/repo',
        graphs: [
          {
            name: 'test-graph',
            writers: {
              count: 2,
              ids: ['alice', 'bob'],
            },
            writerPatches: {
              alice: 5,
              bob: 3,
            },
            checkpoint: {
              sha: 'abc1234567890abcdef',
              date: '2025-01-15T11:55:00Z', // 5 minutes ago
            },
            coverage: null,
          },
        ],
      };
      const output = stripAnsi(renderInfoView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders multiple graphs', () => {
      const mockData = {
        repo: '/test/repo',
        graphs: [
          {
            name: 'graph-alpha',
            writers: {
              count: 3,
              ids: ['alice', 'bob', 'charlie'],
            },
            writerPatches: {
              alice: 10,
              bob: 5,
              charlie: 2,
            },
            checkpoint: {
              sha: 'aaa1111222233334444',
              date: '2025-01-15T11:00:00Z', // 1 hour ago
            },
            coverage: {
              sha: 'bbb5555666677778888',
            },
          },
          {
            name: 'graph-beta',
            writers: {
              count: 1,
              ids: ['solo-writer'],
            },
            writerPatches: {
              'solo-writer': 1,
            },
            checkpoint: null,
            coverage: null,
          },
        ],
      };
      const output = stripAnsi(renderInfoView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders empty repo', () => {
      const mockData = { repo: '/test/repo', graphs: [] };
      const output = stripAnsi(renderInfoView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders graph with no writers', () => {
      const mockData = {
        repo: '/test/repo',
        graphs: [
          {
            name: 'empty-graph',
            writers: {
              count: 0,
              ids: [],
            },
            writerPatches: {},
            checkpoint: null,
            coverage: null,
          },
        ],
      };
      const output = stripAnsi(renderInfoView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders graph with many writers (truncation)', () => {
      const mockData = {
        repo: '/test/repo',
        graphs: [
          {
            name: 'busy-graph',
            writers: {
              count: 8,
              ids: [
                'writer1',
                'writer2',
                'writer3',
                'writer4',
                'writer5',
                'writer6',
                'writer7',
                'writer8',
              ],
            },
            writerPatches: {
              writer1: 100,
              writer2: 80,
              writer3: 60,
              writer4: 40,
              writer5: 20,
              writer6: 10,
              writer7: 5,
              writer8: 1,
            },
            checkpoint: {
              sha: 'deadbeefcafe123456',
              date: '2025-01-14T12:00:00Z', // 1 day ago
            },
            coverage: null,
          },
        ],
      };
      const output = stripAnsi(renderInfoView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders graph with checkpoint but no sha', () => {
      const mockData = {
        repo: '/test/repo',
        graphs: [
          {
            name: 'no-checkpoint-sha',
            writers: {
              count: 1,
              ids: ['alice'],
            },
            writerPatches: {
              alice: 3,
            },
            checkpoint: {
              sha: null,
              date: null,
            },
            coverage: null,
          },
        ],
      };
      const output = stripAnsi(renderInfoView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('handles null/undefined data gracefully', () => {
      expect(stripAnsi(renderInfoView(null))).toMatchSnapshot();
      expect(stripAnsi(renderInfoView(undefined))).toMatchSnapshot();
      expect(stripAnsi(renderInfoView({}))).toMatchSnapshot();
    });
  });

  describe('renderCheckView', () => {
    it('renders healthy graph', () => {
      const mockData = {
        graph: 'test-graph',
        health: {
          status: 'healthy',
        },
        status: {
          cachedState: 'fresh',
          tombstoneRatio: 0.05,
          patchesSinceCheckpoint: 3,
        },
        writers: {
          heads: [
            { writerId: 'alice', sha: 'abc1234567890' },
            { writerId: 'bob', sha: 'def5678901234' },
          ],
        },
        checkpoint: {
          sha: 'checkpoint123456789',
          ageSeconds: 120, // 2 minutes ago
        },
        coverage: {
          sha: 'coverage987654321',
          missingWriters: [],
        },
        gc: {
          tombstoneRatio: 0.05,
        },
        hook: {
          installed: true,
          current: true,
          version: '7.5.0',
          foreign: false,
        },
      };
      const output = stripAnsi(renderCheckView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders degraded graph with warnings', () => {
      const mockData = {
        graph: 'degraded-graph',
        health: {
          status: 'degraded',
        },
        status: {
          cachedState: 'stale',
          tombstoneRatio: 0.22,
          patchesSinceCheckpoint: 50,
        },
        writers: {
          heads: [
            { writerId: 'alice', sha: 'abc1234567890' },
          ],
        },
        checkpoint: {
          sha: 'oldcheckpoint12345',
          ageSeconds: 1800, // 30 minutes ago
        },
        coverage: {
          sha: 'coverage987654321',
          missingWriters: ['bob', 'charlie'],
        },
        gc: {
          tombstoneRatio: 0.22,
        },
        hook: {
          installed: true,
          current: false,
          version: '7.4.0',
          foreign: false,
        },
      };
      const output = stripAnsi(renderCheckView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders unhealthy graph', () => {
      const mockData = {
        graph: 'unhealthy-graph',
        health: {
          status: 'unhealthy',
        },
        status: {
          cachedState: 'none',
          tombstoneRatio: 0.45,
          patchesSinceCheckpoint: 200,
        },
        writers: {
          heads: [],
        },
        checkpoint: {
          sha: null,
          ageSeconds: null,
        },
        coverage: {
          sha: null,
          missingWriters: [],
        },
        gc: {
          tombstoneRatio: 0.45,
        },
        hook: {
          installed: false,
          current: false,
          version: null,
          foreign: false,
        },
      };
      const output = stripAnsi(renderCheckView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders graph with foreign hook', () => {
      const mockData = {
        graph: 'foreign-hook-graph',
        health: {
          status: 'degraded',
        },
        status: {
          cachedState: 'fresh',
          tombstoneRatio: 0.02,
          patchesSinceCheckpoint: 5,
        },
        writers: {
          heads: [
            { writerId: 'alice', sha: 'abc1234567890' },
          ],
        },
        checkpoint: {
          sha: 'checkpoint123456789',
          ageSeconds: 60,
        },
        coverage: {
          sha: 'coverage987654321',
          missingWriters: [],
        },
        gc: {
          tombstoneRatio: 0.02,
        },
        hook: {
          installed: false,
          current: false,
          version: null,
          foreign: true,
        },
      };
      const output = stripAnsi(renderCheckView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders with no checkpoint', () => {
      const mockData = {
        graph: 'no-checkpoint-graph',
        health: {
          status: 'healthy',
        },
        status: {
          cachedState: 'none',
          tombstoneRatio: 0,
        },
        writers: {
          heads: [
            { writerId: 'alice', sha: 'abc1234567890' },
          ],
        },
        checkpoint: null,
        coverage: null,
        gc: null,
        hook: null,
      };
      const output = stripAnsi(renderCheckView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders with unknown health status', () => {
      const mockData = {
        graph: 'unknown-graph',
        health: null,
        status: null,
        writers: null,
        checkpoint: null,
        coverage: null,
        gc: null,
        hook: null,
      };
      const output = stripAnsi(renderCheckView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders with critical tombstone ratio', () => {
      const mockData = {
        graph: 'tombstone-heavy',
        health: {
          status: 'unhealthy',
        },
        status: {
          cachedState: 'fresh',
          tombstoneRatio: 0.55,
          patchesSinceCheckpoint: 10,
        },
        writers: {
          heads: [
            { writerId: 'cleanup-needed', sha: 'abc1234567890' },
          ],
        },
        checkpoint: {
          sha: 'checkpoint123456789',
          ageSeconds: 7200, // 2 hours ago
        },
        coverage: {
          sha: 'coverage987654321',
          missingWriters: [],
        },
        gc: {
          tombstoneRatio: 0.55,
        },
        hook: {
          installed: true,
          current: true,
          version: '7.5.0',
          foreign: false,
        },
      };
      const output = stripAnsi(renderCheckView(mockData));
      expect(output).toMatchSnapshot();
    });
  });

  describe('renderMaterializeView', () => {
    it('renders single graph materialization', () => {
      const mockData = {
        graphs: [
          {
            graph: 'test-graph',
            nodes: 150,
            edges: 200,
            properties: 450,
            checkpoint: 'abc1234567890abcdef',
            patchCount: 8,
            writers: {
              alice: 5,
              bob: 3,
            },
          },
        ],
      };
      const output = stripAnsi(renderMaterializeView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders multiple graphs materialization', () => {
      const mockData = {
        graphs: [
          {
            graph: 'graph-alpha',
            nodes: 500,
            edges: 1200,
            properties: 1500,
            checkpoint: 'aaa1111222233334444',
            patchCount: 25,
            writers: {
              alice: 10,
              bob: 8,
              charlie: 7,
            },
          },
          {
            graph: 'graph-beta',
            nodes: 50,
            edges: 30,
            properties: 100,
            checkpoint: 'bbb5555666677778888',
            patchCount: 3,
            writers: {
              solo: 3,
            },
          },
        ],
      };
      const output = stripAnsi(renderMaterializeView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders empty repo', () => {
      const mockData = { graphs: [] };
      const output = stripAnsi(renderMaterializeView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders empty graph (0 patches)', () => {
      const mockData = {
        graphs: [
          {
            graph: 'empty-graph',
            nodes: 0,
            edges: 0,
            properties: 0,
            checkpoint: 'empty1234567890abc',
            patchCount: 0,
            writers: {},
          },
        ],
      };
      const output = stripAnsi(renderMaterializeView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders graph with error', () => {
      const mockData = {
        graphs: [
          {
            graph: 'failing-graph',
            error: 'Repository not accessible',
          },
        ],
      };
      const output = stripAnsi(renderMaterializeView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders mixed success and failure', () => {
      const mockData = {
        graphs: [
          {
            graph: 'success-graph',
            nodes: 100,
            edges: 150,
            properties: 300,
            checkpoint: 'success123456789ab',
            patchCount: 10,
            writers: {
              alice: 10,
            },
          },
          {
            graph: 'failure-graph',
            error: 'Permission denied',
          },
        ],
      };
      const output = stripAnsi(renderMaterializeView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders large graph with many nodes', () => {
      const mockData = {
        graphs: [
          {
            graph: 'large-graph',
            nodes: 1000000,
            edges: 5000000,
            properties: 3000000,
            checkpoint: 'large1234567890abc',
            patchCount: 500,
            writers: {
              writer1: 200,
              writer2: 150,
              writer3: 100,
              writer4: 50,
            },
          },
        ],
      };
      const output = stripAnsi(renderMaterializeView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders graph without checkpoint', () => {
      const mockData = {
        graphs: [
          {
            graph: 'no-checkpoint-graph',
            nodes: 10,
            edges: 5,
            properties: 20,
            checkpoint: null,
            patchCount: 2,
            writers: {
              alice: 2,
            },
          },
        ],
      };
      const output = stripAnsi(renderMaterializeView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('handles null/undefined data gracefully', () => {
      expect(stripAnsi(renderMaterializeView(null))).toMatchSnapshot();
      expect(stripAnsi(renderMaterializeView(undefined))).toMatchSnapshot();
      expect(stripAnsi(renderMaterializeView({}))).toMatchSnapshot();
    });

    it('renders noOp state (already materialized)', () => {
      const mockData = {
        graphs: [
          {
            graph: 'up-to-date-graph',
            noOp: true,
            nodes: 42,
            edges: 87,
            properties: 120,
          },
        ],
      };
      const output = stripAnsi(renderMaterializeView(mockData));
      expect(output).toMatchSnapshot();
    });
  });

  describe('renderHistoryView', () => {
    it('renders single writer timeline', () => {
      const mockData = {
        graph: 'test-graph',
        writer: 'alice',
        nodeFilter: null,
        entries: [
          {
            sha: 'abc1234567890abcdef',
            lamport: 1,
            opCount: 3,
            opSummary: { NodeAdd: 2, EdgeAdd: 1, PropSet: 0, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
          },
          {
            sha: 'def4567890abcdef123',
            lamport: 2,
            opCount: 5,
            opSummary: { NodeAdd: 1, EdgeAdd: 2, PropSet: 2, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
          },
          {
            sha: 'ghi7890abcdef123456',
            lamport: 3,
            opCount: 2,
            opSummary: { NodeAdd: 0, EdgeAdd: 0, PropSet: 0, NodeTombstone: 1, EdgeTombstone: 1, BlobValue: 0 },
          },
        ],
      };
      const output = stripAnsi(renderHistoryView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders empty history', () => {
      const mockData = {
        graph: 'test-graph',
        writer: 'alice',
        nodeFilter: null,
        entries: [],
      };
      const output = stripAnsi(renderHistoryView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders history with node filter', () => {
      const mockData = {
        graph: 'test-graph',
        writer: 'alice',
        nodeFilter: 'user:bob',
        entries: [
          {
            sha: 'abc1234567890abcdef',
            lamport: 5,
            opCount: 1,
            opSummary: { NodeAdd: 1, EdgeAdd: 0, PropSet: 0, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
          },
        ],
      };
      const output = stripAnsi(renderHistoryView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders multi-writer timeline', () => {
      const mockData = {
        graph: 'test-graph',
        nodeFilter: null,
        writers: {
          alice: [
            {
              sha: 'abc1234567890abcdef',
              lamport: 1,
              opCount: 2,
              opSummary: { NodeAdd: 2, EdgeAdd: 0, PropSet: 0, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
            },
            {
              sha: 'abc2234567890abcdef',
              lamport: 3,
              opCount: 1,
              opSummary: { NodeAdd: 0, EdgeAdd: 1, PropSet: 0, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
            },
          ],
          bob: [
            {
              sha: 'def4567890abcdef123',
              lamport: 2,
              opCount: 3,
              opSummary: { NodeAdd: 1, EdgeAdd: 1, PropSet: 1, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
            },
            {
              sha: 'def5567890abcdef123',
              lamport: 4,
              opCount: 1,
              opSummary: { NodeAdd: 0, EdgeAdd: 0, PropSet: 1, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
            },
          ],
        },
      };
      const output = stripAnsi(renderHistoryView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders paginated history (default 20 most recent)', () => {
      const entries = [];
      for (let i = 1; i <= 30; i++) {
        entries.push({
          sha: `sha${String(i).padStart(3, '0')}1234567890`,
          lamport: i,
          opCount: 1,
          opSummary: { NodeAdd: 1, EdgeAdd: 0, PropSet: 0, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
        });
      }
      const mockData = {
        graph: 'test-graph',
        writer: 'alice',
        nodeFilter: null,
        entries,
      };
      const output = stripAnsi(renderHistoryView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders single patch', () => {
      const mockData = {
        graph: 'test-graph',
        writer: 'alice',
        nodeFilter: null,
        entries: [
          {
            sha: 'abc1234567890abcdef',
            lamport: 1,
            opCount: 5,
            opSummary: { NodeAdd: 2, EdgeAdd: 2, PropSet: 1, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
          },
        ],
      };
      const output = stripAnsi(renderHistoryView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders patch with many operations', () => {
      const mockData = {
        graph: 'test-graph',
        writer: 'alice',
        nodeFilter: null,
        entries: [
          {
            sha: 'abc1234567890abcdef',
            lamport: 1,
            opCount: 150,
            opSummary: { NodeAdd: 50, EdgeAdd: 40, PropSet: 30, NodeTombstone: 20, EdgeTombstone: 10, BlobValue: 0 },
          },
        ],
      };
      const output = stripAnsi(renderHistoryView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders empty multi-writer timeline', () => {
      const mockData = {
        graph: 'test-graph',
        nodeFilter: null,
        writers: {},
      };
      const output = stripAnsi(renderHistoryView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('handles null/undefined data gracefully', () => {
      expect(stripAnsi(renderHistoryView(null))).toMatchSnapshot();
      expect(stripAnsi(renderHistoryView(undefined))).toMatchSnapshot();
    });

    it('summarizeOps aggregates operation counts correctly', () => {
      const ops = [
        { type: 'NodeAdd' },
        { type: 'NodeAdd' },
        { type: 'EdgeAdd' },
        { type: 'PropSet' },
        { type: 'PropSet' },
        { type: 'PropSet' },
        { type: 'NodeTombstone' },
      ];
      const summary = summarizeOps(ops);
      expect(summary).toEqual({
        NodeAdd: 2,
        EdgeAdd: 1,
        PropSet: 3,
        NodeTombstone: 1,
        EdgeTombstone: 0,
        BlobValue: 0,
      });
    });

    it('renders history entry with raw ops (no precomputed opSummary)', () => {
      const mockData = {
        graph: 'test-graph',
        writer: 'alice',
        nodeFilter: null,
        entries: [
          {
            sha: 'abc1234567890abcdef',
            lamport: 1,
            opCount: 7,
            ops: [
              { type: 'NodeAdd' },
              { type: 'NodeAdd' },
              { type: 'EdgeAdd' },
              { type: 'PropSet' },
              { type: 'PropSet' },
              { type: 'PropSet' },
              { type: 'NodeTombstone' },
            ],
          },
        ],
      };
      const output = stripAnsi(renderHistoryView(mockData));
      expect(output).toMatchSnapshot();
    });
  });

  describe('renderPathView', () => {
    it('renders found path with 3 hops', () => {
      const mockData = {
        graph: 'social-graph',
        from: 'user:alice',
        to: 'user:bob',
        found: true,
        path: ['user:alice', 'user:carol', 'user:dave', 'user:bob'],
        length: 3,
      };
      const output = stripAnsi(renderPathView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders direct path (1 hop)', () => {
      const mockData = {
        graph: 'test-graph',
        from: 'node:a',
        to: 'node:b',
        found: true,
        path: ['node:a', 'node:b'],
        length: 1,
      };
      const output = stripAnsi(renderPathView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders same node (0 hops)', () => {
      const mockData = {
        graph: 'test-graph',
        from: 'user:alice',
        to: 'user:alice',
        found: true,
        path: ['user:alice'],
        length: 0,
      };
      const output = stripAnsi(renderPathView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders no path found', () => {
      const mockData = {
        graph: 'disconnected-graph',
        from: 'island:a',
        to: 'island:b',
        found: false,
        path: [],
        length: -1,
      };
      const output = stripAnsi(renderPathView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders path with edge labels', () => {
      const mockData = {
        graph: 'org-graph',
        from: 'user:alice',
        to: 'user:bob',
        found: true,
        path: ['user:alice', 'user:carol', 'user:bob'],
        length: 2,
        edges: ['manages', 'reports_to'],
      };
      const output = stripAnsi(renderPathView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('renders long path (20 nodes) with wrapping', () => {
      const path = [];
      for (let i = 0; i < 20; i++) {
        path.push(`node:${i}`);
      }
      const mockData = {
        graph: 'chain-graph',
        from: 'node:0',
        to: 'node:19',
        found: true,
        path,
        length: 19,
      };
      const output = stripAnsi(renderPathView(mockData, { terminalWidth: 80 }));
      expect(output).toMatchSnapshot();
    });

    it('renders path with long node IDs', () => {
      const mockData = {
        graph: 'test-graph',
        from: 'this-is-a-very-long-node-id-that-should-be-truncated',
        to: 'another-extremely-long-node-identifier-here',
        found: true,
        path: [
          'this-is-a-very-long-node-id-that-should-be-truncated',
          'middle-node',
          'another-extremely-long-node-identifier-here',
        ],
        length: 2,
      };
      const output = stripAnsi(renderPathView(mockData));
      expect(output).toMatchSnapshot();
    });

    it('handles null/undefined data gracefully', () => {
      expect(stripAnsi(renderPathView(null))).toMatchSnapshot();
      expect(stripAnsi(renderPathView(undefined))).toMatchSnapshot();
    });

    it('renders path with unknown graph', () => {
      const mockData = {
        graph: null,
        from: 'a',
        to: 'b',
        found: true,
        path: ['a', 'b'],
        length: 1,
      };
      const output = stripAnsi(renderPathView(mockData));
      expect(output).toMatchSnapshot();
    });
  });
});
