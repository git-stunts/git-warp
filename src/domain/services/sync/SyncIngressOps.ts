/**
 * SyncIngressOps — hydrates the ops of a patch that arrived on the sync
 * wire into runtime op classes and rebuilds the patch.
 *
 * Stored patches are hydrated at the decode boundary. Sync responses do
 * not pass through that boundary, so without this step a `Patch` built at
 * sync ingress would hold raw wire records, and its constructor checks
 * (such as the same-patch remove ownership check) could not see them.
 *
 * `applySyncResponse` calls this after `normalizePatch` has validated the
 * patch structure (so `ops` is an array) and after its op-type check, so a
 * patch keeps the refusal order it had before sync ingress hydrated ops:
 * structure, then op types (`SchemaUnsupportedError`), then op fields and
 * remove ownership (`PatchError`).
 *
 * @module domain/services/sync/SyncIngressOps
 */

import { hydrateDecodedOp } from '../OpNormalizer.ts';
import Patch from '../../types/Patch.ts';
import BlobValue from '../../types/ops/BlobValue.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgePropSet from '../../types/ops/EdgePropSet.ts';
import EdgeRemove from '../../types/ops/EdgeRemove.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import PropSet from '../../types/ops/PropSet.ts';
import type { PatchOp } from '../../types/ops/unions.ts';

const RUNTIME_OP_CLASSES = Object.freeze([
  NodeAdd, NodeRemove, EdgeAdd, EdgeRemove, PropSet, NodePropSet, EdgePropSet, BlobValue,
]);

function isRuntimePatchOp(op: object): op is PatchOp {
  return RUNTIME_OP_CLASSES.some((OpClass) => op instanceof OpClass);
}

/** Hydrates recognised ops into runtime classes; other op types pass through unchanged. */
function hydrateSyncIngressOps(ops: readonly PatchOp[]): PatchOp[] {
  return ops.map((op) => {
    const hydrated = hydrateDecodedOp(op);
    return isRuntimePatchOp(hydrated) ? hydrated : op;
  });
}

/**
 * Rebuilds a validated sync patch with its recognised ops hydrated, so the
 * `Patch` constructor checks run on runtime op classes. A recognised op whose
 * fields are malformed is refused here with `PatchError`.
 */
export default function hydrateSyncIngressPatch(patch: Patch): Patch {
  return new Patch({
    schema: patch.schema,
    writer: patch.writer,
    lamport: patch.lamport,
    context: patch.context,
    ops: hydrateSyncIngressOps(patch.ops),
    reads: patch.reads,
    writes: patch.writes,
    entityAdmissions: patch.entityAdmissions,
    observedFrontier: patch.observedFrontier,
  });
}
