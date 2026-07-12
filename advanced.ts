/**
 * Formal and support-oriented API surface.
 *
 * These exports keep advanced read/evidence machinery out of the package root.
 * Application code should prefer the root intent/timeline/receipt API as it
 * lands through v19.
 */

export { default as BoundedSupportRule } from './src/domain/services/query/BoundedSupportRule.ts';
export type {
  BoundedSupportDirection,
  BoundedSupportKind,
  BoundedSupportRuleFields,
  BoundedSupportSurface,
} from './src/domain/services/query/BoundedSupportRule.ts';
export { default as CausalIndexPlan } from './src/domain/services/query/CausalIndexPlan.ts';
export type {
  CausalIndexFamily,
  CausalIndexPlanFields,
  CausalIndexPlanPosture,
} from './src/domain/services/query/CausalIndexPlan.ts';
export {
  composeWormholes,
  createWormhole,
  deserializeWormhole,
  replayWormhole,
  serializeWormhole,
} from './src/application/WormholeServiceDefaults.ts';
export { default as LiveSelector } from './src/domain/types/LiveSelector.ts';
export { default as Observer } from './src/domain/services/query/Observer.ts';
export { default as ObserverAccumulation } from './src/domain/services/query/ObserverAccumulation.ts';
export { default as ObserverBasis } from './src/domain/services/query/ObserverBasis.ts';
export { default as ObserverEmission } from './src/domain/services/query/ObserverEmission.ts';
export { default as ObserverPlan } from './src/domain/services/query/ObserverPlan.ts';
export type { ObserverPlanFields } from './src/domain/services/query/ObserverPlan.ts';
export { default as ObserverReadingEnvelope } from './src/domain/services/query/ObserverReadingEnvelope.ts';
export type {
  ObserverReadingEnvelopeBudget,
  ObserverReadingEnvelopeFields,
} from './src/domain/services/query/ObserverReadingEnvelope.ts';
export {
  openAperture,
  verifyZKWormhole,
} from './src/domain/services/wormhole/ZKWormholeService.ts';
export { default as Optic } from './src/domain/services/optic/Optic.ts';
export type {
  OpticContextValue,
  OpticFields,
  OpticPostureFields,
} from './src/domain/services/optic/Optic.ts';
export { default as OpticAperturePosture } from './src/domain/services/optic/OpticAperturePosture.ts';
export type { OpticAperturePostureValue } from './src/domain/services/optic/OpticAperturePosture.ts';
export { default as OpticBasisPosture } from './src/domain/services/optic/OpticBasisPosture.ts';
export type { OpticBasisPostureValue } from './src/domain/services/optic/OpticBasisPosture.ts';
export { default as OpticCoordinatePosture } from './src/domain/services/optic/OpticCoordinatePosture.ts';
export type { OpticCoordinatePostureValue } from './src/domain/services/optic/OpticCoordinatePosture.ts';
export { default as OpticSupportRule } from './src/domain/services/optic/OpticSupportRule.ts';
export type { OpticSupportRuleValue } from './src/domain/services/optic/OpticSupportRule.ts';
export { default as ProjectionHandle } from './src/domain/services/ProjectionHandle.ts';
export { default as RejectedZKWormhole } from './src/domain/services/wormhole/RejectedZKWormhole.ts';
export { default as StrandSelector } from './src/domain/types/StrandSelector.ts';
export { default as SupportFragmentPlan } from './src/domain/services/query/SupportFragmentPlan.ts';
export type {
  SupportFragmentMaterializationPosture,
  SupportFragmentPlanFields,
} from './src/domain/services/query/SupportFragmentPlan.ts';
export { default as VerifiedZKWormhole } from './src/domain/services/wormhole/VerifiedZKWormhole.ts';
export { default as WarpWorldlineCoordinate } from './src/domain/WarpWorldlineCoordinate.ts';
export type { WarpWorldlineCoordinateFrontierEntry } from './src/domain/WarpWorldlineCoordinate.ts';
export { default as WarpWorldlineOpticBasis } from './src/domain/WarpWorldlineOpticBasis.ts';
export { default as WorldlineSelector } from './src/domain/types/WorldlineSelector.ts';
export { default as ZKWormholeEdge } from './src/domain/services/wormhole/ZKWormholeEdge.ts';
export type { ZKWormholeEdgeFields } from './src/domain/services/wormhole/ZKWormholeEdge.ts';
export type {
  ApertureOpeningVerificationResult,
  ZKWormholeVerificationResult,
} from './src/domain/services/wormhole/ZKWormholeVerificationResult.ts';
export { default as ZKWormholeProofVerifierPort } from './src/ports/ZKWormholeProofVerifierPort.ts';
export type { Aperture, ObserverConfig } from './src/domain/types/Aperture.ts';
export * from './src/continuumExports.ts';
