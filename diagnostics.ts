/**
 * Operator diagnostics and migration inspection surface.
 *
 * Diagnostic exports stay separate from the application root so public
 * first-use code does not learn substrate nouns before it needs them.
 */

export {
  BisectService,
  CommitDagTraversalService,
  ContentAttachmentProjection,
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
  GraphDiff,
  GraphOpAlgebraProjection,
  QueryBuilder,
  TtdMergeBranch,
  TtdMergeFootprint,
  TtdMergeInspection,
  TtdMergeInspector,
  TtdMergeLoweringWitness,
  TtdMergeObstructionWitness,
  TtdMergePolicyRequirement,
} from './legacy.ts';
export type {
  GraphDiffFields,
  GraphDiffOptions,
  TtdMergeBranchFields,
  TtdMergeFootprintFields,
  TtdMergeInspectionDomain,
  TtdMergeInspectionFields,
  TtdMergeLoweringSurface,
  TtdMergeLoweringWitnessFields,
  TtdMergeObjectBranchInput,
  TtdMergeObjectInspectionInput,
  TtdMergeObstructionWitnessFields,
  TtdMergePolicyRequirementFields,
} from './legacy.ts';
export {
  normalizeVisibleStateScope,
  nodeIdInVisibleStateScope,
  scopeMaterializedState,
} from './src/domain/services/VisibleStateScope.ts';
export type {
  VisibleStateScope,
  VisibleStateScopePrefixFilter,
} from './src/domain/services/VisibleStateScope.ts';
