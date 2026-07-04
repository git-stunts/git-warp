import { describe, expect, it } from 'vitest';

import * as browserApi from '../../../browser.ts';
import * as rootApi from '../../../index.ts';

const VALID_MIGRATION_TARGETS = new Set<string>([
  'storage',
  'advanced',
  'diagnostics',
  'legacy',
]);

const ROOT_ERROR_ALLOWLIST = new Set<string>([
  'PatchError',
  'QueryError',
  'StrandError',
  'WormholeError',
]);

const GRAPH_SUBSTRATE_NOUNS = new Set<string>([
  'ContentAttachmentProjection',
  'EdgeId',
  'EdgePropertyWriteIntent',
  'EdgeRecord',
  'EdgeTypeId',
  'LegacyEdgePropertyKey',
  'LegacyNodePropertyKey',
  'LegacyPropertyProjection',
  'LegacyPropertyValue',
  'NodeId',
  'NodePropertyWriteIntent',
  'NodeRecord',
  'NodeTypeId',
  'VisibleEdgePropertyRecord',
  'VisibleNodePropertyRecord',
]);

const ROOT_EXPORT_MOVE_TARGETS = new Map<string, string>([
  ['ContentAttachmentProjection', 'diagnostics'],
  ['ContinuumReceiptFamilyProjection', 'advanced'],
  ['CoordinateSelector', 'advanced'],
  ['EdgeId', 'legacy'],
  ['EdgePropertyWriteIntent', 'legacy'],
  ['EdgeRecord', 'legacy'],
  ['EdgeTypeId', 'legacy'],
  ['GitGraphAdapter', 'storage'],
  ['GitWarpBraidHologram', 'advanced'],
  ['GitWarpBraidHologramMember', 'advanced'],
  ['GitWarpSuffixTransformHologram', 'advanced'],
  ['GitWarpTickHologram', 'advanced'],
  ['GitWarpTickReceiptWitnessCore', 'advanced'],
  ['GitWarpTickWitnessLadder', 'advanced'],
  ['GitWarpWitnessedSuffixAdmissionOutcome', 'advanced'],
  ['GitWarpWitnessedSuffixAdmissionShell', 'advanced'],
  ['GitWarpWitnessedSuffixPatchFact', 'advanced'],
  ['GitWarpWitnessedSuffixSourceFacts', 'advanced'],
  ['GraphAttachmentSetOp', 'legacy'],
  ['GraphContentAttachmentSetOp', 'legacy'],
  ['GraphDiff', 'diagnostics'],
  ['GraphEdgePropertySetOp', 'legacy'],
  ['GraphEdgeRecordSetOp', 'legacy'],
  ['GraphNode', 'legacy'],
  ['GraphNodePropertySetOp', 'legacy'],
  ['GraphNodeRecordSetOp', 'legacy'],
  ['GraphOpAlgebra', 'legacy'],
  ['GraphOpAlgebraProjection', 'diagnostics'],
  ['GraphPersistencePort', 'storage'],
  ['InMemoryGraphAdapter', 'storage'],
  ['LegacyEdgePropertyKey', 'legacy'],
  ['LegacyNodePropertyKey', 'legacy'],
  ['LegacyPropertyProjection', 'legacy'],
  ['LegacyPropertyValue', 'legacy'],
  ['LiveSelector', 'advanced'],
  ['NodeId', 'legacy'],
  ['NodePropertyWriteIntent', 'legacy'],
  ['NodeRecord', 'legacy'],
  ['NodeTypeId', 'legacy'],
  ['Observer', 'advanced'],
  ['ObserverAccumulation', 'advanced'],
  ['ObserverBasis', 'advanced'],
  ['ObserverEmission', 'advanced'],
  ['ObserverPlan', 'advanced'],
  ['ObserverReadingEnvelope', 'advanced'],
  ['Optic', 'advanced'],
  ['OpticAperturePosture', 'advanced'],
  ['OpticBasisPosture', 'advanced'],
  ['OpticCoordinatePosture', 'advanced'],
  ['OpticSupportRule', 'advanced'],
  ['PatchBuilder', 'legacy'],
  ['PatchSession', 'legacy'],
  ['ProjectionHandle', 'advanced'],
  ['QueryBuilder', 'diagnostics'],
  ['RejectedZKWormhole', 'advanced'],
  ['StrandSelector', 'advanced'],
  ['TtdMergeLoweringWitness', 'diagnostics'],
  ['TtdMergeObstructionWitness', 'diagnostics'],
  ['VerifiedZKWormhole', 'advanced'],
  ['VisibleEdgePropertyRecord', 'legacy'],
  ['VisibleNodePropertyRecord', 'legacy'],
  ['WarpApp', 'legacy'],
  ['WarpCore', 'legacy'],
  ['WarpWorldline', 'legacy'],
  ['WarpWorldlineCoordinate', 'advanced'],
  ['WarpWorldlineOpticBasis', 'advanced'],
  ['WorldlineSelector', 'advanced'],
  ['ZKWormholeEdge', 'advanced'],
  ['ZKWormholeProofVerifierPort', 'advanced'],
  ['composeWormholes', 'advanced'],
  ['createBlobValue', 'legacy'],
  ['createEdgeAdd', 'legacy'],
  ['createEdgeTombstone', 'legacy'],
  ['createInlineValue', 'legacy'],
  ['createNodeAdd', 'legacy'],
  ['createNodeTombstone', 'legacy'],
  ['createPropSet', 'legacy'],
  ['createWormhole', 'advanced'],
  ['decodeEdgePropKey', 'legacy'],
  ['deserializeWormhole', 'advanced'],
  ['encodeEdgePropKey', 'legacy'],
  ['exportCoordinateComparisonFact', 'diagnostics'],
  ['exportCoordinateTransferPlanFact', 'diagnostics'],
  ['isEdgePropKey', 'legacy'],
  ['openWarpGraph', 'legacy'],
  ['openWarpWorldline', 'legacy'],
  ['replayWormhole', 'advanced'],
  ['serializeWormhole', 'advanced'],
  ['verifyZKWormhole', 'advanced'],
]);

const BROWSER_EXPORT_MOVE_TARGETS = new Map<string, string>([
  ['GraphNode', 'legacy'],
  ['InMemoryGraphAdapter', 'storage'],
  ['WarpApp', 'legacy'],
  ['WarpCore', 'legacy'],
]);

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort();
}

function hasForbiddenVocabulary(name: string): boolean {
  if (ROOT_ERROR_ALLOWLIST.has(name)) {
    return false;
  }

  return name.includes('Graph')
    || name.includes('Worldline')
    || name.includes('Strand')
    || name.includes('Optic')
    || name.includes('Hologram')
    || name.includes('Witness')
    || name.includes('Braid')
    || name.includes('Wormhole')
    || name.includes('Projection')
    || name.includes('Observer')
    || name.includes('Query')
    || name.includes('Coordinate')
    || name.includes('Selector')
    || name === 'WarpApp'
    || name === 'WarpCore'
    || name === 'PatchBuilder'
    || name === 'PatchSession'
    || name.startsWith('createNode')
    || name.startsWith('createEdge')
    || name.startsWith('createProp')
    || name === 'createInlineValue'
    || name === 'createBlobValue'
    || name === 'decodeEdgePropKey'
    || name === 'encodeEdgePropKey'
    || name === 'isEdgePropKey'
    || GRAPH_SUBSTRATE_NOUNS.has(name);
}

function forbiddenExportsFrom(exportNames: readonly string[]): string[] {
  return sorted(exportNames.filter((name) => hasForbiddenVocabulary(name)));
}

function unclassifiedExports(
  exportNames: readonly string[],
  migrationTargets: ReadonlyMap<string, string>,
): string[] {
  return sorted(
    forbiddenExportsFrom(exportNames).filter((name) => !migrationTargets.has(name)),
  );
}

function invalidMigrationTargetEntries(
  migrationTargets: ReadonlyMap<string, string>,
): string[] {
  const invalidEntries: string[] = [];
  for (const [name, target] of migrationTargets.entries()) {
    if (!VALID_MIGRATION_TARGETS.has(target)) {
      invalidEntries.push(`${name}:${target}`);
    }
  }
  return sorted(invalidEntries);
}

describe('v19 public API boundary', () => {
  it('classifies every forbidden package-root export that still needs migration', () => {
    expect(unclassifiedExports(Object.keys(rootApi), ROOT_EXPORT_MOVE_TARGETS)).toEqual([]);
  });

  it('classifies every forbidden browser export that still needs migration', () => {
    expect(unclassifiedExports(Object.keys(browserApi), BROWSER_EXPORT_MOVE_TARGETS)).toEqual([]);
  });

  it('uses only explicit non-root destinations for classified root leaks', () => {
    expect(invalidMigrationTargetEntries(ROOT_EXPORT_MOVE_TARGETS)).toEqual([]);
    expect(invalidMigrationTargetEntries(BROWSER_EXPORT_MOVE_TARGETS)).toEqual([]);
  });
});
