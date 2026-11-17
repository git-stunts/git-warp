/**
 * SyncIngressOps — hydrates the ops of a patch that arrived on the sync
 * wire into runtime op classes before a `Patch` is built.
 *
 * Stored patches are hydrated at the decode boundary. Sync responses do
 * not pass through that boundary, so without this step a `Patch` built at
 * sync ingress would hold raw wire records, and its constructor checks
 * (such as the same-patch remove ownership check) could not see them.
 * Unrecognised op types stay raw, so `applySyncResponse` can still refuse them
 * with `SchemaUnsupportedError`.
 *
 * @module domain/services/sync/SyncIngressOps
 */

import { hydrateDecodedOp } from '../OpNormalizer.ts';
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
export default function hydrateSyncIngressOps(ops: readonly PatchOp[]): PatchOp[] {
  return ops.map((op) => {
    const hydrated = hydrateDecodedOp(op);
    return isRuntimePatchOp(hydrated) ? hydrated : op;
  });
}
