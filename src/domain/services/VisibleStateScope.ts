import QueryError from '../errors/QueryError.ts';
import type ORSet from '../crdt/ORSet.ts';
import WarpState from './state/WarpState.ts';
import { normalizeRawOp } from './OpNormalizer.ts';
import {
  decodeEdgeKey,
  encodeEdgeKey,
} from './KeyCodec.ts';
import type { LWWRegister } from '../crdt/LWW.ts';
import type { PropValue } from '../types/PropValue.ts';
import type { EventId } from '../utils/EventId.ts';
import type { RawPatchOp } from '../types/ops/unions.ts';
import type Patch from '../types/Patch.ts';

export interface VisibleStateScopePrefixFilter {
  include?: string[];
  exclude?: string[];
}

export interface VisibleStateScope {
  nodeIdPrefixes?: VisibleStateScopePrefixFilter;
}

/**
 * Deduplicates and sorts string values.
 */
function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Validates that a single item is a non-empty string, throwing if not.
 */
function validatePrefixItem(item: unknown, field: string): string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (typeof item !== 'string' || item.trim().length === 0) {
    throw new QueryError(`${field} must contain only non-empty strings`, {
      code: 'invalid_coordinate',
      context: { field, itemType: typeof item },
    });
  }
  return item.trim();
}

/**
 * Normalizes a value expected to be a list of non-empty string prefixes.
 */
function normalizePrefixList(value: unknown, field: string): string[] { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new QueryError(`${field} must be an array of non-empty strings`, {
      code: 'invalid_coordinate',
      context: { field, valueType: typeof value },
    });
  }

  const normalized: string[] = [];
  for (const item of value) {
    normalized.push(validatePrefixItem(item, field));
  }
  return uniqueSorted(normalized);
}

/**
 * Throws if the value is not a plain object (excludes arrays and primitives).
 */
function assertPlainObject(value: unknown, field: string): Record<string, unknown> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new QueryError(`${field} must be an object with include/exclude prefix arrays`, {
      code: 'invalid_coordinate',
      context: { field, valueType: typeof value },
    });
  }
  return value as Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Throws if the raw object contains keys other than the allowed set.
 */
function rejectUnknownKeys(raw: Record<string, unknown>, allowed: string[], field: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const allowedSet = new Set(allowed);
  const unknownKeys = Object.keys(raw).filter((key) => !allowedSet.has(key));
  if (unknownKeys.length > 0) {
    throw new QueryError(`${field} contains unsupported keys`, {
      code: 'invalid_coordinate',
      context: { field, unknownKeys },
    });
  }
}

/**
 * Normalizes a prefix filter object with optional include/exclude arrays.
 */
function normalizePrefixFilter(value: unknown, field: string): VisibleStateScopePrefixFilter | null { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (value === undefined || value === null) {
    return null;
  }
  const raw = assertPlainObject(value, field);
  rejectUnknownKeys(raw, ['include', 'exclude'], field);

  const include = normalizePrefixList(raw['include'], `${field}.include`);
  const exclude = normalizePrefixList(raw['exclude'], `${field}.exclude`);
  if (include.length === 0 && exclude.length === 0) {
    return null;
  }
  return { include, exclude };
}

/**
 * Normalizes a substrate-generic visible-state scope.
 *
 * Current scope stays intentionally narrow:
 * - include/exclude node-id prefixes
 *
 * Edges, edge properties, and attachment metadata follow node visibility.
 */
export function normalizeVisibleStateScope(scope: unknown, field = 'scope'): VisibleStateScope | null { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (scope === undefined || scope === null) {
    return null;
  }
  const raw = assertPlainObject(scope, `${field} must be an object when provided`);
  rejectUnknownKeys(raw, ['nodeIdPrefixes'], field);

  const nodeIdPrefixes = normalizePrefixFilter(raw['nodeIdPrefixes'], `${field}.nodeIdPrefixes`);
  if (nodeIdPrefixes === null) {
    return null;
  }

  return { nodeIdPrefixes };
}

/**
 * Tests whether a value matches the include prefix list (empty means include all).
 */
function matchesInclude(value: string, include: string[]): boolean {
  return include.length === 0 || include.some((prefix) => value.startsWith(prefix));
}

/**
 * Tests whether a value is excluded by the exclude prefix list.
 */
function matchesExclude(value: string, exclude: string[]): boolean {
  return exclude.some((prefix) => value.startsWith(prefix));
}

/**
 * Extracts the include list from prefix filter rules, defaulting to empty.
 */
function extractIncludeList(rules: VisibleStateScopePrefixFilter): string[] {
  return Array.isArray(rules.include) ? rules.include : [];
}

/**
 * Extracts the exclude list from prefix filter rules, defaulting to empty.
 */
function extractExcludeList(rules: VisibleStateScopePrefixFilter): string[] {
  return Array.isArray(rules.exclude) ? rules.exclude : [];
}

/**
 * Tests whether a value matches include/exclude prefix rules.
 */
function matchesPrefixFilter(value: string, rules: VisibleStateScopePrefixFilter | null | undefined): boolean {
  if (rules === null || rules === undefined) {
    return true;
  }
  return matchesInclude(value, extractIncludeList(rules)) && !matchesExclude(value, extractExcludeList(rules));
}

/**
 * Tests whether a node ID falls within the visible state scope.
 */
export function nodeIdInVisibleStateScope(nodeId: string, scope: VisibleStateScope | null | undefined): boolean {
  if (scope === null || scope === undefined) {
    return true;
  }
  return matchesPrefixFilter(nodeId, scope.nodeIdPrefixes ?? null);
}

/**
 * Tests whether both endpoints of an edge fall within the visible state scope.
 */
function edgeInVisibleStateScope(
  edge: { from: string; to: string; label: string },
  scope: VisibleStateScope | null | undefined,
): boolean {
  return nodeIdInVisibleStateScope(edge.from, scope) && nodeIdInVisibleStateScope(edge.to, scope);
}

/**
 * Collects node IDs that are alive and within the given scope.
 */
function collectScopedNodeIds(state: WarpState, scope: VisibleStateScope): Set<string> {
  const scopedNodeIds = new Set<string>();
  for (const nodeId of state.nodeAlive.elements()) {
    if (nodeIdInVisibleStateScope(nodeId, scope)) {
      scopedNodeIds.add(nodeId);
    }
  }
  return scopedNodeIds;
}

/**
 * Collects edge keys whose both endpoints are in the scoped node set.
 */
function collectScopedEdgeKeys(state: WarpState, scopedNodeIds: Set<string>): Set<string> {
  const scopedEdgeKeys = new Set<string>();
  for (const edgeKey of state.edgeAlive.elements()) {
    const edge = decodeEdgeKey(edgeKey);
    if (scopedNodeIds.has(edge.from) && scopedNodeIds.has(edge.to)) {
      scopedEdgeKeys.add(edgeKey);
    }
  }
  return scopedEdgeKeys;
}

/**
 * Collects property registers belonging to scoped nodes or scoped edges.
 */
function collectScopedProps(
  state: WarpState,
  scopedNodeIds: Set<string>,
  scopedEdgeKeys: Set<string>,
): Map<string, LWWRegister<PropValue>> {
  const scopedProps = new Map<string, LWWRegister<PropValue>>();
  for (const entry of state.nodeProperties()) {
    if (scopedNodeIds.has(entry.nodeId)) {
      scopedProps.set(entry.encodedKey, entry.register);
    }
  }
  for (const entry of state.edgeProperties()) {
    const edgeKey = encodeEdgeKey(entry.from, entry.to, entry.label);
    if (scopedEdgeKeys.has(edgeKey)) {
      scopedProps.set(entry.encodedKey, entry.register);
    }
  }
  return scopedProps;
}

/**
 * Collects birth events for edges whose keys are in the scoped set.
 */
function collectScopedEdgeBirthEvents(
  state: WarpState,
  scopedEdgeKeys: Set<string>,
): Map<string, EventId> {
  const scopedEdgeBirthEvent = new Map<string, EventId>();
  for (const [edgeKey, eventId] of state.edgeBirthEvent.entries()) {
    if (scopedEdgeKeys.has(edgeKey)) {
      scopedEdgeBirthEvent.set(edgeKey, eventId);
    }
  }
  return scopedEdgeBirthEvent;
}

/**
 * Projects a full materialized state down to only the nodes/edges/props in scope.
 */
export function scopeMaterializedState(state: WarpState, scope: VisibleStateScope | null | undefined): WarpState {
  if (scope === null || scope === undefined) {
    return state;
  }

  const scopedNodeIds = collectScopedNodeIds(state, scope);
  const scopedNodeAlive: ORSet = state.nodeAlive.scopedClone(
    (nodeId) => scopedNodeIds.has(nodeId),
  );
  const scopedEdgeKeys = collectScopedEdgeKeys(state, scopedNodeIds);
  const scopedEdgeAlive: ORSet = state.edgeAlive.scopedClone(
    (edgeKey) => scopedEdgeKeys.has(edgeKey),
  );

  return new WarpState({
    nodeAlive: scopedNodeAlive,
    edgeAlive: scopedEdgeAlive,
    prop: collectScopedProps(state, scopedNodeIds, scopedEdgeKeys),
    observedFrontier: state.observedFrontier.clone(),
    edgeBirthEvent: collectScopedEdgeBirthEvents(state, scopedEdgeKeys),
  });
}

/**
 * Tests whether a node-targeted op affects the given scope.
 */
function nodeOpAffectsScope(op: Record<string, unknown>, scope: VisibleStateScope): boolean { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return typeof op['node'] === 'string' && nodeIdInVisibleStateScope(op['node'], scope);
}

/**
 * Tests whether an edge-targeted op affects the given scope.
 */
function edgeOpAffectsScope(op: Record<string, unknown>, scope: VisibleStateScope): boolean { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return typeof op['from'] === 'string'
    && typeof op['to'] === 'string'
    && edgeInVisibleStateScope(
      {
        from: op['from'],
        to: op['to'],
        label: typeof op['label'] === 'string' ? op['label'] : '',
      },
      scope,
    );
}

const NODE_SCOPED_OP_TYPES = new Set(['NodeAdd', 'NodeRemove', 'NodePropSet']);
const EDGE_SCOPED_OP_TYPES = new Set(['EdgeAdd', 'EdgeRemove', 'EdgePropSet']);

/**
 * Tests whether a normalized op with a known type affects the visible scope.
 */
function normalizedOpAffectsScope(normalized: Record<string, unknown>, scope: VisibleStateScope): boolean { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const { type } = normalized;
  if (NODE_SCOPED_OP_TYPES.has(type as string)) {
    return nodeOpAffectsScope(normalized, scope);
  }
  if (EDGE_SCOPED_OP_TYPES.has(type as string)) {
    return edgeOpAffectsScope(normalized, scope);
  }
  return type !== 'BlobValue';
}

/**
 * Returns true if the op value is not a usable object for scope analysis.
 */
function isUnscopableOp(op: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return op === null || op === undefined || typeof op !== 'object';
}

/**
 * Tests whether a single op affects any element within the visible scope.
 */
function opAffectsScope(op: unknown, scope: VisibleStateScope | null | undefined): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (scope === null || scope === undefined) {
    return true;
  }
  if (isUnscopableOp(op)) {
    return true;
  }

  const normalized = normalizeRawOp(op as RawPatchOp | { type: string }) as Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return normalizedOpAffectsScope(normalized, scope);
}

/**
 * Tests whether a patch contains at least one op that affects the scope.
 */
function patchAffectsScope(patch: Patch, scope: VisibleStateScope | null | undefined): boolean {
  if (scope === null || scope === undefined) {
    return true;
  }
  const ops = Array.isArray((patch as unknown as { ops?: unknown[] })?.ops) ? (patch as unknown as { ops: unknown[] }).ops : []; // nosemgrep: ts-no-double-cast -- 0025A; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return ops.some((op) => opAffectsScope(op, scope));
}

/**
 * Filters patch entries down to patches with at least one in-scope op.
 */
export function scopePatchEntries(
  entries: Array<{ patch: Patch; sha: string }>,
  scope: VisibleStateScope | null | undefined,
): Array<{ patch: Patch; sha: string }> {
  if (scope === null || scope === undefined) {
    return entries;
  }
  return entries.filter(({ patch }) => patchAffectsScope(patch, scope));
}
