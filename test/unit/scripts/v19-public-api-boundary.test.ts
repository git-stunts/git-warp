import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  extractJsExports,
  parseExportBlock,
} from '../../../scripts/check-dts-surface.ts';

const REPO_ROOT = new URL('../../../', import.meta.url);

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
  ['CasVaultResolutionWitness', 'advanced'],
  ['ContinuumReceiptFamilyProjection', 'advanced'],
  ['ContinuumReceiptFamilyProjectionFields', 'advanced'],
  ['ContinuumReceiptWitnessFact', 'advanced'],
  ['CoordinateSelector', 'advanced'],
  ['EdgeId', 'legacy'],
  ['EdgePropertyWriteIntent', 'legacy'],
  ['EdgeRecord', 'legacy'],
  ['EdgeTypeId', 'legacy'],
  ['GitGraphAdapter', 'storage'],
  ['GitWarpBraidHologram', 'advanced'],
  ['GitWarpBraidHologramFields', 'advanced'],
  ['GitWarpBraidHologramMember', 'advanced'],
  ['GitWarpBraidHologramMemberFields', 'advanced'],
  ['GitWarpSuffixTransformHologram', 'advanced'],
  ['GitWarpSuffixTransformHologramFields', 'advanced'],
  ['GitWarpTickHologram', 'advanced'],
  ['GitWarpTickHologramFields', 'advanced'],
  ['GitWarpTickReceiptWitnessCore', 'advanced'],
  ['GitWarpTickReceiptWitnessCoreFields', 'advanced'],
  ['GitWarpTickWitnessLadder', 'advanced'],
  ['GitWarpTickWitnessLadderFields', 'advanced'],
  ['GitWarpWitnessedSuffixAdmissionOutcome', 'advanced'],
  ['GitWarpWitnessedSuffixAdmissionOutcomeValue', 'advanced'],
  ['GitWarpWitnessedSuffixAdmissionShell', 'advanced'],
  ['GitWarpWitnessedSuffixAdmissionShellFields', 'advanced'],
  ['GitWarpWitnessedSuffixPatchFact', 'advanced'],
  ['GitWarpWitnessedSuffixPatchFactFields', 'advanced'],
  ['GitWarpWitnessedSuffixSourceFacts', 'advanced'],
  ['GitWarpWitnessedSuffixSourceFactsFields', 'advanced'],
  ['GraphAttachmentSetOp', 'legacy'],
  ['GraphAttachmentSetOpFields', 'legacy'],
  ['GraphContentAttachmentSetOp', 'legacy'],
  ['GraphContentAttachmentSetOpFields', 'legacy'],
  ['GraphDiff', 'diagnostics'],
  ['GraphDiffFields', 'diagnostics'],
  ['GraphDiffOptions', 'diagnostics'],
  ['GraphEdgePropertySetOp', 'legacy'],
  ['GraphEdgePropertySetOpFields', 'legacy'],
  ['GraphEdgeRecordSetOp', 'legacy'],
  ['GraphEdgeRecordSetOpFields', 'legacy'],
  ['GraphNode', 'legacy'],
  ['GraphNodePropertySetOp', 'legacy'],
  ['GraphNodePropertySetOpFields', 'legacy'],
  ['GraphNodeRecordSetOp', 'legacy'],
  ['GraphNodeRecordSetOpFields', 'legacy'],
  ['GraphOpAlgebra', 'legacy'],
  ['GraphOpAlgebraFields', 'legacy'],
  ['GraphOpAlgebraProjection', 'diagnostics'],
  ['GraphOperation', 'legacy'],
  ['GraphPersistencePort', 'storage'],
  ['InMemoryGraphAdapter', 'storage'],
  ['LegacyEdgePropertyKey', 'legacy'],
  ['LegacyNodePropertyKey', 'legacy'],
  ['LegacyPropertyProjection', 'legacy'],
  ['LegacyPropertyProjectionFields', 'legacy'],
  ['LegacyPropertyValue', 'legacy'],
  ['LiveSelector', 'advanced'],
  ['NodeId', 'legacy'],
  ['NodePropertyWriteIntent', 'legacy'],
  ['NodeRecord', 'legacy'],
  ['NodeTypeId', 'legacy'],
  ['Observer', 'advanced'],
  ['ObserverAccumulation', 'advanced'],
  ['ObserverBasis', 'advanced'],
  ['ObserverConfig', 'advanced'],
  ['ObserverEmission', 'advanced'],
  ['ObserverPlan', 'advanced'],
  ['ObserverPlanFields', 'advanced'],
  ['ObserverReadingEnvelopeBudget', 'advanced'],
  ['ObserverReadingEnvelope', 'advanced'],
  ['ObserverReadingEnvelopeFields', 'advanced'],
  ['OperationRetryObserver', 'advanced'],
  ['Optic', 'advanced'],
  ['OpticAperturePosture', 'advanced'],
  ['OpticAperturePostureValue', 'advanced'],
  ['OpticBasisPosture', 'advanced'],
  ['OpticBasisPostureValue', 'advanced'],
  ['OpticContextValue', 'advanced'],
  ['OpticCoordinatePosture', 'advanced'],
  ['OpticCoordinatePostureValue', 'advanced'],
  ['OpticFields', 'advanced'],
  ['OpticPostureFields', 'advanced'],
  ['OpticSupportRule', 'advanced'],
  ['OpticSupportRuleValue', 'advanced'],
  ['PatchBuilder', 'legacy'],
  ['PatchSession', 'legacy'],
  ['ProjectionHandle', 'advanced'],
  ['QueryBuilder', 'diagnostics'],
  ['RejectedZKWormhole', 'advanced'],
  ['StrandSelector', 'advanced'],
  ['TtdMergeLoweringWitness', 'diagnostics'],
  ['TtdMergeLoweringWitnessFields', 'diagnostics'],
  ['TtdMergeObstructionWitness', 'diagnostics'],
  ['TtdMergeObstructionWitnessFields', 'diagnostics'],
  ['VerifiedZKWormhole', 'advanced'],
  ['VisibleEdgePropertyRecord', 'legacy'],
  ['VisibleNodePropertyRecord', 'legacy'],
  ['WarpApp', 'legacy'],
  ['WarpCore', 'legacy'],
  ['WarpWorldline', 'legacy'],
  ['WarpWorldlineCoordinate', 'advanced'],
  ['WarpWorldlineCoordinateFrontierEntry', 'advanced'],
  ['WarpWorldlineOpenOptions', 'legacy'],
  ['WarpWorldlinePatchBuild', 'legacy'],
  ['WarpWorldlineOpticBasis', 'advanced'],
  ['WorldlineSelector', 'advanced'],
  ['ZKWormholeEdge', 'advanced'],
  ['ZKWormholeEdgeFields', 'advanced'],
  ['ZKWormholeProofVerifierPort', 'advanced'],
  ['ZKWormholeVerificationResult', 'advanced'],
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

function collectSourceExports(relativePath: string): string[] {
  return sorted(collectSourceExportsFrom(new URL(relativePath, REPO_ROOT), new Set<string>()));
}

function collectSourceExportsFrom(sourceUrl: URL, visited: Set<string>): Set<string> {
  const visitKey = sourceUrl.href;
  if (visited.has(visitKey)) {
    return new Set<string>();
  }
  visited.add(visitKey);

  const source = readFileSync(sourceUrl, 'utf8');
  const names = extractJsExports(source);
  for (const match of source.matchAll(/export\s+type\s*\{([^}]+)\}/g)) {
    for (const name of parseExportBlock(match[1] ?? '')) {
      names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      for (const name of collectSourceExportsFrom(new URL(specifier, sourceUrl), visited)) {
        names.add(name);
      }
    }
  }
  return names;
}

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
    expect(unclassifiedExports(collectSourceExports('index.ts'), ROOT_EXPORT_MOVE_TARGETS)).toEqual([]);
  });

  it('classifies every forbidden browser export that still needs migration', () => {
    expect(unclassifiedExports(collectSourceExports('browser.ts'), BROWSER_EXPORT_MOVE_TARGETS)).toEqual([]);
  });

  it('uses only explicit non-root destinations for classified root leaks', () => {
    expect(invalidMigrationTargetEntries(ROOT_EXPORT_MOVE_TARGETS)).toEqual([]);
    expect(invalidMigrationTargetEntries(BROWSER_EXPORT_MOVE_TARGETS)).toEqual([]);
  });
});
