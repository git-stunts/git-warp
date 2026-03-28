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
  renderStrand,
  renderDebug,
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

describe('renderStrand', () => {
  it('renders braid metadata on descriptor-oriented strand actions', () => {
    const out = renderStrand({
      graph: 'g',
      strandAction: 'braid',
      strand: {
        schemaVersion: 1,
        strandId: 'ws_demo',
        graphName: 'g',
        createdAt: '2026-03-17T00:00:00Z',
        updatedAt: '2026-03-17T00:05:00Z',
        owner: 'alice',
        scope: 'review',
        lease: { expiresAt: null },
        baseObservation: {
          coordinateVersion: 'frontier-lamport/v1',
          frontier: { alice: 'a'.repeat(40) },
          frontierDigest: 'digest',
          lamportCeiling: null,
        },
        overlay: {
          overlayId: 'ws_demo',
          kind: 'patch-log',
          headPatchSha: 'b'.repeat(40),
          patchCount: 1,
          writable: false,
        },
        braid: {
          readOverlays: [
            {
              strandId: 'ws_support',
              overlayId: 'ws_support',
              kind: 'patch-log',
              headPatchSha: 'c'.repeat(40),
              patchCount: 2,
            },
          ],
        },
        materialization: {
          cacheAuthority: 'derived',
        },
      },
    });

    expect(out).toContain('Strand Action: braid');
    expect(out).toContain('writable=no');
    expect(out).toContain('Braids: ws_support');
  });

  it('renders comparison summaries without adding application semantics', () => {
    const out = renderStrand({
      graph: 'g',
      strandAction: 'compare',
      strandId: 'ws_demo',
      against: 'live',
      comparison: {
        comparisonVersion: 'coordinate-compare/v1',
        comparisonDigest: 'abc123',
        left: {
          requested: { kind: 'strand', strandId: 'ws_demo' },
          resolved: {
            coordinateKind: 'strand',
            patchFrontier: { alice: 'sha1' },
            patchFrontierDigest: 'pf-left',
            lamportFrontier: { alice: 2 },
            lamportFrontierDigest: 'lf-left',
            lamportCeiling: null,
            stateHash: 'state-left',
            patchUniverseDigest: 'pu-left',
            summary: {
              patchCount: 2,
              nodeCount: 1,
              edgeCount: 0,
              nodePropertyCount: 1,
              edgePropertyCount: 0,
            },
          },
        },
        right: {
          requested: { kind: 'live' },
          resolved: {
            coordinateKind: 'frontier',
            patchFrontier: { alice: 'sha2' },
            patchFrontierDigest: 'pf-right',
            lamportFrontier: { alice: 3 },
            lamportFrontierDigest: 'lf-right',
            lamportCeiling: null,
            stateHash: 'state-right',
            patchUniverseDigest: 'pu-right',
            summary: {
              patchCount: 3,
              nodeCount: 1,
              edgeCount: 0,
              nodePropertyCount: 1,
              edgePropertyCount: 0,
            },
          },
        },
        visiblePatchDivergence: {
          sharedCount: 1,
          leftOnlyCount: 1,
          rightOnlyCount: 1,
          leftOnlyPatchShas: ['left-only'],
          rightOnlyPatchShas: ['right-only'],
          target: {
            targetId: 'n1',
            leftCount: 2,
            rightCount: 3,
            sharedCount: 1,
            leftOnlyCount: 1,
            rightOnlyCount: 2,
            leftOnlyPatchShas: ['left-only'],
            rightOnlyPatchShas: ['right-only-a', 'right-only-b'],
          },
        },
        visibleState: {
          comparisonVersion: 'visible-state-compare/v1',
          changed: true,
          summary: {
            left: { nodeCount: 1, edgeCount: 0, nodePropertyCount: 1, edgePropertyCount: 0 },
            right: { nodeCount: 1, edgeCount: 0, nodePropertyCount: 1, edgePropertyCount: 0 },
            nodes: { added: 0, removed: 0 },
            edges: { added: 0, removed: 0 },
            nodeProperties: { added: 0, removed: 0, changed: 1 },
            edgeProperties: { added: 0, removed: 0, changed: 0 },
          },
          nodes: { added: [], removed: [] },
          edges: { added: [], removed: [] },
          nodeProperties: {
            added: [],
            removed: [],
            changed: [{ node: 'n1', key: 'status', leftValue: 'overlay', rightValue: 'live' }],
          },
          edgeProperties: {
            added: [],
            removed: [],
            changed: [],
          },
          target: {
            targetId: 'n1',
            leftExists: true,
            rightExists: true,
            changed: true,
            left: null,
            right: null,
            propertyDelta: {
              added: [],
              removed: [],
              changed: [{ key: 'status', leftValue: 'overlay', rightValue: 'live' }],
            },
            outgoingDelta: { added: [], removed: [] },
            incomingDelta: { added: [], removed: [] },
            contentChanged: false,
          },
        },
      },
    });

    expect(out).toContain('Strand Action: compare');
    expect(out).toContain('Against: live');
    expect(out).toContain('Comparison Digest: abc123');
    expect(out).toContain('Patch Divergence: shared=1 leftOnly=1 rightOnly=1');
    expect(out).toContain('Target State (n1): changed=yes');
  });
});

describe('renderDebug', () => {
  it('renders braid-aware strand context on provenance payloads', () => {
    const out = stripAnsi(renderDebug({
      graph: 'g',
      debugTopic: 'provenance',
      strandId: 'ws_review',
      strand: {
        strandId: 'ws_review',
        baseLamportCeiling: null,
        overlayHeadPatchSha: 'a'.repeat(40),
        overlayPatchCount: 1,
        overlayWritable: false,
        braid: {
          readOverlayCount: 1,
          braidedStrandIds: ['ws_hold'],
        },
      },
      entityId: 'n1',
      lamportCeiling: 2,
      totalPatches: 1,
      returnedPatches: 1,
      truncated: false,
      entries: [],
    }));

    expect(out).toContain('Strand Overlay: head=');
    expect(out).toContain('writable=no');
    expect(out).toContain('Strand Braids: ws_hold');
  });
});
