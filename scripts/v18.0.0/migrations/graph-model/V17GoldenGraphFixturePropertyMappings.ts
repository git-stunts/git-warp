import GraphModelMigrationPropertyMapping
  from '../../../../src/domain/migrations/GraphModelMigrationPropertyMapping.ts';
import V17GoldenGraphFixtureManifest, {
  V17GoldenEdgeFact,
  type V17GoldenGraphFixtureVisibleFact,
  V17GoldenPropertyFact,
} from './V17GoldenGraphFixtureManifest.ts';
import { encodeLegacyEdgePropNode } from '../../../../src/domain/services/KeyCodec.ts';

export class V17GoldenGraphFixturePropertyMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V17GoldenGraphFixturePropertyMappingError';
  }
}

/** Builds fixture property mappings against declared edge facts instead of owner string shape. */
export function buildV17GoldenFixturePropertyMappings(
  manifest: V17GoldenGraphFixtureManifest,
): readonly GraphModelMigrationPropertyMapping[] {
  const checkedManifest = requireManifest(manifest);
  const edgeFactKeys = declaredEdgeFactKeys(checkedManifest.visibleFacts);
  return Object.freeze(checkedManifest.visibleFacts
    .filter((fact) => fact instanceof V17GoldenPropertyFact)
    .map((fact) => propertyMappingFromFact(fact, edgeFactKeys)));
}

function propertyMappingFromFact(
  fact: V17GoldenPropertyFact,
  edgeFactKeys: ReadonlySet<string>,
): GraphModelMigrationPropertyMapping {
  const separator = fact.key.lastIndexOf(':');
  if (separator <= 0 || separator === fact.key.length - 1) {
    throw new V17GoldenGraphFixturePropertyMappingError(
      `property fact ${fact.key} must use owner:property public key format`,
    );
  }
  const ownerId = fact.key.slice(0, separator);
  const propertyKey = fact.key.slice(separator + 1);
  return new GraphModelMigrationPropertyMapping({
    legacyOwnerId: ownerId,
    legacyPropertyKey: propertyKey,
    targetOwnerId: targetPropertyOwnerId(ownerId, edgeFactKeys),
    targetPropertyKey: propertyKey,
  });
}

function declaredEdgeFactKeys(facts: readonly V17GoldenGraphFixtureVisibleFact[]): ReadonlySet<string> {
  return new Set(facts
    .filter((fact) => fact instanceof V17GoldenEdgeFact)
    .map((fact) => fact.key));
}

function targetPropertyOwnerId(ownerId: string, edgeFactKeys: ReadonlySet<string>): string {
  if (!edgeFactKeys.has(ownerId)) {
    return ownerId;
  }
  const edge = parsePublicEdgeFactKey(ownerId);
  if (edge === null) {
    throw new V17GoldenGraphFixturePropertyMappingError(
      `declared edge property owner ${ownerId} must use from->to:label format`,
    );
  }
  return encodeLegacyEdgePropNode(edge.from, edge.to, edge.label);
}

function parsePublicEdgeFactKey(ownerId: string): {
  readonly from: string;
  readonly to: string;
  readonly label: string;
} | null {
  const arrowIndex = ownerId.indexOf('->');
  const labelIndex = ownerId.lastIndexOf(':');
  if (arrowIndex <= 0 || labelIndex <= arrowIndex + 2 || labelIndex === ownerId.length - 1) {
    return null;
  }
  return Object.freeze({
    from: ownerId.slice(0, arrowIndex),
    to: ownerId.slice(arrowIndex + 2, labelIndex),
    label: ownerId.slice(labelIndex + 1),
  });
}

function requireManifest(manifest: V17GoldenGraphFixtureManifest): V17GoldenGraphFixtureManifest {
  if (!(manifest instanceof V17GoldenGraphFixtureManifest)) {
    throw new V17GoldenGraphFixturePropertyMappingError(
      'manifest must be a V17GoldenGraphFixtureManifest',
    );
  }
  return manifest;
}
