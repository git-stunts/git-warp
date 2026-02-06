/**
 * Snapshot tests for ASCII visualization renderers.
 *
 * These tests ensure that changes to the visual output of renderInfoView and
 * renderCheckView are intentional and reviewed via snapshot diffs.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderInfoView } from '../../../src/visualization/renderers/ascii/info.js';
import { renderCheckView } from '../../../src/visualization/renderers/ascii/check.js';
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';

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
});
