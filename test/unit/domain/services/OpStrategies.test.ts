import { describe, expect, it } from 'vitest';

import { OP_STRATEGIES } from '../../../../src/domain/services/OpStrategies.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { encodeEdgeKey, encodePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import type { EventId } from '../../../../src/domain/utils/EventId.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import type { MutablePatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';
import type Op from '../../../../src/domain/types/ops/Op.ts';

function eventId(lamport: number, writerId: string): EventId {
  return { lamport, writerId, patchSha: `patch-${writerId}-${lamport}`, opIndex: 0 };
}

function dot(writerId: string, counter: number): Dot {
  return new Dot(writerId, counter);
}

function emptyDiff(): MutablePatchDiff {
  return {
    nodesAdded: [],
    nodesRemoved: [],
    edgesAdded: [],
    edgesRemoved: [],
    propsChanged: [],
  };
}

/**
 * Builds an op that deliberately violates its own field contract.
 *
 * The concrete Op classes reject these at construction, which is the point:
 * these tests exercise `validate` as the reducer's boundary guard, so the
 * malformed shape has to reach it unconstructed. This is the only place a
 * cast is warranted, and it is confined to this helper.
 */
function malformedOp(fields: Readonly<Record<string, unknown>>): Op {
  return Object.freeze(fields) as unknown as Op;
}

function strategy(name: string) {
  const found = OP_STRATEGIES.get(name);
  if (found === undefined) {
    throw new Error(`missing strategy ${name}`);
  }
  return found;
}

function applied(state: WarpState, name: string, op: Op, at: EventId, diff: MutablePatchDiff): void {
  const target = strategy(name);
  target.validate(op);
  const before = target.snapshot(state, op);
  target.mutate(state, op, at);
  target.accumulate(diff, state, op, before);
}

describe('OP_STRATEGIES registry', () => {
  it('dispatches exactly the canonical op types', () => {
    expect([...OP_STRATEGIES.keys()].sort()).toStrictEqual([
      'BlobValue',
      'EdgeAdd',
      'EdgePropSet',
      'EdgeRemove',
      'NodeAdd',
      'NodePropSet',
      'NodeRemove',
      'PropSet',
    ]);
  });

  it('is frozen, so dispatch cannot be mutated at runtime', () => {
    expect(Object.isFrozen(OP_STRATEGIES)).toBe(true);
  });
});

describe('NodeAddStrategy', () => {
  it('reports a node addition only on the transition into alive', () => {
    const state = WarpState.empty();
    const diff = emptyDiff();
    const op = new NodeAdd('node:one', dot('writer-a', 1));

    applied(state, 'NodeAdd', op, eventId(1, 'writer-a'), diff);

    expect(state.nodeAlive.contains('node:one')).toBe(true);
    expect(diff.nodesAdded).toStrictEqual(['node:one']);
  });

  it('does not report a second addition for an already-alive node', () => {
    const state = WarpState.empty();
    const diff = emptyDiff();
    applied(
      state,
      'NodeAdd',
      new NodeAdd('node:one', dot('writer-a', 1)),
      eventId(1, 'writer-a'),
      diff,
    );

    const second = emptyDiff();
    applied(
      state,
      'NodeAdd',
      new NodeAdd('node:one', dot('writer-b', 1)),
      eventId(2, 'writer-b'),
      second,
    );

    expect(state.nodeAlive.contains('node:one')).toBe(true);
    expect(second.nodesAdded).toStrictEqual([]);
  });

  it('rejects an op with no node identifier', () => {
    const state = WarpState.empty();
    expect(() => strategy('NodeAdd').validate(malformedOp({ dot: dot('writer-a', 1) }))).toThrow();
    expect(state.nodeAlive.contains('node:one')).toBe(false);
  });
});

describe('EdgeAddStrategy edge-birth events', () => {
  const edge = { from: 'node:a', to: 'node:b', label: 'knows' };
  const key = encodeEdgeKey(edge.from, edge.to, edge.label);

  it('records the birth event of a newly alive edge', () => {
    const state = WarpState.empty();
    const diff = emptyDiff();
    const born = eventId(5, 'writer-a');

    applied(state, 'EdgeAdd', new EdgeAdd({ ...edge, dot: dot('writer-a', 1) }), born, diff);

    expect(state.edgeAlive.contains(key)).toBe(true);
    expect(state.edgeBirthEvent.get(key)).toStrictEqual(born);
    expect(diff.edgesAdded).toStrictEqual([edge]);
  });

  it('advances the birth event when a later event re-adds the edge', () => {
    const state = WarpState.empty();
    applied(state, 'EdgeAdd', new EdgeAdd({ ...edge, dot: dot('writer-a', 1) }), eventId(1, 'writer-a'), emptyDiff());

    const later = eventId(9, 'writer-b');
    applied(state, 'EdgeAdd', new EdgeAdd({ ...edge, dot: dot('writer-b', 1) }), later, emptyDiff());

    expect(state.edgeBirthEvent.get(key)).toStrictEqual(later);
  });

  it('keeps the greater birth event when an earlier event arrives out of order', () => {
    const state = WarpState.empty();
    const later = eventId(9, 'writer-b');
    applied(state, 'EdgeAdd', new EdgeAdd({ ...edge, dot: dot('writer-b', 1) }), later, emptyDiff());

    applied(state, 'EdgeAdd', new EdgeAdd({ ...edge, dot: dot('writer-a', 1) }), eventId(1, 'writer-a'), emptyDiff());

    expect(state.edgeBirthEvent.get(key)).toStrictEqual(later);
  });

  it('rejects an edge op missing its label', () => {
    expect(() =>
      strategy('EdgeAdd').validate(
        malformedOp({ from: edge.from, to: edge.to, dot: dot('writer-a', 1) }),
      ),
    ).toThrow();
  });
});

describe('NodeRemoveStrategy', () => {
  it('accepts observed dots as any iterable, not only a Set', () => {
    const state = WarpState.empty();
    const nodeDot = dot('writer-a', 1);
    applied(state, 'NodeAdd', new NodeAdd('node:one', nodeDot), eventId(1, 'writer-a'), emptyDiff());
    const observed = [...state.nodeAlive.getDots('node:one')];
    expect(observed.length).toBeGreaterThan(0);

    const diff = emptyDiff();
    applied(state, 'NodeRemove', new NodeRemove('node:one', observed), eventId(2, 'writer-a'), diff);

    expect(state.nodeAlive.contains('node:one')).toBe(false);
    expect(diff.nodesRemoved).toStrictEqual(['node:one']);
  });

  it('leaves a node alive when the removal observes none of its dots', () => {
    const state = WarpState.empty();
    applied(state, 'NodeAdd', new NodeAdd('node:one', dot('writer-a', 1)), eventId(1, 'writer-a'), emptyDiff());

    const diff = emptyDiff();
    applied(state, 'NodeRemove', new NodeRemove('node:one', ['writer-z:99']), eventId(2, 'writer-a'), diff);

    expect(state.nodeAlive.contains('node:one')).toBe(true);
    expect(diff.nodesRemoved).toStrictEqual([]);
  });
});

describe('NodePropSetStrategy last-writer-wins', () => {
  const key = encodePropKey('node:one', 'title');

  it('records a property and reports the change with no previous value', () => {
    const state = WarpState.empty();
    const diff = emptyDiff();

    applied(state, 'NodePropSet', new NodePropSet('node:one', 'title', 'first'), eventId(1, 'writer-a'), diff);

    expect(state.getEncodedProp(key)?.value).toBe('first');
    expect(diff.propsChanged).toStrictEqual([
      { nodeId: 'node:one', key: 'title', value: 'first', prevValue: undefined },
    ]);
  });

  it('lets a later event overwrite an earlier one', () => {
    const state = WarpState.empty();
    applied(state, 'NodePropSet', new NodePropSet('node:one', 'title', 'first'), eventId(1, 'writer-a'), emptyDiff());

    const diff = emptyDiff();
    applied(state, 'NodePropSet', new NodePropSet('node:one', 'title', 'second'), eventId(5, 'writer-b'), diff);

    expect(state.getEncodedProp(key)?.value).toBe('second');
    expect(diff.propsChanged).toStrictEqual([
      { nodeId: 'node:one', key: 'title', value: 'second', prevValue: 'first' },
    ]);
  });

  it('keeps the later value when an earlier event arrives out of order', () => {
    const state = WarpState.empty();
    applied(state, 'NodePropSet', new NodePropSet('node:one', 'title', 'winner'), eventId(9, 'writer-b'), emptyDiff());

    const diff = emptyDiff();
    applied(state, 'NodePropSet', new NodePropSet('node:one', 'title', 'loser'), eventId(1, 'writer-a'), diff);

    expect(state.getEncodedProp(key)?.value).toBe('winner');
    expect(diff.propsChanged).toStrictEqual([]);
  });

  it('breaks a same-lamport tie deterministically by writer id', () => {
    const lower = WarpState.empty();
    applied(lower, 'NodePropSet', new NodePropSet('node:one', 'title', 'from-a'), eventId(3, 'writer-a'), emptyDiff());
    applied(lower, 'NodePropSet', new NodePropSet('node:one', 'title', 'from-z'), eventId(3, 'writer-z'), emptyDiff());

    const higher = WarpState.empty();
    applied(higher, 'NodePropSet', new NodePropSet('node:one', 'title', 'from-z'), eventId(3, 'writer-z'), emptyDiff());
    applied(higher, 'NodePropSet', new NodePropSet('node:one', 'title', 'from-a'), eventId(3, 'writer-a'), emptyDiff());

    // Order of arrival must not change the converged value.
    expect(lower.getEncodedProp(key)?.value).toBe(higher.getEncodedProp(key)?.value);
  });

  it('reports no change when the same value is written again', () => {
    const state = WarpState.empty();
    applied(state, 'NodePropSet', new NodePropSet('node:one', 'title', 'same'), eventId(1, 'writer-a'), emptyDiff());

    const diff = emptyDiff();
    applied(state, 'NodePropSet', new NodePropSet('node:one', 'title', 'same'), eventId(2, 'writer-a'), diff);

    expect(diff.propsChanged).toStrictEqual([]);
  });

  it('rejects an op with an empty key at construction', () => {
    expect(() => new NodePropSet('node:one', '', 'value')).toThrow();
  });
});

describe('EdgePropSetStrategy', () => {
  it('stores an edge property under its own key space', () => {
    const state = WarpState.empty();
    const diff = emptyDiff();
    const op = new EdgePropSet({ from: 'node:a', to: 'node:b', label: 'knows', key: 'since', value: 2026 });

    applied(state, 'EdgePropSet', op, eventId(1, 'writer-a'), diff);

    expect(diff.propsChanged).toHaveLength(1);
    expect(diff.propsChanged[0]?.key).toBe('since');
    expect(diff.propsChanged[0]?.value).toBe(2026);
  });
});
