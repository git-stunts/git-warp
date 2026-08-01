/**
 * Entity capture — the dependency-pure single-patch shape.
 *
 * One entity is created by exactly one patch carrying its complete initial
 * payload. Unlike `addNode` followed by `setProperty`, that patch records
 * **no** read: the NodeAdd in the same patch is what brings the node into
 * existence, so the payload depends on nothing that precedes the patch. The
 * footprint (`reads` empty, `writes` exactly the new id) is therefore exact
 * rather than an under-approximation, and the entity's cone is a singleton.
 *
 * See `docs/READINGS_AND_OPTICS.md` §4 and §8.
 *
 * @module domain/services/PatchBuilderEntity
 */

import PatchError from '../errors/PatchError.ts';
import NodePropertyWriteIntent from '../graph/NodePropertyWriteIntent.ts';
import NodePropSet from '../types/ops/NodePropSet.ts';
import type { PropValue } from '../types/PropValue.ts';
import type { WarpState } from './JoinReducer.ts';
import { requirePatchPropertyValue } from './PatchBuilderContent.ts';
import { assertNoReservedBytes } from './PatchBuilderValidation.ts';

/**
 * An entity's complete initial payload.
 *
 * Typed as domain property values rather than raw transport data: the
 * boundary that admits arbitrary caller input is `Intent.addEntity`, which
 * validates before anything reaches the builder. `requirePatchPropertyValue`
 * still re-checks each value so a JavaScript caller cannot slip past the type.
 */
export type EntityCapturePayload = Readonly<Record<string, PropValue>>;

/** Where an id may already exist: earlier in this patch, or in the graph. */
export type EntityCaptureScope = {
  readonly added: ReadonlySet<string>;
  readonly state: WarpState | null;
};

/**
 * Validates one entity capture and returns its payload operations.
 *
 * Every check runs before a single operation is produced, so a rejected
 * entity leaves the caller's patch untouched.
 *
 * @param nodeId - the entity's own fresh id
 * @param properties - the complete initial payload, at least one entry
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
  const entries = Object.entries(properties ?? {});
  if (entries.length === 0) {
    throw new PatchError(
      `Cannot capture entity '${nodeId}' without a payload: an entity created empty is a shell, not a fact`,
      { code: 'E_PATCH_ENTITY_EMPTY', context: { nodeId } },
    );
  }
  return entries;
}

function assertEntityAbsent(nodeId: string, scope: EntityCaptureScope): void {
  if (!scope.added.has(nodeId) && !(scope.state?.nodeAlive.contains(nodeId) ?? false)) {
    return;
  }
  throw new PatchError(
    `Cannot capture entity '${nodeId}': the id already exists, and an entity is created exactly once`,
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
