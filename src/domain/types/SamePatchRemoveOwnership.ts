/**
 * SamePatchRemoveOwnership — the one owner check that a patch can make
 * without state.
 *
 * A dot names no element; the add op that carries it does. Inside one
 * patch both are visible, so a remove that lists a dot that the same patch
 * adds to a different element is self-contradictory and is refused. A
 * remove that lists a dot added in another patch cannot be checked here
 * (#1120).
 *
 * The check reads runtime op classes. The decode boundary hydrates ops
 * before it builds a `Patch`, and sync ingress hydrates them in
 * `normalizePatch`.
 *
 * @module domain/types/SamePatchRemoveOwnership
 */

import { Dot } from '../crdt/Dot.ts';
import CrossOwnerRemoveError from '../errors/CrossOwnerRemoveError.ts';
import EdgeAdd from './ops/EdgeAdd.ts';
import EdgeRemove from './ops/EdgeRemove.ts';
import NodeAdd from './ops/NodeAdd.ts';
import NodeRemove from './ops/NodeRemove.ts';
import type { PatchOp } from './ops/unions.ts';

const OWNER_SEPARATOR = '\0';

function edgeOwner(op: EdgeAdd | EdgeRemove): string {
  return ['edge', op.from, op.to, op.label].join(OWNER_SEPARATOR);
}

function nodeOwner(op: NodeAdd | NodeRemove): string {
  return ['node', op.node].join(OWNER_SEPARATOR);
}

function addDotOwner(owners: Map<string, Set<string>>, dot: Dot, owner: string): void {
  const encoded = Dot.encode(dot);
  const dotOwners = owners.get(encoded);
  if (dotOwners === undefined) {
    owners.set(encoded, new Set([owner]));
  } else {
    dotOwners.add(owner);
  }
}

function addedDotOwners(ops: readonly PatchOp[]): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const op of ops) {
    if (op instanceof NodeAdd) {
      addDotOwner(owners, op.dot, nodeOwner(op));
    } else if (op instanceof EdgeAdd) {
      addDotOwner(owners, op.dot, edgeOwner(op));
    }
  }
  return owners;
}

type RemoveClaim = { readonly owner: string; readonly observedDots: readonly string[] };

function removeClaim(op: PatchOp): RemoveClaim | null {
  if (op instanceof NodeRemove) {
    return { owner: nodeOwner(op), observedDots: op.observedDots };
  }
  return op instanceof EdgeRemove ? { owner: edgeOwner(op), observedDots: op.observedDots } : null;
}

/** Refuses a remove that lists a dot this patch adds to a different element. */
export default function assertSamePatchRemoveOwnership(ops: readonly PatchOp[]): void {
  const owners = addedDotOwners(ops);
  if (owners.size === 0) {
    return;
  }
  for (const op of ops) {
    const claim = removeClaim(op);
    if (claim !== null) {
      assertOwnsAddedDots(claim, owners);
    }
  }
}

function assertOwnsAddedDots(claim: RemoveClaim, owners: ReadonlyMap<string, ReadonlySet<string>>): void {
  const { owner } = claim;
  for (const dot of claim.observedDots) {
    for (const adder of owners.get(dot) ?? []) {
      if (adder !== owner) {
        throw new CrossOwnerRemoveError(
          'A remove lists an observed dot that the same patch adds to a different element',
          { context: { dot, removeOwner: owner, addOwner: adder } },
        );
      }
    }
  }
}
