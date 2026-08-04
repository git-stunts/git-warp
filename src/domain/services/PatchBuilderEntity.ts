/**
 * Entity capture — the dependency-pure single-patch shape.
 *
 * One patch creates the entity and carries its initial payload. Unlike
 * `addNode` followed by `setProperty`, that patch records **no** read: the
 * NodeAdd in the same patch is what brings the node into existence, so the
 * payload depends on nothing that precedes the patch. The footprint (`reads`
 * empty, `writes` exactly the subject) is therefore exact rather than an
 * under-approximation. An auto-allocated subject gives the entity an initial
 * singleton cone; a supplied semantic subject may deliberately collect more
 * than one causally distinct occurrence.
 *
 * Three limits, stated because the shape is easy to over-read:
 *
 * - **Initial, not complete.** This module enforces a non-empty payload. Which
 *   fields make an entity *complete* is an application schema concern; the
 *   substrate cannot know it.
 * - **Creation, not lifetime.** An allocated subject's cone is a singleton
 *   until something else writes the id. `property.set` and `node.remove`
 *   remain available, so an immutable-entity lifetime is a law an application
 *   must adopt, not one this constructor imposes.
 * - **Subject guard, not occurrence identity.** The local uniqueness
 *   guard refuses ids the builder can see, and a lane writer can see nothing.
 *   See {@link assertEntityAbsent}.
 *
 * See `docs/READINGS_AND_OPTICS.md` §4 and §8.
 *
 * @module domain/services/PatchBuilderEntity
 */

import PatchError from '../errors/PatchError.ts';
import { Dot } from '../crdt/Dot.ts';
import type VersionVector from '../crdt/VersionVector.ts';
import NodePropertyWriteIntent from '../graph/NodePropertyWriteIntent.ts';
import NodePropSet from '../types/ops/NodePropSet.ts';
import type { PropValue } from '../types/PropValue.ts';
import {
  isEntityCapturePayloadRecord,
  type EntityCapturePayload,
} from '../types/EntityCapturePayload.ts';
import type { WarpState } from './JoinReducer.ts';
import { requirePatchPropertyValue } from './PatchBuilderContent.ts';
import { assertNoReservedBytes } from './PatchBuilderValidation.ts';
import { hexEncode, textEncode } from '../utils/bytes.ts';

/**
 * An entity's complete initial payload.
 *
 * Typed as domain property values rather than raw transport data: the
 * boundary that admits arbitrary caller input is `Intent.addEntity`, which
 * validates before anything reaches the builder. `requirePatchPropertyValue`
 * still re-checks each value so a JavaScript caller cannot slip past the type.
 */
/** Where an id may already exist: earlier in this patch, or in the graph. */
export type EntityCaptureScope = {
  readonly added: ReadonlySet<string>;
  readonly state: WarpState | null;
};

/**
 * Allocates an application-namespaced subject from the NodeAdd's own dot.
 *
 * The representation is deliberately opaque to callers. Its only contract is
 * uniqueness under the substrate's writer-id/dot invariant; applications must
 * not parse it or use its bytes as a causal or chronological coordinate.
 */
export function allocateEntitySubject(namespace: string, dot: Dot): string {
  if (typeof namespace !== 'string' || namespace.length === 0) {
    throw new PatchError('Entity allocation namespace must be a non-empty string', {
      code: 'E_PATCH_ENTITY_NAMESPACE',
    });
  }
  assertNoReservedBytes(namespace, 'entity allocation namespace');
  if (!(dot instanceof Dot)) {
    throw new PatchError('Entity allocation requires a Dot', {
      code: 'E_PATCH_ENTITY_ALLOCATION_DOT',
    });
  }
  return `${namespace}:${hexEncode(textEncode(Dot.encode(dot)))}`;
}

/** Validates, allocates, and advances the writer-local dot exactly once. */
export function allocateEntityCapture(fields: {
  readonly namespace: string;
  readonly properties: EntityCapturePayload;
  readonly scope: EntityCaptureScope;
  readonly writerId: string;
  readonly versionVector: VersionVector;
}): Readonly<{ dot: Dot; nodeId: string; payload: readonly NodePropSet[] }> {
  const { namespace, properties, scope, writerId, versionVector } = fields;
  const expectedDot = new Dot(writerId, (versionVector.get(writerId) ?? 0) + 1);
  const nodeId = allocateEntitySubject(namespace, expectedDot);
  const payload = planEntityCapturePayload(nodeId, properties, scope);
  const dot = versionVector.increment(writerId);
  if (!Dot.equals(expectedDot, dot)) {
    throw new PatchError('Entity allocation diverged from the writer-local dot', {
      code: 'E_PATCH_ENTITY_ALLOCATION_DIVERGED',
    });
  }
  return Object.freeze({ dot, nodeId, payload });
}

/**
 * Validates one entity capture and returns its payload operations.
 *
 * Every check runs before a single operation is produced, so a rejected
 * entity leaves the caller's patch untouched.
 *
 * @param nodeId - the entity subject, supplied or substrate-allocated
 * @param properties - the non-empty initial payload
 * @param scope - the ids already spoken for by this patch and the graph
 */
export function planEntityCapturePayload(
  nodeId: string,
  properties: EntityCapturePayload,
  scope: EntityCaptureScope,
): readonly NodePropSet[] {
  assertNoReservedBytes(nodeId, 'nodeId');
  const entries = requirePayloadEntries(nodeId, properties);
  assertEntityAbsent(nodeId, scope);
  return entries.map(([key, value]) => entityProperty(nodeId, key, value));
}

function requirePayloadEntries(
  nodeId: string,
  properties: EntityCapturePayload,
): readonly (readonly [string, PropValue])[] {
  requirePayloadRecord(nodeId, properties);
  const entries = Object.entries(properties);
  if (entries.length === 0) {
    throw new PatchError(
      `Cannot capture entity '${nodeId}' without a payload: an entity created empty is a shell, not a fact`,
      { code: 'E_PATCH_ENTITY_EMPTY', context: { nodeId } },
    );
  }
  // Key order is not evidence. Sorting keeps two payloads that differ only in
  // construction order lowering to byte-identical operations.
  return entries.sort(([left], [right]) => (left === right ? 0 : (left < right ? -1 : 1)));
}

function requirePayloadRecord(nodeId: string, properties: EntityCapturePayload): void {
  if (!isEntityCapturePayloadRecord(properties)) {
    throw invalidPayloadError(nodeId);
  }
}

function invalidPayloadError(nodeId: string): PatchError {
  return new PatchError('Entity payload must be a property record', {
    code: 'E_PATCH_ENTITY_PAYLOAD',
    context: { nodeId },
  });
}

/**
 * Refuses an id the builder can already see.
 *
 * "Can see" is the whole promise: an id added earlier in this same patch, or
 * one alive in the materialized basis the builder was opened against.
 *
 * **On the `Runtime` → `Lane.write` path this guard never fires**, because a
 * lane writer has neither. `Runtime` exposes no materialization, so the basis
 * is always null; and one intent lowers to one patch, with validation running
 * before the node is added, so nothing precedes the entity in its own patch
 * either. Both arms are therefore unreachable there — measured, not inferred:
 * see `test/integration/application/Runtime.entityCapture.concurrent.test.ts`,
 * where one writer re-creates the same id on one lane and is admitted.
 *
 * What remains is a guard for a direct `PatchBuilder` opened against a
 * materialized state, which is the advanced and testing surface. It catches a
 * mistake a caller could have seen; it is not uniqueness, and it is not a
 * race detector. Applications that truly mean one creation per semantic
 * subject must enforce that domain invariant separately. Applications with no
 * independent semantic key should use substrate allocation instead of
 * maintaining a shadow counter.
 */
function assertEntityAbsent(nodeId: string, scope: EntityCaptureScope): void {
  if (!scope.added.has(nodeId) && !(scope.state?.nodeAlive.contains(nodeId) ?? false)) {
    return;
  }
  throw new PatchError(
    `Cannot capture entity '${nodeId}': this writer can already see that id`,
    { code: 'E_PATCH_ENTITY_EXISTS', context: { nodeId } },
  );
}

function entityProperty(nodeId: string, key: string, value: PropValue): NodePropSet {
  assertNoReservedBytes(key, 'key');
  const intent = NodePropertyWriteIntent.fromLegacyProperty(
    nodeId,
    key,
    requirePatchPropertyValue(value),
  );
  return new NodePropSet(nodeId, intent.propertyKey(), intent.propertyValue());
}
