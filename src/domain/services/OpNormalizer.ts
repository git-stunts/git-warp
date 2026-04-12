/**
 * OpNormalizer — raw ↔ canonical operation conversion.
 *
 * ADR 1 (Canonicalize Edge Property Operations Internally) requires that
 * reducers, provenance, receipts, and queries operate on canonical ops:
 *
 *   Raw (persisted):      NodeAdd, NodeRemove, EdgeAdd, EdgeRemove, PropSet, BlobValue
 *   Canonical (internal): NodeAdd, NodeRemove, EdgeAdd, EdgeRemove, NodePropSet, EdgePropSet, BlobValue
 *
 * **Current normalization location:** Normalization is performed at the
 * reducer entry points (`applyFast`, `applyWithReceipt`, `applyWithDiff`
 * in JoinReducer.ts), not at the CBOR decode boundary as originally
 * planned in ADR 1. This is a pragmatic deviation — the reducer calls
 * `normalizeRawOp()` on each op before dispatch. Lowering happens in
 * `PatchBuilder.build()`/`commit()` via `lowerCanonicalOp()`.
 *
 * @module domain/services/OpNormalizer
 */

import { Dot } from '../crdt/Dot.ts';
import PatchError from '../errors/PatchError.ts';
import BlobValue from '../types/ops/BlobValue.ts';
import EdgeAdd from '../types/ops/EdgeAdd.ts';
import EdgePropSet from '../types/ops/EdgePropSet.ts';
import EdgeRemove from '../types/ops/EdgeRemove.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import NodePropSet from '../types/ops/NodePropSet.ts';
import NodeRemove from '../types/ops/NodeRemove.ts';
import PropSet from '../types/ops/PropSet.ts';
import type { CanonicalOpV2, OpV2 } from '../types/ops/unions.ts';
import type { OpLike } from './OpLike.ts';
import { isLegacyEdgePropNode, decodeLegacyEdgePropNode, encodeLegacyEdgePropNode } from './KeyCodec.ts';

const RUNTIME_OP_CLASSES = [
  NodeAdd,
  NodeRemove,
  EdgeAdd,
  EdgeRemove,
  PropSet,
  NodePropSet,
  EdgePropSet,
  BlobValue,
];

function expectString(value: string | undefined, opType: string, field: string): string {
  if (typeof value !== 'string') {
    throw new PatchError(
      `${opType} op requires '${field}' to be a string, got ${typeof value}`,
      { context: { opType, field, actual: typeof value } },
    );
  }
  return value;
}

function expectObservedDots(value: Iterable<string> | undefined, opType: string): string[] {
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    typeof Reflect.get(value, Symbol.iterator) !== 'function'
  ) {
    throw new PatchError(
      `${opType} op requires 'observedDots' to be iterable, got ${typeof value}`,
      { context: { opType, field: 'observedDots', actual: typeof value } },
    );
  }
  return Array.from(value);
}

function expectDotObject(dot: OpLike['dot'], opType: string): object {
  if (dot === null || dot === undefined || typeof dot !== 'object') {
    throw new PatchError(
      `${opType} op requires 'dot' to be a Dot-compatible object, got ${typeof dot}`,
      { context: { opType, field: 'dot', actual: typeof dot } },
    );
  }
  return dot;
}

function expectDotWriterId(dot: object, opType: string): string {
  if (!('writerId' in dot)) {
    throw new PatchError(
      `${opType} op requires 'dot.writerId' to be a string, got undefined`,
      { context: { opType, field: 'dot.writerId', actual: 'undefined' } },
    );
  }
  const { writerId } = dot;
  if (typeof writerId !== 'string') {
    throw new PatchError(
      `${opType} op requires 'dot.writerId' to be a string, got ${typeof writerId}`,
      { context: { opType, field: 'dot.writerId', actual: typeof writerId } },
    );
  }
  return writerId;
}

function expectDotCounter(dot: object, opType: string): number {
  if (!('counter' in dot)) {
    throw new PatchError(
      `${opType} op requires 'dot.counter' to be an integer, got undefined`,
      { context: { opType, field: 'dot.counter', actual: 'undefined' } },
    );
  }
  const { counter } = dot;
  if (typeof counter !== 'number' || !Number.isInteger(counter)) {
    throw new PatchError(
      `${opType} op requires 'dot.counter' to be an integer, got ${typeof counter}`,
      { context: { opType, field: 'dot.counter', actual: typeof counter } },
    );
  }
  return counter;
}

function hydrateDot(dot: OpLike['dot'], opType: string): Dot {
  if (dot instanceof Dot) {
    return dot;
  }
  const dotObject = expectDotObject(dot, opType);
  return new Dot(expectDotWriterId(dotObject, opType), expectDotCounter(dotObject, opType));
}

function hasNodeIdentity(rawOp: OpLike): rawOp is OpLike & { readonly node: string } {
  return typeof rawOp.node === 'string';
}

function hasEdgeIdentity(
  rawOp: OpLike,
): rawOp is OpLike & { readonly from: string; readonly to: string; readonly label: string } {
  return typeof rawOp.from === 'string' && typeof rawOp.to === 'string' && typeof rawOp.label === 'string';
}

function hasNodePropIdentity(
  rawOp: OpLike,
): rawOp is OpLike & { readonly node: string; readonly key: string } {
  return typeof rawOp.node === 'string' && typeof rawOp.key === 'string';
}

function hasEdgePropIdentity(
  rawOp: OpLike,
): rawOp is OpLike & { readonly from: string; readonly to: string; readonly label: string; readonly key: string } {
  return hasEdgeIdentity(rawOp) && typeof rawOp.key === 'string';
}

function hasBlobIdentity(
  rawOp: OpLike,
): rawOp is OpLike & { readonly node: string; readonly oid: string } {
  return typeof rawOp.node === 'string' && typeof rawOp.oid === 'string';
}

function hydrateNodeAdd(rawOp: OpLike): OpLike {
  return new NodeAdd(expectString(rawOp.node, rawOp.type, 'node'), hydrateDot(rawOp.dot, rawOp.type));
}

function hydrateNodeRemove(rawOp: OpLike): OpLike {
  if (!hasNodeIdentity(rawOp)) {
    return rawOp;
  }
  return new NodeRemove(rawOp.node, expectObservedDots(rawOp.observedDots, rawOp.type));
}

function hydrateEdgeAdd(rawOp: OpLike): OpLike {
  return new EdgeAdd({
    from: expectString(rawOp.from, rawOp.type, 'from'),
    to: expectString(rawOp.to, rawOp.type, 'to'),
    label: expectString(rawOp.label, rawOp.type, 'label'),
    dot: hydrateDot(rawOp.dot, rawOp.type),
  });
}

function hydrateEdgeRemove(rawOp: OpLike): OpLike {
  if (!hasEdgeIdentity(rawOp)) {
    return rawOp;
  }
  return new EdgeRemove({
    from: rawOp.from,
    to: rawOp.to,
    label: rawOp.label,
    observedDots: expectObservedDots(rawOp.observedDots, rawOp.type),
  });
}

function hydratePropSet(rawOp: OpLike): OpLike {
  return new PropSet(
    expectString(rawOp.node, rawOp.type, 'node'),
    expectString(rawOp.key, rawOp.type, 'key'),
    rawOp.value,
  );
}

function hydrateNodePropSet(rawOp: OpLike): OpLike {
  if (!hasNodePropIdentity(rawOp)) {
    return rawOp;
  }
  return new NodePropSet(rawOp.node, rawOp.key, rawOp.value);
}

function hydrateEdgePropSet(rawOp: OpLike): OpLike {
  if (!hasEdgePropIdentity(rawOp)) {
    return rawOp;
  }
  return new EdgePropSet({
    from: rawOp.from,
    to: rawOp.to,
    label: rawOp.label,
    key: rawOp.key,
    value: rawOp.value,
  });
}

function hydrateBlobValue(rawOp: OpLike): OpLike {
  if (!hasBlobIdentity(rawOp)) {
    return rawOp;
  }
  return new BlobValue(rawOp.node, rawOp.oid);
}

const HYDRATORS: ReadonlyMap<string, (rawOp: OpLike) => OpLike> = Object.freeze(new Map([
  ['NodeAdd', hydrateNodeAdd],
  ['NodeRemove', hydrateNodeRemove],
  ['EdgeAdd', hydrateEdgeAdd],
  ['EdgeRemove', hydrateEdgeRemove],
  ['PropSet', hydratePropSet],
  ['NodePropSet', hydrateNodePropSet],
  ['EdgePropSet', hydrateEdgePropSet],
  ['BlobValue', hydrateBlobValue],
]));

function isRuntimeOp(rawOp: OpLike): rawOp is OpV2 {
  return RUNTIME_OP_CLASSES.some((OpClass) => rawOp instanceof OpClass);
}

function hydrateRawOp(rawOp: OpLike): OpLike {
  if (isRuntimeOp(rawOp)) {
    return rawOp;
  }
  const hydrate = HYDRATORS.get(rawOp.type);
  return hydrate !== undefined ? hydrate(rawOp) : rawOp;
}

/**
 * Hydrates a decoded op into the corresponding runtime-backed op class
 * when the op type is known. Unknown types pass through unchanged so
 * forward-compatible callers can decide how to handle them.
 */
export function hydrateDecodedOp(rawOp: OpLike): OpLike {
  return hydrateRawOp(rawOp);
}

/**
 * Hydrates a known decoded op into a runtime-backed current op class.
 * Unknown types are rejected at this stricter boundary.
 */
export function hydrateKnownDecodedOp(rawOp: OpLike): OpV2 {
  const hydratedOp = hydrateDecodedOp(rawOp);
  if (isRuntimeOp(hydratedOp)) {
    return hydratedOp;
  }
  throw new PatchError(`Cannot hydrate unknown decoded op type '${rawOp.type}'`, {
    context: { opType: rawOp.type },
  });
}

function normalizePropSet(rawPropSet: PropSet): CanonicalOpV2 {
  if (isLegacyEdgePropNode(rawPropSet.node)) {
    const { from, to, label } = decodeLegacyEdgePropNode(rawPropSet.node);
    return new EdgePropSet({ from, to, label, key: rawPropSet.key, value: rawPropSet.value });
  }
  return new NodePropSet(rawPropSet.node, rawPropSet.key, rawPropSet.value);
}

/**
 * Normalizes a single raw (persisted) op into its canonical form.
 *
 * - Raw `PropSet` with \x01-prefixed node → canonical `EdgePropSet`
 * - Raw `PropSet` without prefix → canonical `NodePropSet`
 * - Add/property/blob ops are hydrated into runtime-backed classes.
 * - Legacy tombstone-only remove POJOs still pass through until the
 *   remove-op boundary cleanup lands.
 *
 * Reducer entrypoints may receive either class instances or plain objects
 * decoded from CBOR. This function is the boundary that turns decoded
 * shapes back into real op/domain objects before reducer dispatch.
 */
export function normalizeRawOp(rawOp: OpLike): OpLike {
  const hydratedOp = hydrateDecodedOp(rawOp);
  return hydratedOp instanceof PropSet ? normalizePropSet(hydratedOp) : hydratedOp;
}

/**
 * Lowers a single canonical op back to raw (persisted) form.
 *
 * - Canonical `NodePropSet` → raw `PropSet`
 * - Canonical `EdgePropSet` → raw `PropSet` with legacy \x01-prefixed node
 * - All other op types pass through unchanged.
 *
 * In M13, this always produces legacy raw PropSet for property ops.
 * A future graph capability cutover (ADR 2) may allow emitting raw
 * `EdgePropSet` directly.
 */
export function lowerCanonicalOp(canonicalOp: CanonicalOpV2): OpV2 {
  if (canonicalOp.type === 'NodePropSet') {
    return new PropSet(canonicalOp.node, canonicalOp.key, canonicalOp.value);
  }
  if (canonicalOp.type === 'EdgePropSet') {
    return new PropSet(
      encodeLegacyEdgePropNode(canonicalOp.from, canonicalOp.to, canonicalOp.label),
      canonicalOp.key,
      canonicalOp.value,
    );
  }
  return canonicalOp;
}
