import WarpRuntime from '../WarpRuntime.ts';

export type WarpCoreOpenOptions = Parameters<typeof WarpRuntime.open>[0];
export type StrandCreateOptions = Parameters<WarpRuntime['createStrand']>[0];
export type StrandDescriptor = Awaited<ReturnType<WarpRuntime['createStrand']>>;
export type StrandBraidOptions = Parameters<WarpRuntime['braidStrand']>[1];
export type StrandMaterializeOptions = Parameters<WarpRuntime['materializeStrand']>[1];
export type StrandMaterializeResult = Awaited<ReturnType<WarpRuntime['materializeStrand']>>;
export type StrandPatchEntry = Awaited<ReturnType<WarpRuntime['getStrandPatches']>>[number];
export type StrandPatchListOptions = { ceiling?: number | null };
export type StrandIntentDescriptor = Awaited<ReturnType<WarpRuntime['queueStrandIntent']>>;
export type StrandTickRecord = Awaited<ReturnType<WarpRuntime['tickStrand']>>;
export type CompareStrandOptions = Parameters<WarpRuntime['compareStrand']>[1];
export type CoordinateComparisonV1 = Awaited<ReturnType<WarpRuntime['compareCoordinates']>>;
export type PlanStrandTransferOptions = Parameters<WarpRuntime['planStrandTransfer']>[1];
export type CoordinateTransferPlanV1 = Awaited<ReturnType<WarpRuntime['planCoordinateTransfer']>>;
export type CompareCoordinatesOptions = Parameters<WarpRuntime['compareCoordinates']>[0];
export type PlanCoordinateTransferOptions = Parameters<WarpRuntime['planCoordinateTransfer']>[0];
export type ConflictAnalyzeOptions = Parameters<WarpRuntime['analyzeConflicts']>[0];
export type ConflictAnalysis = Awaited<ReturnType<WarpRuntime['analyzeConflicts']>>;
export type InternalBraidStrandOptions = Parameters<WarpRuntime['braidStrand']>[1];
export type InternalCompareStrandOptions = Parameters<WarpRuntime['compareStrand']>[1];
export type InternalPlanStrandTransferOptions = Parameters<WarpRuntime['planStrandTransfer']>[1];
export type InternalCompareCoordinatesOptions = Parameters<WarpRuntime['compareCoordinates']>[0];
export type InternalPlanCoordinateTransferOptions = Parameters<WarpRuntime['planCoordinateTransfer']>[0];
export type InternalConflictAnalyzeOptions = Parameters<WarpRuntime['analyzeConflicts']>[0];

export async function openWarpCoreRuntime(
  options: WarpCoreOpenOptions,
): Promise<object> {
  return await WarpRuntime.open(options);
}

export function linkWarpCorePrototype(prototype: object): void {
  Object.setPrototypeOf(prototype, WarpRuntime.prototype);
}
