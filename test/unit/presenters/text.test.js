import { describe, it, expect } from 'vitest';
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';
import {
  renderInfo,
  renderQuery,
  renderPath,
  renderCheck,
  renderHistory,
  renderError,
  renderMaterialize,
  renderInstallHooks,
  renderSeek,
} from '../../../bin/presenters/text.js';

describe('renderInfo', () => {
  it('renders repo and graphs', () => {
    const payload = {
      repo: '/tmp/test',
      graphs: [
        { name: 'default', writers: { count: 2 }, checkpoint: { sha: 'abc123' }, coverage: null, cursor: null },
      ],
    };
    const out = stripAnsi(renderInfo(payload));
    expect(out).toContain('Repo: /tmp/test');
    expect(out).toContain('Graphs: 1');
    expect(out).toContain('- default writers=2');
    expect(out).toContain('checkpoint: abc123');
  });

  it('renders cursor info when active', () => {
    const payload = {
      repo: '/tmp/test',
      graphs: [
        { name: 'g', cursor: { active: true, tick: 5, mode: 'tick' } },
      ],
    };
    const out = renderInfo(payload);
    expect(out).toContain('cursor: tick 5 (tick)');
  });
});

describe('renderQuery', () => {
  it('renders graph, state, and nodes', () => {
    const payload = {
      graph: 'default',
      stateHash: 'abc',
      nodes: [
        { id: 'user:alice', props: { name: 'Alice' } },
        { id: 'user:bob', props: {} },
      ],
    };
    const out = renderQuery(payload);
    expect(out).toContain('Graph: default');
    expect(out).toContain('Nodes: 2');
    expect(out).toContain('- user:alice');
    expect(out).toContain('props: {"name":"Alice"}');
    expect(out).not.toContain('props: {}');
  });
});

describe('renderPath', () => {
  it('renders path details', () => {
    const payload = { graph: 'g', from: 'a', to: 'b', found: true, length: 2, path: ['a', 'x', 'b'] };
    const out = renderPath(payload);
    expect(out).toContain('Found: yes');
    expect(out).toContain('Path: a -> x -> b');
  });

  it('omits path when not found', () => {
    const payload = { graph: 'g', from: 'a', to: 'b', found: false, length: 0, path: [] };
    const out = renderPath(payload);
    expect(out).toContain('Found: no');
    expect(out).not.toContain('Path:');
  });
});

describe('renderCheck', () => {
  it('renders health and writers', () => {
    const payload = {
      graph: 'g',
      health: { status: 'ok' },
      status: null,
      checkpoint: { sha: 'ckpt', ageSeconds: 120 },
      writers: { count: 1, heads: [{ writerId: 'alice', sha: 'abc' }] },
      coverage: null,
      gc: null,
      hook: null,
    };
    const out = stripAnsi(renderCheck(payload));
    expect(out).toContain('Health: ok');
    expect(out).toContain('Checkpoint: ckpt');
    expect(out).toContain('- alice: abc');
  });

  it('renders status block when present', () => {
    const payload = {
      graph: 'g',
      health: { status: 'ok' },
      status: { cachedState: 'fresh', patchesSinceCheckpoint: 3, tombstoneRatio: 0.1, writers: 2 },
      checkpoint: null,
      writers: { count: 2, heads: [] },
      coverage: null,
      gc: null,
      hook: null,
    };
    const out = stripAnsi(renderCheck(payload));
    expect(out).toContain('Cached State: fresh');
    expect(out).toContain('Tombstone Ratio: 0.10');
  });

  it('renders hook status', () => {
    const payload = {
      graph: 'g',
      health: { status: 'ok' },
      status: null,
      checkpoint: null,
      writers: { count: 0, heads: [] },
      coverage: null,
      gc: null,
      hook: { installed: true, current: true, version: '1.0.0' },
    };
    const out = stripAnsi(renderCheck(payload));
    expect(out).toContain('Hook: installed (v1.0.0) — up to date');
  });
});

describe('renderHistory', () => {
  it('renders entries', () => {
    const payload = {
      graph: 'g',
      writer: 'alice',
      entries: [{ sha: 'abc123', lamport: 1, opCount: 3 }],
      nodeFilter: null,
    };
    const out = renderHistory(payload);
    expect(out).toContain('Writer: alice');
    expect(out).toContain('Entries: 1');
    expect(out).toContain('abc123 (lamport: 1, ops: 3)');
  });

  it('shows node filter when present', () => {
    const payload = {
      graph: 'g',
      writer: 'alice',
      entries: [],
      nodeFilter: 'user:*',
    };
    const out = renderHistory(payload);
    expect(out).toContain('Node Filter: user:*');
  });
});

describe('renderError', () => {
  it('formats error message', () => {
    expect(renderError({ error: { message: 'boom' } })).toBe('Error: boom\n');
  });
});

describe('renderMaterialize', () => {
  it('renders empty repo', () => {
    expect(renderMaterialize({ graphs: [] })).toBe('No graphs found in repo.\n');
  });

  it('renders graph entries', () => {
    const payload = {
      graphs: [
        { graph: 'g1', nodes: 5, edges: 3, checkpoint: 'abc' },
        { graph: 'g2', error: 'broken' },
      ],
    };
    const out = renderMaterialize(payload);
    expect(out).toContain('g1: 5 nodes, 3 edges, checkpoint abc');
    expect(out).toContain('g2: error — broken');
  });
});

describe('renderInstallHooks', () => {
  it('renders up-to-date', () => {
    const out = renderInstallHooks({ action: 'up-to-date', version: '1.0', hookPath: '/hooks/post-commit' });
    expect(out).toContain('already up to date');
    expect(out).toContain('v1.0');
  });

  it('renders skipped', () => {
    expect(renderInstallHooks({ action: 'skipped' })).toContain('skipped');
  });

  it('renders install with backup', () => {
    const out = renderInstallHooks({ action: 'installed', version: '2.0', hookPath: '/hooks/post-commit', backupPath: '/hooks/post-commit.bak' });
    expect(out).toContain('installed (v2.0)');
    expect(out).toContain('Backup: /hooks/post-commit.bak');
  });
});

describe('renderSeek', () => {
  it('renders clear-cache', () => {
    expect(renderSeek({ action: 'clear-cache', message: 'Cache cleared' })).toBe('Cache cleared\n');
  });

  it('renders empty list', () => {
    expect(renderSeek({ action: 'list', cursors: [] })).toBe('No saved cursors.\n');
  });

  it('renders cursor list', () => {
    const out = renderSeek({
      action: 'list',
      activeTick: 3,
      cursors: [
        { name: 'snap', tick: 3 },
        { name: 'other', tick: 5 },
      ],
    });
    expect(out).toContain('snap: tick 3 (active)');
    expect(out).toContain('other: tick 5');
    expect(out).not.toContain('other: tick 5 (active)');
  });

  it('renders drop', () => {
    const out = renderSeek({ action: 'drop', name: 'snap', tick: 3 });
    expect(out).toContain('Dropped cursor "snap" (was at tick 3)');
  });

  it('renders save', () => {
    const out = renderSeek({ action: 'save', name: 'snap', tick: 3 });
    expect(out).toContain('Saved cursor "snap" at tick 3');
  });

  it('renders tick with state counts', () => {
    const out = renderSeek({
      action: 'tick',
      graph: 'g',
      tick: 2,
      maxTick: 5,
      nodes: 3,
      edges: 1,
      patchCount: 2,
      diff: { nodes: 1, edges: 0 },
    });
    expect(out).toContain('g: tick 2 of 5');
    expect(out).toContain('3 nodes (+1)');
    expect(out).toContain('1 edge');
    expect(out).toContain('2 patches');
  });

  it('renders latest', () => {
    const out = renderSeek({
      action: 'latest',
      graph: 'g',
      maxTick: 5,
      nodes: 10,
      edges: 3,
      diff: null,
    });
    expect(out).toContain('returned to present');
    expect(out).toContain('tick 5');
  });

  it('renders status with no active cursor', () => {
    const out = renderSeek({
      action: 'status',
      graph: 'g',
      cursor: { active: false },
      ticks: [1, 2, 3],
    });
    expect(out).toContain('no cursor active');
    expect(out).toContain('3 ticks available');
  });
});
