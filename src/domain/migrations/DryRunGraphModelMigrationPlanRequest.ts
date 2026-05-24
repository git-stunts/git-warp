import GraphModelMigrationEdgeMapping from './GraphModelMigrationEdgeMapping.ts';
import GraphModelMigrationNodeMapping from './GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationPropertyMapping from './GraphModelMigrationPropertyMapping.ts';
import GraphModelMigrationSourceInventory from './GraphModelMigrationSourceInventory.ts';
import WarpError from '../errors/WarpError.ts';

export type DryRunGraphModelMigrationPlanRequestFields = {
  readonly inventory: GraphModelMigrationSourceInventory;
  readonly requiredContentKeys: readonly string[];
  readonly nodeMappings: readonly GraphModelMigrationNodeMapping[];
  readonly edgeMappings: readonly GraphModelMigrationEdgeMapping[];
  readonly propertyMappings: readonly GraphModelMigrationPropertyMapping[];
};

/** Runtime-backed request for a pure dry-run graph-model migration plan. */
export default class DryRunGraphModelMigrationPlanRequest {
  readonly inventory: GraphModelMigrationSourceInventory;
  readonly requiredContentKeys: readonly string[];
  readonly nodeMappings: readonly GraphModelMigrationNodeMapping[];
  readonly edgeMappings: readonly GraphModelMigrationEdgeMapping[];
  readonly propertyMappings: readonly GraphModelMigrationPropertyMapping[];

  constructor(fields: DryRunGraphModelMigrationPlanRequestFields) {
    const checkedFields = requireFields(fields);
    this.inventory = requireInventory(checkedFields.inventory);
    this.requiredContentKeys = freezeRequiredContentKeys(checkedFields.requiredContentKeys);
    this.nodeMappings = freezeNodeMappings(checkedFields.nodeMappings);
    this.edgeMappings = freezeEdgeMappings(checkedFields.edgeMappings);
    this.propertyMappings = freezePropertyMappings(checkedFields.propertyMappings);
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: DryRunGraphModelMigrationPlanRequestFields | null | undefined,
): DryRunGraphModelMigrationPlanRequestFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('DryRunGraphModelMigrationPlanRequest fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a source inventory instance. */
function requireInventory(inventory: GraphModelMigrationSourceInventory): GraphModelMigrationSourceInventory {
  if (!(inventory instanceof GraphModelMigrationSourceInventory)) {
    throw new WarpError('inventory must be a GraphModelMigrationSourceInventory', 'E_VALIDATION');
  }
  return inventory;
}

/** Validates and freezes required content keys. */
function freezeRequiredContentKeys(keys: readonly string[]): readonly string[] {
  const checked = requireArray(keys, 'requiredContentKeys').map((key) => requireNonEmptyString(key, 'contentKey'));
  requireUnique(checked, 'required content key');
  return Object.freeze(checked);
}

/** Validates and freezes node mappings. */
function freezeNodeMappings(
  mappings: readonly GraphModelMigrationNodeMapping[],
): readonly GraphModelMigrationNodeMapping[] {
  const checked = requireArray(mappings, 'nodeMappings').map(requireNodeMapping);
  return Object.freeze(checked);
}

/** Validates and freezes edge mappings. */
function freezeEdgeMappings(
  mappings: readonly GraphModelMigrationEdgeMapping[],
): readonly GraphModelMigrationEdgeMapping[] {
  const checked = requireArray(mappings, 'edgeMappings').map(requireEdgeMapping);
  return Object.freeze(checked);
}

/** Validates and freezes property mappings. */
function freezePropertyMappings(
  mappings: readonly GraphModelMigrationPropertyMapping[],
): readonly GraphModelMigrationPropertyMapping[] {
  const checked = requireArray(mappings, 'propertyMappings').map(requirePropertyMapping);
  return Object.freeze(checked);
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`DryRunGraphModelMigrationPlanRequest ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/** Requires no duplicate keys in a request section. */
function requireUnique(keys: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new WarpError(`DryRunGraphModelMigrationPlanRequest duplicates ${label} ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}

/** Requires a node mapping instance. */
function requireNodeMapping(mapping: GraphModelMigrationNodeMapping): GraphModelMigrationNodeMapping {
  if (!(mapping instanceof GraphModelMigrationNodeMapping)) {
    throw new WarpError('nodeMappings must contain node mappings', 'E_VALIDATION');
  }
  return mapping;
}

/** Requires an edge mapping instance. */
function requireEdgeMapping(mapping: GraphModelMigrationEdgeMapping): GraphModelMigrationEdgeMapping {
  if (!(mapping instanceof GraphModelMigrationEdgeMapping)) {
    throw new WarpError('edgeMappings must contain edge mappings', 'E_VALIDATION');
  }
  return mapping;
}

/** Requires a property mapping instance. */
function requirePropertyMapping(
  mapping: GraphModelMigrationPropertyMapping,
): GraphModelMigrationPropertyMapping {
  if (!(mapping instanceof GraphModelMigrationPropertyMapping)) {
    throw new WarpError('propertyMappings must contain property mappings', 'E_VALIDATION');
  }
  return mapping;
}
