/**
 * Operator diagnostics and migration inspection surface.
 *
 * Diagnostic exports stay separate from the application root so public
 * first-use code does not learn substrate nouns before it needs them.
 */

export { default as BisectService } from './src/domain/services/BisectService.ts';
export { default as CommitDagTraversalService } from './src/domain/services/dag/CommitDagTraversalService.ts';
export { default as ContentAttachmentProjection } from './src/domain/services/ContentAttachmentProjection.ts';
export {
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
} from './src/domain/services/CoordinateFactExport.ts';
export { default as GraphDiff } from './src/domain/services/comparison/GraphDiff.ts';
export type { GraphDiffFields } from './src/domain/services/comparison/GraphDiff.ts';
export type { GraphDiffOptions } from './src/domain/capabilities/ComparisonCapability.ts';
export { default as GraphOpAlgebraProjection } from './src/domain/services/GraphOpAlgebraProjection.ts';
export { default as QueryBuilder } from './src/domain/services/query/QueryBuilder.ts';
export { default as TtdMergeBranch } from './src/domain/services/merge/TtdMergeBranch.ts';
export type { TtdMergeBranchFields } from './src/domain/services/merge/TtdMergeBranch.ts';
export { default as TtdMergeFootprint } from './src/domain/services/merge/TtdMergeFootprint.ts';
export type { TtdMergeFootprintFields } from './src/domain/services/merge/TtdMergeFootprint.ts';
export { default as TtdMergeInspection } from './src/domain/services/merge/TtdMergeInspection.ts';
export type { TtdMergeInspectionFields } from './src/domain/services/merge/TtdMergeInspection.ts';
export type { TtdMergeInspectionDomain } from './src/domain/services/merge/TtdMergeInspectionDomain.ts';
export { default as TtdMergeInspector } from './src/domain/services/merge/TtdMergeInspector.ts';
export type {
  TtdMergeObjectBranchInput,
  TtdMergeObjectInspectionInput,
} from './src/domain/services/merge/TtdMergeInspector.ts';
export type { TtdMergeLoweringSurface } from './src/domain/services/merge/TtdMergeLoweringSurface.ts';
export { default as TtdMergeLoweringWitness } from './src/domain/services/merge/TtdMergeLoweringWitness.ts';
export type { TtdMergeLoweringWitnessFields } from './src/domain/services/merge/TtdMergeLoweringWitness.ts';
export { default as TtdMergeObstructionWitness } from './src/domain/services/merge/TtdMergeObstructionWitness.ts';
export type { TtdMergeObstructionWitnessFields } from './src/domain/services/merge/TtdMergeObstructionWitness.ts';
export { default as TtdMergePolicyRequirement } from './src/domain/services/merge/TtdMergePolicyRequirement.ts';
export type { TtdMergePolicyRequirementFields } from './src/domain/services/merge/TtdMergePolicyRequirement.ts';
export {
  normalizeVisibleStateScope,
  nodeIdInVisibleStateScope,
  scopeMaterializedState,
} from './src/domain/services/VisibleStateScope.ts';
export type {
  VisibleStateScope,
  VisibleStateScopePrefixFilter,
} from './src/domain/services/VisibleStateScope.ts';
