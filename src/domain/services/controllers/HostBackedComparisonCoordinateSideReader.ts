import QueryError from '../../errors/QueryError.ts';
import createStrandCoordinator from '../strand/createStrandCoordinator.ts';
import type { WarpState } from '../JoinReducer.ts';
import type {
  ComparisonCoordinateSideRead,
  ComparisonCoordinateSideReadPort,
  CoordinateComparisonSideReadRequest,
  LiveComparisonSideReadRequest,
  StrandBaseComparisonSideReadRequest,
} from './ComparisonCoordinateSideReadPort.ts';
import {
  buildCoordinateRequest,
  buildStrandMetadata,
  collectPatchEntriesForFrontier,
  combineCeilings,
  frontierRecordToMap,
  normalizeFrontierRecord,
  optionalCeiling,
  type ComparisonCoordinateSideReadSource,
  type PatchEntry,
} from './ComparisonSelector.ts';

function assertStrandCoordinatorSource(
  source: ComparisonCoordinateSideReadSource,
): asserts source is ComparisonCoordinateSideReadSource & Parameters<typeof createStrandCoordinator>[0] {
  void source;
}

export default class HostBackedComparisonCoordinateSideReader implements ComparisonCoordinateSideReadPort {
  private readonly source: ComparisonCoordinateSideReadSource;

  constructor(source: ComparisonCoordinateSideReadSource) {
    if (source === null || source === undefined) {
      throw new QueryError('comparison coordinate side reader requires a source', {
        code: 'invalid_coordinate',
      });
    }
    this.source = source;
    Object.freeze(this);
  }

  async liveFrontier(): Promise<Map<string, string>> {
    return await this.source.getFrontier();
  }

  async readLiveSide(request: LiveComparisonSideReadRequest): Promise<ComparisonCoordinateSideRead> {
    const frontierRecord = normalizeFrontierRecord(request.frontier, 'live.frontier');
    return await this.readFrontierSide({
      frontierRecord,
      ceiling: request.ceiling,
      requested: { kind: 'live', ...optionalCeiling(request.ceiling) },
      coordinateKind: 'frontier',
      lamportCeiling: request.ceiling,
    });
  }

  async readCoordinateSide(request: CoordinateComparisonSideReadRequest): Promise<ComparisonCoordinateSideRead> {
    return await this.readFrontierSide({
      frontierRecord: request.frontier,
      ceiling: request.ceiling,
      requested: { ...buildCoordinateRequest(request.frontier, request.ceiling), kind: 'coordinate' },
      coordinateKind: 'frontier',
      lamportCeiling: request.ceiling,
    });
  }

  async readStrandBaseSide(request: StrandBaseComparisonSideReadRequest): Promise<ComparisonCoordinateSideRead> {
    assertStrandCoordinatorSource(this.source);
    const strands = createStrandCoordinator(this.source);
    const descriptor = await strands.getOrThrow(request.strandId);
    const effectiveCeiling = combineCeilings(descriptor.baseObservation.lamportCeiling, request.ceiling);
    const frontierRecord = normalizeFrontierRecord(descriptor.baseObservation.frontier, 'strand_base.frontier');
    return await this.readFrontierSide({
      frontierRecord,
      ceiling: effectiveCeiling,
      requested: {
        kind: 'strand_base',
        strandId: request.strandId,
        frontier: frontierRecord,
        baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
        ...optionalCeiling(request.ceiling),
      },
      coordinateKind: 'strand_base',
      lamportCeiling: effectiveCeiling,
      strand: buildStrandMetadata(request.strandId, descriptor),
    });
  }

  private async readFrontierSide(params: {
    readonly frontierRecord: Record<string, string>;
    readonly ceiling: number | null;
    readonly requested: ComparisonCoordinateSideRead['requested'];
    readonly coordinateKind: 'frontier' | 'strand_base';
    readonly lamportCeiling: number | null;
    readonly strand?: ComparisonCoordinateSideRead['strand'];
  }): Promise<ComparisonCoordinateSideRead> {
    const { state } = await this.source._materializeCoordinateGraph({
      frontier: frontierRecordToMap(params.frontierRecord),
      ...optionalCeiling(params.ceiling),
    });
    const patchEntries = await collectPatchEntriesForFrontier(
      this.source,
      params.frontierRecord,
      params.ceiling,
    );
    return this.buildRead({ ...params, state, patchEntries });
  }

  private buildRead(params: {
    readonly requested: ComparisonCoordinateSideRead['requested'];
    readonly state: WarpState;
    readonly patchEntries: readonly PatchEntry[];
    readonly coordinateKind: 'frontier' | 'strand_base';
    readonly lamportCeiling: number | null;
    readonly strand?: ComparisonCoordinateSideRead['strand'];
  }): ComparisonCoordinateSideRead {
    return {
      requested: params.requested,
      state: params.state,
      patchEntries: params.patchEntries,
      coordinateKind: params.coordinateKind,
      lamportCeiling: params.lamportCeiling,
      ...(params.strand !== undefined ? { strand: params.strand } : {}),
    };
  }
}
