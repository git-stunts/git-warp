/**
 * The same-patch remove ownership check (#1120): a remove must not list a
 * dot that the same patch adds to a different element. It is the only
 * owner check a patch can make without state, so it runs when a `Patch` is
 * built: at the persisted-patch decode boundary and at sync ingress.
 */

import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import CrossOwnerRemoveError from '../../../../src/domain/errors/CrossOwnerRemoveError.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import { hydrateDecodedPatch } from '../../../../src/domain/services/PatchHydrator.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../../../src/domain/types/ops/unions.ts';
import { ACCEPTED_DUPLICATE_DOTS, CONFLICTING_REMOVE_OWNERS } from '../../../helpers/SamePatchRemoveOwnershipCases.ts';

const D1 = new Dot('w', 1);
const D2 = new Dot('w', 2);

function build(ops: readonly PatchOp[]): Patch {
  return new Patch({ writer: 'w', lamport: 1, context: {}, ops });
}

function refusal(run: () => void): CrossOwnerRemoveError {
  try {
    run();
  } catch (err) {
    if (err instanceof CrossOwnerRemoveError) { return err; }
    throw err;
  }
  throw new PatchError('expected CrossOwnerRemoveError, but the call returned normally');
}

describe('same-patch remove ownership', () => {
  it('refuses a NodeRemove that lists a dot the same patch adds to another node', () => {
    const err = refusal(() => build([new NodeAdd('a', D1), new NodeRemove('b', [encodeDot(D1)])]));
    expect(err).toBeInstanceOf(PatchError);
    expect(err.code).toBe(CrossOwnerRemoveError.CODE);
    expect(err.context).toEqual({ dot: 'w:1', removeOwner: 'node\0b', addOwner: 'node\0a' });
  });

  it('refuses an EdgeRemove that lists a dot the same patch adds to a node', () => {
    const err = refusal(() => build([
      new NodeAdd('a', D1),
      new EdgeRemove({ from: 'a', to: 'b', label: 'rel', observedDots: [encodeDot(D1)] }),
    ]));
    expect(err.context).toMatchObject({ removeOwner: 'edge\0a\0b\0rel', addOwner: 'node\0a' });
  });

  it('refuses a remove that runs before the cross-owner add in the same patch', () => {
    refusal(() => build([
      new EdgeRemove({ from: 'a', to: 'b', label: 'x', observedDots: [encodeDot(D2)] }),
      new EdgeAdd({ from: 'a', to: 'b', label: 'y', dot: D2 }),
    ]));
  });

  it('accepts a remove of a dot the same patch adds to the same element', () => {
    const patch = build([
      new NodeAdd('a', D1),
      new EdgeAdd({ from: 'a', to: 'b', label: 'rel', dot: D2 }),
      new NodeRemove('a', [encodeDot(D1)]),
      new EdgeRemove({ from: 'a', to: 'b', label: 'rel', observedDots: [encodeDot(D2)] }),
    ]);
    expect(patch.ops).toHaveLength(4);
  });

  it('accepts removes of dots that another patch added, and patches without adds', () => {
    expect(build([new NodeAdd('a', D2), new NodeRemove('b', ['other:1'])]).ops).toHaveLength(2);
    expect(build([new NodeRemove('b', ['w:1']), new NodePropSet('a', 'k', 'v')]).ops).toHaveLength(2);
  });

  it('refuses the shape at the persisted-patch decode boundary', () => {
    expect(() => hydrateDecodedPatch({
      schema: 2, writer: 'w', lamport: 1, context: {},
      ops: [
        { type: 'NodeAdd', node: 'a', dot: ['w', 1] },
        { type: 'NodeRemove', node: 'b', observedDots: ['w:1'] },
      ],
    }, undefined)).toThrow(CrossOwnerRemoveError);
  });

  // Small: exact refusal oracle from the adopted same-patch ownership law.
  it.each(CONFLICTING_REMOVE_OWNERS)('decode refuses $name', ({ ops }) => {
    const error = refusal(() => hydrateDecodedPatch({
      schema: 2, writer: 'peer', lamport: 1, context: {}, ops,
    }, undefined));
    expect(error).toBeInstanceOf(PatchError);
    expect(error.code).toBe('E_PATCH_CROSS_OWNER_REMOVE');
  });

  it.each(ACCEPTED_DUPLICATE_DOTS)('decode preserves acceptance: $name', ({ ops }) => {
    const patch = hydrateDecodedPatch({ schema: 2, writer: 'peer', lamport: 1, context: {}, ops }, undefined);
    expect(patch.ops).toHaveLength(ops.length);
  });
});
