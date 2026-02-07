/**
 * Contract test for the ./visualization subpath export.
 *
 * Ensures the public API surface consumed by @git-stunts/git-warp-tui
 * (and any other downstream packages) does not silently break.
 */

import { describe, it, expect } from 'vitest';
import * as viz from '../../../src/visualization/index.js';

describe('visualization subpath export contract', () => {
  const expectedFunctions = [
    // Layout pipeline
    'layoutGraph',
    'rawGraphToGraphData',
    'queryResultToGraphData',
    'pathResultToGraphData',
    'toElkGraph',
    'getDefaultLayoutOptions',
    'runLayout',

    // ASCII renderers
    'renderGraphView',
    'renderInfoView',
    'renderCheckView',
    'renderMaterializeView',
    'renderHistoryView',
    'renderPathView',
    'summarizeOps',
    'createBox',
    'createTable',
    'progressBar',

    // SVG renderer
    'renderSvg',

    // Utils
    'truncate',
    'timeAgo',
    'formatDuration',
    'padRight',
    'padLeft',
    'center',
    'stripAnsi',
  ];

  it.each(expectedFunctions)('exports %s as a function', (name) => {
    expect(typeof viz[name]).toBe('function');
  });

  it('exports colors object', () => {
    expect(viz.colors).toBeDefined();
    expect(typeof viz.colors).toBe('object');
    expect(typeof viz.colors.primary).toBe('function');
    expect(typeof viz.colors.muted).toBe('function');
  });

  it('does not accidentally remove exports', () => {
    const exportedNames = Object.keys(viz).sort();
    for (const name of expectedFunctions) {
      expect(exportedNames).toContain(name);
    }
  });
});
