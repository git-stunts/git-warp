import { compareStrings } from '../utils/StringComparison.ts';
import DryRunGraphModelMigrationPlan from './DryRunGraphModelMigrationPlan.ts';
import DryRunGraphModelMigrationPlanRequest from './DryRunGraphModelMigrationPlanRequest.ts';
import GraphModelMigrationBasis from './GraphModelMigrationBasis.ts';
import GraphModelMigrationContentMapping from './GraphModelMigrationContentMapping.ts';
import GraphModelMigrationManifest from './GraphModelMigrationManifest.ts';
import GraphModelMigrationManifestVersion from './GraphModelMigrationManifestVersion.ts';
import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import GraphModelMigrationPlannedGraphOperation from './GraphModelMigrationPlannedGraphOperation.ts';
import WarpError from '../errors/WarpError.ts';
import type GraphModelMigrationContentSource from './GraphModelMigrationContentSource.ts';
import type GraphModelMigrationPropertyMapping from './GraphModelMigrationPropertyMapping.ts';

const MISSING_CONTENT_SOURCE_CODE = 'E_MISSING_CONTENT_SOURCE';
const DRY_RUN_TARGET_BASIS_SUFFIX = ':v18-dry-run';
const CONTENT_ATTACHMENT_PREFIX = 'content-attachment:';
const PROPERTY_TARGET_KEY_FORMAT = 'property-target-key:length-prefixed-v1';
const PROPERTY_TARGET_KEY_SEPARATOR = ':';

/** Pure domain planner for graph-model migration dry runs. */
export default class DryRunGraphModelMigrationPlanner {
  /** Creates a deterministic dry-run plan without reading or writing graph history. */
  plan(request: DryRunGraphModelMigrationPlanRequest): DryRunGraphModelMigrationPlan {
    return planForRequest(requireRequest(request));
  }
}

/** Builds a plan from an already validated request. */
function planForRequest(
  request: DryRunGraphModelMigrationPlanRequest,
): DryRunGraphModelMigrationPlan {
  const { inventory } = request;
  const { sourceBasis, fatalErrors: sourceFatalErrors, warnings } = inventory;
  if (sourceBasis === null || sourceFatalErrors.length > 0) {
    return failedPlan(warnings, sourceFatalErrors);
  }
  const contentMappings = plannedContentMappings(inventory.contentSources);
  const fatalErrors = missingContentSourceErrors(request.requiredContentKeys, contentMappings);
  if (fatalErrors.length > 0) {
    return failedPlan(warnings, fatalErrors);
  }
  return successfulPlan(request, sourceBasis, contentMappings);
}

/** Builds a successful dry-run plan value. */
function successfulPlan(
  request: DryRunGraphModelMigrationPlanRequest,
  sourceBasis: GraphModelMigrationBasis,
  contentMappings: readonly GraphModelMigrationContentMapping[],
): DryRunGraphModelMigrationPlan {
  const manifest = new GraphModelMigrationManifest({
    version: GraphModelMigrationManifestVersion.current(),
    sourceBasis,
    targetBasis: targetBasisFor(sourceBasis),
    nodeMappings: request.nodeMappings,
    edgeMappings: request.edgeMappings,
    propertyMappings: request.propertyMappings,
    contentMappings,
    warnings: request.inventory.warnings,
    fatalErrors: [],
  });
  return new DryRunGraphModelMigrationPlan({
    manifest,
    plannedOperations: plannedOperationsFor(request, contentMappings),
    warnings: request.inventory.warnings,
    fatalErrors: [],
  });
}

/** Requires a planner request instance. */
function requireRequest(request: DryRunGraphModelMigrationPlanRequest): DryRunGraphModelMigrationPlanRequest {
  if (!(request instanceof DryRunGraphModelMigrationPlanRequest)) {
    throw new WarpError('request must be a DryRunGraphModelMigrationPlanRequest', 'E_VALIDATION');
  }
  return request;
}

/** Builds a failed dry-run result value. */
function failedPlan(
  warnings: readonly GraphModelMigrationNotice[],
  fatalErrors: readonly GraphModelMigrationNotice[],
): DryRunGraphModelMigrationPlan {
  return new DryRunGraphModelMigrationPlan({
    manifest: null,
    plannedOperations: [],
    warnings,
    fatalErrors,
  });
}

/** Returns the deterministic dry-run target basis for a source basis. */
function targetBasisFor(sourceBasis: GraphModelMigrationBasis): GraphModelMigrationBasis {
  return new GraphModelMigrationBasis({
    graphId: sourceBasis.graphId,
    basisId: `${sourceBasis.basisId}${DRY_RUN_TARGET_BASIS_SUFFIX}`,
  });
}

/** Plans content mappings from collected content source facts. */
function plannedContentMappings(
  contentSources: readonly GraphModelMigrationContentSource[],
): readonly GraphModelMigrationContentMapping[] {
  return Object.freeze([...contentSources]
    .sort(compareContentSources)
    .map((source) => new GraphModelMigrationContentMapping({
      legacyContentKey: source.legacyContentKey,
      targetAttachmentKey: targetAttachmentKeyFor(source.legacyContentKey),
    })));
}

/** Creates missing-content fatal errors for required content sources. */
function missingContentSourceErrors(
  requiredContentKeys: readonly string[],
  contentMappings: readonly GraphModelMigrationContentMapping[],
): readonly GraphModelMigrationNotice[] {
  const contentKeys = new Set(contentMappings.map((mapping) => mapping.legacyContentKey));
  const fatalErrors: GraphModelMigrationNotice[] = [];
  for (const requiredContentKey of requiredContentKeys) {
    if (!contentKeys.has(requiredContentKey)) {
      fatalErrors.push(GraphModelMigrationNotice.fatal(
        MISSING_CONTENT_SOURCE_CODE,
        `missing content source ${requiredContentKey}`,
      ));
    }
  }
  return Object.freeze(fatalErrors);
}

/** Builds planned graph operation facts from manifest mapping inputs. */
function plannedOperationsFor(
  request: DryRunGraphModelMigrationPlanRequest,
  contentMappings: readonly GraphModelMigrationContentMapping[],
): readonly GraphModelMigrationPlannedGraphOperation[] {
  const operations: GraphModelMigrationPlannedGraphOperation[] = [];
  for (const nodeMapping of request.nodeMappings) {
    operations.push(GraphModelMigrationPlannedGraphOperation.nodeRecord(
      nodeMapping.legacyNodeId,
      nodeMapping.targetNodeId,
    ));
  }
  for (const edgeMapping of request.edgeMappings) {
    operations.push(GraphModelMigrationPlannedGraphOperation.edgeRecord(
      edgeMapping.legacyEdgeId,
      edgeMapping.targetEdgeId,
    ));
  }
  for (const propertyMapping of request.propertyMappings) {
    operations.push(plannedPropertyOperation(propertyMapping));
  }
  for (const contentMapping of contentMappings) {
    operations.push(GraphModelMigrationPlannedGraphOperation.contentAttachment(
      contentMapping.legacyContentKey,
      contentMapping.targetAttachmentKey,
    ));
  }
  return Object.freeze(operations.sort(comparePlannedOperations));
}

/** Builds a planned property operation fact. */
function plannedPropertyOperation(
  propertyMapping: GraphModelMigrationPropertyMapping,
): GraphModelMigrationPlannedGraphOperation {
  return GraphModelMigrationPlannedGraphOperation.property(
    propertyMapping.legacyKey(),
    encodePropertyTargetKey(propertyMapping.targetOwnerId, propertyMapping.targetPropertyKey),
  );
}

/** Encodes target property identity without delimiter collisions. */
function encodePropertyTargetKey(ownerId: string, propertyKey: string): string {
  return [
    PROPERTY_TARGET_KEY_FORMAT,
    ownerId.length,
    ownerId,
    propertyKey.length,
    propertyKey,
  ].join(PROPERTY_TARGET_KEY_SEPARATOR);
}

/** Returns the deterministic dry-run target attachment key. */
function targetAttachmentKeyFor(legacyContentKey: string): string {
  return `${CONTENT_ATTACHMENT_PREFIX}${legacyContentKey}`;
}

/** Compares content source facts deterministically. */
function compareContentSources(
  left: GraphModelMigrationContentSource,
  right: GraphModelMigrationContentSource,
): number {
  return compareStrings(left.legacyContentKey, right.legacyContentKey);
}

/** Compares planned graph operation facts deterministically. */
function comparePlannedOperations(
  left: GraphModelMigrationPlannedGraphOperation,
  right: GraphModelMigrationPlannedGraphOperation,
): number {
  return compareStrings(left.toKey(), right.toKey());
}
