/**
 * Formal and support-oriented API surface.
 *
 * These exports keep advanced read/evidence machinery out of the package root.
 * Application code should prefer the root intent/timeline/receipt API as it
 * lands through v19.
 */

export {
  BoundedSupportRule,
  CausalIndexPlan,
  composeWormholes,
  createWormhole,
  deserializeWormhole,
  LiveSelector,
  Observer,
  ObserverAccumulation,
  ObserverBasis,
  ObserverEmission,
  ObserverPlan,
  ObserverReadingEnvelope,
  openAperture,
  Optic,
  OpticAperturePosture,
  OpticBasisPosture,
  OpticCoordinatePosture,
  OpticSupportRule,
  ProjectionHandle,
  RejectedZKWormhole,
  replayWormhole,
  serializeWormhole,
  StrandSelector,
  SupportFragmentPlan,
  VerifiedZKWormhole,
  verifyZKWormhole,
  WarpWorldlineCoordinate,
  WarpWorldlineOpticBasis,
  WorldlineSelector,
  ZKWormholeEdge,
  ZKWormholeProofVerifierPort,
} from './legacy.ts';
export * from './src/continuumExports.ts';
export type {
  Aperture,
  ApertureOpeningVerificationResult,
  BoundedSupportDirection,
  BoundedSupportKind,
  BoundedSupportRuleFields,
  BoundedSupportSurface,
  CausalIndexFamily,
  CausalIndexPlanFields,
  CausalIndexPlanPosture,
  ObserverConfig,
  ObserverPlanFields,
  ObserverReadingEnvelopeBudget,
  ObserverReadingEnvelopeFields,
  OpticAperturePostureValue,
  OpticBasisPostureValue,
  OpticContextValue,
  OpticCoordinatePostureValue,
  OpticFields,
  OpticPostureFields,
  OpticSupportRuleValue,
  SupportFragmentMaterializationPosture,
  SupportFragmentPlanFields,
  WarpWorldlineCoordinateFrontierEntry,
  ZKWormholeEdgeFields,
  ZKWormholeVerificationResult,
} from './legacy.ts';
