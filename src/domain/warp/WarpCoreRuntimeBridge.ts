import { getWarpRuntimePrototype, openWarpRuntime } from '../WarpRuntime.ts';
import type { WarpRuntimeOpenOptions } from './WarpRuntimeBoot.ts';

type WarpCoreRuntimeSurface = Awaited<ReturnType<typeof openWarpRuntime>>;

export type WarpCoreOpenOptions = WarpRuntimeOpenOptions;
export type StrandCreateOptions = Parameters<WarpCoreRuntimeSurface['createStrand']>[0];
export type StrandDescriptor = Awaited<ReturnType<WarpCoreRuntimeSurface['createStrand']>>;
export type StrandBraidOptions = Parameters<WarpCoreRuntimeSurface['braidStrand']>[1];
export type StrandMaterializeOptions = Parameters<WarpCoreRuntimeSurface['materializeStrand']>[1];
export type StrandMaterializeResult = Awaited<ReturnType<WarpCoreRuntimeSurface['materializeStrand']>>;
export type StrandPatchEntry = Awaited<ReturnType<WarpCoreRuntimeSurface['getStrandPatches']>>[number];
export type StrandPatchListOptions = { ceiling?: number | null };
export type StrandIntentDescriptor = Awaited<ReturnType<WarpCoreRuntimeSurface['queueStrandIntent']>>;
export type StrandTickRecord = Awaited<ReturnType<WarpCoreRuntimeSurface['tickStrand']>>;
export type CompareStrandOptions = Parameters<WarpCoreRuntimeSurface['compareStrand']>[1];
export type CoordinateComparisonV1 = Awaited<ReturnType<WarpCoreRuntimeSurface['compareCoordinates']>>;
export type PlanStrandTransferOptions = Parameters<WarpCoreRuntimeSurface['planStrandTransfer']>[1];
export type CoordinateTransferPlanV1 = Awaited<ReturnType<WarpCoreRuntimeSurface['planCoordinateTransfer']>>;
export type CompareCoordinatesOptions = Parameters<WarpCoreRuntimeSurface['compareCoordinates']>[0];
export type PlanCoordinateTransferOptions = Parameters<WarpCoreRuntimeSurface['planCoordinateTransfer']>[0];
export type ConflictAnalyzeOptions = Parameters<WarpCoreRuntimeSurface['analyzeConflicts']>[0];
export type ConflictAnalysis = Awaited<ReturnType<WarpCoreRuntimeSurface['analyzeConflicts']>>;
export type InternalBraidStrandOptions = Parameters<WarpCoreRuntimeSurface['braidStrand']>[1];
export type InternalCompareStrandOptions = Parameters<WarpCoreRuntimeSurface['compareStrand']>[1];
export type InternalPlanStrandTransferOptions = Parameters<WarpCoreRuntimeSurface['planStrandTransfer']>[1];
export type InternalCompareCoordinatesOptions = Parameters<WarpCoreRuntimeSurface['compareCoordinates']>[0];
export type InternalPlanCoordinateTransferOptions = Parameters<WarpCoreRuntimeSurface['planCoordinateTransfer']>[0];
export type InternalConflictAnalyzeOptions = Parameters<WarpCoreRuntimeSurface['analyzeConflicts']>[0];

export async function openWarpCoreRuntime(
  options: WarpCoreOpenOptions,
): Promise<object> {
  return await openWarpRuntime(options);
}

export function linkWarpCorePrototype(prototype: object): void {
  Object.setPrototypeOf(prototype, getWarpRuntimePrototype());
}
