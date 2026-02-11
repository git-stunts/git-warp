import { describe, it, expect } from 'vitest';
import { renderSeekView, formatStructuralDiff } from '../../../src/visualization/renderers/ascii/seek.js';
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';

describe('renderSeekView', () => {
  it('renders seek status with multiple writers', () => {
    const payload = {
      graph: 'sandbox',
      tick: 1,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 9,
      edges: 12,
      patchCount: 6,
      perWriter: {
        alice: { ticks: [1, 2], tipSha: '5f14fc7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        bob: { ticks: [1, 2], tipSha: '575d6f8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        charlie: { ticks: [1], tipSha: '6804b59aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('SEEK');
    expect(output).toContain('GRAPH: sandbox');
    expect(output).toContain('POSITION: tick 1 of 2');
    expect(output).toContain('alice');
    expect(output).toContain('bob');
    expect(output).toContain('charlie');
    expect(output).toContain('9 nodes, 12 edges');
  });

  it('renders seek status at tick 0 (empty state)', () => {
    const payload = {
      graph: 'test',
      tick: 0,
      maxTick: 3,
      ticks: [1, 2, 3],
      nodes: 0,
      edges: 0,
      patchCount: 0,
      perWriter: {
        alice: { ticks: [1, 2, 3], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('POSITION: tick 0 of 3');
    expect(output).toContain('0 nodes, 0 edges');
    // Current tick shown as [0] in header
    expect(output).toContain('[0]');
  });

  it('renders seek at latest tick', () => {
    const payload = {
      graph: 'mydb',
      tick: 5,
      maxTick: 5,
      ticks: [1, 2, 3, 4, 5],
      nodes: 100,
      edges: 200,
      patchCount: 15,
      perWriter: {
        writer1: { ticks: [1, 3, 5], tipSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('POSITION: tick 5 of 5');
    expect(output).toContain('100 nodes, 200 edges');
    expect(output).toContain('[5]');
  });

  it('renders with single writer', () => {
    const payload = {
      graph: 'solo',
      tick: 2,
      maxTick: 3,
      ticks: [1, 2, 3],
      nodes: 5,
      edges: 3,
      patchCount: 2,
      perWriter: {
        alice: { ticks: [1, 2, 3], tipSha: 'cccccccccccccccccccccccccccccccccccccccc' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('GRAPH: solo');
    expect(output).toContain('alice');
    expect(output).toContain('5 nodes, 3 edges');
    expect(output).toContain('[2]');
  });

  it('handles empty graph (no ticks)', () => {
    const payload = {
      graph: 'empty',
      tick: 0,
      maxTick: 0,
      ticks: [],
      nodes: 0,
      edges: 0,
      patchCount: 0,
      perWriter: {},
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('POSITION: tick 0 of 0');
    expect(output).toContain('0 nodes, 0 edges');
    expect(output).toContain('(no ticks)');
  });

  it('renders singular labels for 1 node, 1 edge, 1 patch', () => {
    const payload = {
      graph: 'tiny',
      tick: 1,
      maxTick: 1,
      ticks: [1],
      nodes: 1,
      edges: 1,
      patchCount: 1,
      perWriter: {
        alice: { ticks: [1], tipSha: 'dddddddddddddddddddddddddddddddddddddd' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('1 node, 1 edge, 1 patch');
  });

  it('accepts perWriter as a Map', () => {
    const perWriter = new Map([
      ['alice', { ticks: [1, 2], tipSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }],
    ]);

    const payload = {
      graph: 'maptest',
      tick: 1,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 3,
      edges: 2,
      patchCount: 1,
      perWriter,
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('alice');
    expect(output).toContain('3 nodes, 2 edges');
  });

  it('does not duplicate tick 0 when ticks already contains 0', () => {
    const payload = {
      graph: 'zero',
      tick: 0,
      maxTick: 2,
      ticks: [0, 1, 2],
      nodes: 0,
      edges: 0,
      patchCount: 0,
      perWriter: {
        alice: { ticks: [1, 2], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // [0] should appear exactly once in the header (no duplicate column)
    const matches = output.match(/\[0\]/g) || [];
    expect(matches.length).toBe(1);
  });

  it('shows relative offsets in column headers', () => {
    const payload = {
      graph: 'offsets',
      tick: 2,
      maxTick: 4,
      ticks: [1, 2, 3, 4],
      nodes: 5,
      edges: 3,
      patchCount: 3,
      perWriter: {
        alice: { ticks: [1, 2, 3, 4], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // Header should contain relative labels and the current tick
    expect(output).toContain('[2]');
    expect(output).toContain('-1');
    expect(output).toContain('+1');
    expect(output).toContain('+2');
  });

  it('shows included markers (filled) and excluded markers (open)', () => {
    const payload = {
      graph: 'markers',
      tick: 1,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 5,
      edges: 3,
      patchCount: 2,
      perWriter: {
        alice: {
          ticks: [1, 2],
          tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          tickShas: { 1: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 2: 'cccccccccccccccccccccccccccccccccccccccc' },
        },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // Should contain filled dot (●) for included patch and open circle (○) for excluded
    expect(output).toContain('\u25CF'); // ●
    expect(output).toContain('\u25CB'); // ○
    // SHA should be from tick 1 (the included tick), not the tip
    expect(output).toContain('bbbbbbb');
  });

  it('renders state deltas when diff is provided', () => {
    const payload = {
      graph: 'delta',
      tick: 2,
      maxTick: 4,
      ticks: [1, 2, 3, 4],
      nodes: 10,
      edges: 15,
      patchCount: 6,
      diff: { nodes: 1, edges: 3 },
      perWriter: {
        alice: { ticks: [1, 2, 3, 4], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('State: 10 nodes (+1), 15 edges (+3), 6 patches');
  });

  it('renders a per-writer tick receipt section when tickReceipt is provided', () => {
    const payload = {
      graph: 'receipt',
      tick: 1,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 3,
      edges: 2,
      patchCount: 2,
      tickReceipt: {
        alice: {
          sha: 'deadbeefaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          opSummary: { NodeAdd: 1, EdgeAdd: 2, PropSet: 0, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
        },
        bob: {
          sha: 'cafebabeaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          opSummary: { NodeAdd: 0, EdgeAdd: 0, PropSet: 2, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
        },
      },
      perWriter: {
        alice: { ticks: [1, 2], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        bob: { ticks: [1], tipSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('Tick 1:');
    expect(output).toContain('deadbee');
    expect(output).toContain('cafebab');
    expect(output).toContain('+1node');
    expect(output).toContain('+2edge');
    expect(output).toContain('~2prop');
  });

  it('shows current tick marker when tick is not in ticks array', () => {
    // Edge case: cursor references a tick that is absent from ticks
    // (e.g. saved cursor after writer refs changed). The renderer must
    // still show [5] in the header, not fall back to [0].
    const payload = {
      graph: 'orphan',
      tick: 5,
      maxTick: 10,
      ticks: [1, 2, 3, 4, 6, 7, 8, 9, 10],
      nodes: 3,
      edges: 1,
      patchCount: 2,
      perWriter: {
        alice: { ticks: [1, 3, 6, 9], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // The current tick should appear as [5] in the header
    expect(output).toContain('[5]');
    // Should NOT show [0] as current tick
    expect(output).not.toMatch(/\[0\]/);
  });

  it('shows current tick marker when many ticks exceed window and tick is missing', () => {
    // More than MAX_COLS (9) ticks, and currentTick is absent from array
    const payload = {
      graph: 'big',
      tick: 7,
      maxTick: 20,
      ticks: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      nodes: 10,
      edges: 5,
      patchCount: 8,
      perWriter: {
        alice: { ticks: [1, 5, 10, 15, 20], tipSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // The current tick 7 should appear as [7] in the header
    expect(output).toContain('[7]');
  });

  it('renders structural diff section with baseline header', () => {
    const payload = {
      graph: 'difftest',
      tick: 2,
      maxTick: 3,
      ticks: [1, 2, 3],
      nodes: 5,
      edges: 2,
      patchCount: 3,
      perWriter: { alice: { ticks: [1, 2, 3] } },
      structuralDiff: {
        nodes: { added: ['user:dave'], removed: [] },
        edges: { added: [{ from: 'user:alice', to: 'user:dave', label: 'follows' }], removed: [] },
        props: { set: [{ key: 'k', nodeId: 'user:dave', propKey: 'role', oldValue: undefined, newValue: 'admin' }], removed: [] },
      },
      diffBaseline: 'tick',
      baselineTick: 1,
      truncated: false,
      totalChanges: 3,
      shownChanges: 3,
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('Changes (baseline: tick 1):');
    expect(output).toContain('+ node user:dave');
    expect(output).toContain('+ edge user:alice -[follows]-> user:dave');
    expect(output).toContain('~ user:dave.role:');
  });

  it('renders structural diff with empty baseline', () => {
    const payload = {
      graph: 'first',
      tick: 1,
      maxTick: 1,
      ticks: [1],
      nodes: 2,
      edges: 0,
      patchCount: 1,
      perWriter: { alice: { ticks: [1] } },
      structuralDiff: {
        nodes: { added: ['n1', 'n2'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      },
      diffBaseline: 'empty',
      baselineTick: null,
      truncated: false,
      totalChanges: 2,
      shownChanges: 2,
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('Changes (baseline: empty):');
    expect(output).toContain('+ node n1');
    expect(output).toContain('+ node n2');
  });

  it('renders truncation message when structural diff is truncated', () => {
    const payload = {
      graph: 'trunc',
      tick: 2,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 100,
      edges: 50,
      patchCount: 5,
      perWriter: { alice: { ticks: [1, 2] } },
      structuralDiff: {
        nodes: { added: ['n1', 'n2', 'n3'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      },
      diffBaseline: 'tick',
      baselineTick: 1,
      truncated: true,
      totalChanges: 500,
      shownChanges: 3,
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('... and 497 more changes (use --diff-limit to increase)');
  });

  it('omits structural diff section when structuralDiff is null', () => {
    const payload = {
      graph: 'nodiff',
      tick: 1,
      maxTick: 1,
      ticks: [1],
      nodes: 3,
      edges: 0,
      patchCount: 1,
      perWriter: { alice: { ticks: [1] } },
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).not.toContain('Changes');
  });

  it('renders removal entries with - prefix', () => {
    const payload = {
      graph: 'removals',
      tick: 1,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 1,
      edges: 0,
      patchCount: 2,
      perWriter: { alice: { ticks: [1, 2] } },
      structuralDiff: {
        nodes: { added: [], removed: ['user:gone'] },
        edges: { added: [], removed: [{ from: 'a', to: 'b', label: 'link' }] },
        props: { set: [], removed: [{ key: 'k', nodeId: 'user:gone', propKey: 'role', oldValue: 'admin' }] },
      },
      diffBaseline: 'tick',
      baselineTick: 2,
      truncated: false,
      totalChanges: 3,
      shownChanges: 3,
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('- node user:gone');
    expect(output).toContain('- edge a -[link]-> b');
    expect(output).toContain('- user:gone.role:');
  });
});

describe('formatStructuralDiff', () => {
  it('returns empty string when no structuralDiff', () => {
    expect(formatStructuralDiff(/** @type {*} */ ({}))).toBe('');
    expect(formatStructuralDiff(/** @type {*} */ ({ structuralDiff: null }))).toBe('');
  });

  it('formats structural diff as plain text', () => {
    /** @type {*} */
    const payload = {
      structuralDiff: {
        nodes: { added: ['n1'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      },
      diffBaseline: 'empty',
      baselineTick: null,
      truncated: false,
      totalChanges: 1,
      shownChanges: 1,
    };

    const output = stripAnsi(formatStructuralDiff(payload));
    expect(output).toContain('Changes (baseline: empty):');
    expect(output).toContain('+ node n1');
  });
});

describe('structural diff edge cases', () => {
  it('shows combined truncation message when both display and data truncation active', () => {
    // 25 entries in data (more than MAX_DIFF_LINES=20), AND marked as data-truncated
    const added = Array.from({ length: 25 }, (_, i) => `n${i}`);
    const payload = {
      graph: 'combo',
      tick: 2,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 100,
      edges: 0,
      patchCount: 2,
      perWriter: { alice: { ticks: [1, 2] } },
      structuralDiff: {
        nodes: { added, removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      },
      diffBaseline: 'tick',
      baselineTick: 1,
      truncated: true,
      totalChanges: 500,
      shownChanges: 25,
    };

    const output = stripAnsi(renderSeekView(payload));
    // Should mention the total and the --diff-limit hint
    expect(output).toContain('480 more changes');
    expect(output).toContain('500 total');
    expect(output).toContain('--diff-limit');
  });

  it('never produces negative "more changes" count', () => {
    // Edge case: entries in data are fewer than maxLines, but marked truncated
    // with totalChanges smaller than shownChanges (pathological input)
    const payload = {
      graph: 'neg',
      tick: 2,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 3,
      edges: 0,
      patchCount: 1,
      perWriter: { alice: { ticks: [1, 2] } },
      structuralDiff: {
        nodes: { added: ['n1', 'n2', 'n3'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      },
      diffBaseline: 'tick',
      baselineTick: 1,
      truncated: true,
      totalChanges: 2,  // less than actual entries (3) — pathological
      shownChanges: 3,
    };

    const output = stripAnsi(renderSeekView(payload));
    // Must not contain a negative number of remaining changes
    expect(output).not.toMatch(/-\d+ more changes/);
  });

  it('renders structural diff on latest action payload', () => {
    const payload = {
      graph: 'latest-test',
      action: 'latest',
      tick: 3,
      maxTick: 3,
      ticks: [1, 2, 3],
      nodes: 5,
      edges: 2,
      patchCount: 3,
      perWriter: { alice: { ticks: [1, 2, 3] } },
      structuralDiff: {
        nodes: { added: ['n3'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      },
      diffBaseline: 'tick',
      baselineTick: 2,
      truncated: false,
      totalChanges: 1,
      shownChanges: 1,
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('Changes (baseline: tick 2):');
    expect(output).toContain('+ node n3');
  });

  it('renders structural diff on load action payload', () => {
    const payload = {
      graph: 'load-test',
      action: 'load',
      name: 'snap1',
      tick: 2,
      maxTick: 3,
      ticks: [1, 2, 3],
      nodes: 4,
      edges: 1,
      patchCount: 2,
      perWriter: { alice: { ticks: [1, 2, 3] } },
      structuralDiff: {
        nodes: { added: [], removed: ['n3'] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      },
      diffBaseline: 'tick',
      baselineTick: 3,
      truncated: false,
      totalChanges: 1,
      shownChanges: 1,
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('Changes (baseline: tick 3):');
    expect(output).toContain('- node n3');
  });
});
