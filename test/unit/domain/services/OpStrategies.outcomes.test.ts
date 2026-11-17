/**
 * OpStrategies: remove owner identity (#193) and receipt outcomes for every
 * strategy. The strategies receive raw `OpLike` operands through the
 * exported `OP_STRATEGIES` boundary, so malformed fixtures use that type.
 */

import { describe, expect, it } from 'vitest';

import { OP_STRATEGIES } from '../../../../src/domain/services/OpStrategies.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { encodeEdgeKey, encodeEdgePropKey, encodePropKey, EDGE_PROP_PREFIX } from '../../../../src/domain/services/KeyCodec.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import OpApplied from '../../../../src/domain/types/ops/OpApplied.ts';
import OpRedundant from '../../../../src/domain/types/ops/OpRedundant.ts';
import type { MutablePatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import type OpStrategy from '../../../../src/domain/services/OpStrategy.ts';
import type { OpLike } from '../../../../src/domain/services/OpLike.ts'; // nosemgrep: ts-no-like-types -- 0025C

const SHA = 'deadbeef';

function at(lamport: number): EventId {
  return new EventId(lamport, 'writer-a', SHA, 0);
}

function emptyDiff(): MutablePatchDiff {
  return { nodesAdded: [], nodesRemoved: [], edgesAdded: [], edgesRemoved: [], propsChanged: [] };
}

function strategy(name: string): OpStrategy {
  const found = OP_STRATEGIES.get(name);
  if (found === undefined) {
    throw new PatchError(`missing strategy ${name}`);
  }
  return found;
}

function apply(state: WarpState, op: OpLike, eventId: EventId): MutablePatchDiff { // nosemgrep: ts-no-like-types -- 0025C
  const target = strategy(op.type);
  const diff = emptyDiff();
  target.validate(op);
  const before = target.snapshot(state, op);
  target.mutate(state, op, eventId);
  target.accumulate(diff, state, op, before);
  return diff;
}

const NODE_DOT = new Dot('writer-a', 1);
const EDGE_DOT = new Dot('writer-a', 2);
const nodeAdd: OpLike = { type: 'NodeAdd', node: 'node:one', dot: NODE_DOT }; // nosemgrep: ts-no-like-types -- 0025C
const edgeAdd: OpLike = { type: 'EdgeAdd', from: 'node:a', to: 'node:b', label: 'rel', dot: EDGE_DOT }; // nosemgrep: ts-no-like-types -- 0025C
const EDGE_KEY = encodeEdgeKey('node:a', 'node:b', 'rel');

describe('remove strategies require owner identity (#193)', () => {
  const ownerless: readonly OpLike[] = [ // nosemgrep: ts-no-like-types -- 0025C
    { type: 'NodeRemove', observedDots: [] },
    { type: 'EdgeRemove', observedDots: [] },
    { type: 'EdgeRemove', from: 'node:a', to: 'node:b', observedDots: [] },
  ];

  it('refuses an ownerless remove in validate, mutate and outcome', () => {
    for (const op of ownerless) {
      const target = strategy(op.type);
      const state = WarpState.empty();
      expect(() => target.validate(op)).toThrow(PatchError);
      expect(() => target.mutate(state, op, at(1))).toThrow(PatchError);
      expect(() => target.outcome(state, op, at(1))).toThrow(PatchError);
    }
  });

  it('names the missing field in the error', () => {
    expect(() => strategy('EdgeRemove').validate(ownerless[2] ?? nodeAdd))
      .toThrow("EdgeRemove op requires 'label' to be a string, got undefined");
  });
});

describe('NodeRemoveStrategy outcome', () => {
  it('reports applied for an effective remove and redundant for an empty one', () => {
    const state = WarpState.empty();
    apply(state, nodeAdd, at(1));
    const target = strategy('NodeRemove');
    const effective: OpLike = { type: 'NodeRemove', node: 'node:one', observedDots: new Set([encodeDot(NODE_DOT)]) }; // nosemgrep: ts-no-like-types -- 0025C
    const empty: OpLike = { type: 'NodeRemove', node: 'node:one', observedDots: [] }; // nosemgrep: ts-no-like-types -- 0025C
    expect(target.outcome(state, effective, at(2))).toEqual(new OpApplied('node:one'));
    expect(target.outcome(state, empty, at(2))).toEqual(new OpRedundant('node:one'));
  });
});

describe('EdgeRemoveStrategy', () => {
  it('removes an observed edge and records its remove event', () => {
    const state = WarpState.empty();
    apply(state, edgeAdd, at(1));
    const remove: OpLike = { type: 'EdgeRemove', from: 'node:a', to: 'node:b', label: 'rel', observedDots: [encodeDot(EDGE_DOT)] }; // nosemgrep: ts-no-like-types -- 0025C
    expect(strategy('EdgeRemove').outcome(state, remove, at(2))).toEqual(new OpApplied(EDGE_KEY));
    const diff = apply(state, remove, at(2));
    expect(state.edgeAlive.contains(EDGE_KEY)).toBe(false);
    expect(state.edgeRemoveEvent.get(EDGE_KEY)).toEqual(at(2));
    expect(diff.edgesRemoved).toStrictEqual([{ from: 'node:a', to: 'node:b', label: 'rel' }]);
  });

  it('treats an empty remove as a redundant no-op with no remove event', () => {
    const state = WarpState.empty();
    apply(state, edgeAdd, at(1));
    const remove: OpLike = { type: 'EdgeRemove', from: 'node:a', to: 'node:b', label: 'rel', observedDots: new Set() }; // nosemgrep: ts-no-like-types -- 0025C
    expect(strategy('EdgeRemove').outcome(state, remove, at(2))).toEqual(new OpRedundant(EDGE_KEY));
    const diff = apply(state, remove, at(2));
    expect(state.edgeAlive.contains(EDGE_KEY)).toBe(true);
    expect(state.edgeRemoveEvent.has(EDGE_KEY)).toBe(false);
    expect(diff.edgesRemoved).toStrictEqual([]);
  });
});

describe('add strategy outcomes', () => {
  it('NodeAdd: applied first, redundant on re-delivery', () => {
    const state = WarpState.empty();
    expect(strategy('NodeAdd').outcome(state, nodeAdd, at(1))).toEqual(new OpApplied('node:one'));
    apply(state, nodeAdd, at(1));
    expect(strategy('NodeAdd').outcome(state, nodeAdd, at(1))).toEqual(new OpRedundant('node:one'));
  });

  it('NodeAdd: mutate refuses a missing node without the validate step', () => {
    const op: OpLike = { type: 'NodeAdd', dot: NODE_DOT }; // nosemgrep: ts-no-like-types -- 0025C
    expect(() => strategy('NodeAdd').mutate(WarpState.empty(), op, at(1))).toThrow(PatchError);
  });

  it('EdgeAdd: applied first, redundant on re-delivery, and a second add is not re-reported', () => {
    const state = WarpState.empty();
    expect(strategy('EdgeAdd').outcome(state, edgeAdd, at(1))).toEqual(new OpApplied(EDGE_KEY));
    expect(apply(state, edgeAdd, at(1)).edgesAdded).toHaveLength(1);
    expect(strategy('EdgeAdd').outcome(state, edgeAdd, at(1))).toEqual(new OpRedundant(EDGE_KEY));
    expect(apply(state, edgeAdd, at(1)).edgesAdded).toStrictEqual([]);
  });
});

describe('property and blob strategy outcomes', () => {
  it('NodePropSet and PropSet report applied on a new key', () => {
    const state = WarpState.empty();
    for (const type of ['NodePropSet', 'PropSet']) {
      const op: OpLike = { type, node: 'node:one', key: 'k', value: 'v' }; // nosemgrep: ts-no-like-types -- 0025C
      expect(strategy(type).outcome(state, op, at(1))).toEqual(new OpApplied(encodePropKey('node:one', 'k')));
    }
  });

  it('PropSet applies a plain node property', () => {
    const state = WarpState.empty();
    const op: OpLike = { type: 'PropSet', node: 'node:one', key: 'k', value: 'v' }; // nosemgrep: ts-no-like-types -- 0025C
    const diff = apply(state, op, at(1));
    expect(state.getNodeProp('node:one', 'k')?.value).toBe('v');
    expect(diff.propsChanged).toHaveLength(1);
  });

  it('PropSet refuses an unnormalized legacy edge-property node', () => {
    const op: OpLike = { type: 'PropSet', node: `${EDGE_PROP_PREFIX}a`, key: 'k', value: 'v' }; // nosemgrep: ts-no-like-types -- 0025C
    expect(() => strategy('PropSet').mutate(WarpState.empty(), op, at(1))).toThrow(PatchError);
  });

  it('EdgePropSet reports applied under the edge property key', () => {
    const op: OpLike = { type: 'EdgePropSet', from: 'node:a', to: 'node:b', label: 'rel', key: 'k', value: 1 }; // nosemgrep: ts-no-like-types -- 0025C
    expect(strategy('EdgePropSet').outcome(WarpState.empty(), op, at(1)))
      .toEqual(new OpApplied(encodeEdgePropKey('node:a', 'node:b', 'rel', 'k')));
  });

  it('BlobValue targets its oid, or the wildcard when the oid is absent', () => {
    const state = WarpState.empty();
    const withOid: OpLike = { type: 'BlobValue', node: 'node:one', oid: 'abc123' }; // nosemgrep: ts-no-like-types -- 0025C
    const withoutOid: OpLike = { type: 'BlobValue' }; // nosemgrep: ts-no-like-types -- 0025C
    expect(strategy('BlobValue').outcome(state, withOid, at(1))).toEqual(new OpApplied('abc123'));
    expect(strategy('BlobValue').outcome(state, withoutOid, at(1))).toEqual(new OpApplied('*'));
    expect(apply(state, withOid, at(1))).toStrictEqual(emptyDiff());
  });
});
