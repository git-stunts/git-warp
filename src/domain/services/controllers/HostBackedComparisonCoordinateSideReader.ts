import QueryError from '../../errors/QueryError.ts';
import createStrandCoordinator, {
  type StrandCoordinatorGraphRuntime,
} from '../strand/createStrandCoordinator.ts';
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

type HostBackedComparisonCoordinateSideReadSource =
  ComparisonCoordinateSideReadSource & StrandCoordinatorGraphRuntime;

type RuntimeCapabilityName =
  | 'getFrontier'
  | '_materializeCoordinateGraph'
  | '_loadPatchChainFromSha'
  | '_setMaterializedState';

type RuntimeFieldName =
  | '_graphName'
  | '_persistence'
  | '_crypto'
  | '_maxObservedLamport'
  | '_provenanceDegraded'
  | '_patchInProgress'
  | '_stateDirty'
  | '_commitMessageCodec'
  | '_codec'
  | '_onDeleteWithData';

const REQUIRED_RUNTIME_CAPABILITIES: readonly RuntimeCapabilityName[] = Object.freeze([
  'getFrontier',
  '_materializeCoordinateGraph',
  '_loadPatchChainFromSha',
  '_setMaterializedState',
]);

const REQUIRED_RUNTIME_FIELDS: readonly RuntimeFieldName[] = Object.freeze([
  '_graphName',
  '_persistence',
  '_crypto',
  '_maxObservedLamport',
  '_provenanceDegraded',
  '_patchInProgress',
  '_stateDirty',
  '_commitMessageCodec',
  '_codec',
  '_onDeleteWithData',
]);

const OPTIONAL_RUNTIME_FIELDS = Object.freeze([
  '_cachedCeiling',
  '_cachedFrontier',
  '_lastFrontier',
  '_cachedViewHash',
  '_cachedState',
] as const);

const VALID_DELETE_WITH_DATA_VALUES = Object.freeze([
  'reject',
  'cascade',
  'warn',
] as const);

function assertFunctionCapability(
  source: HostBackedComparisonCoordinateSideReadSource,
  name: RuntimeCapabilityName,
): void {
  if (typeof source[name] !== 'function') {
    throw new QueryError(`comparison coordinate side reader source requires ${name}()`, {
      code: 'invalid_coordinate',
      context: { dependency: name },
    });
  }
}

function assertRuntimeField(
  source: HostBackedComparisonCoordinateSideReadSource,
  name: RuntimeFieldName,
): void {
  if (source[name] === undefined || source[name] === null) {
    throw new QueryError(`comparison coordinate side reader source requires ${name}`, {
      code: 'invalid_coordinate',
      context: { dependency: name },
    });
  }
}

function assertOptionalRuntimeField(
  source: HostBackedComparisonCoordinateSideReadSource,
  name: typeof OPTIONAL_RUNTIME_FIELDS[number],
): void {
  if (!(name in source)) {
    throw new QueryError(`comparison coordinate side reader source requires ${name}`, {
      code: 'invalid_coordinate',
      context: { dependency: name },
    });
  }
}

function validateCoordinateSideReadSource(source: HostBackedComparisonCoordinateSideReadSource): void {
  for (const capability of REQUIRED_RUNTIME_CAPABILITIES) {
    assertFunctionCapability(source, capability);
  }
  for (const field of REQUIRED_RUNTIME_FIELDS) {
    assertRuntimeField(source, field);
  }
  for (const field of OPTIONAL_RUNTIME_FIELDS) {
    assertOptionalRuntimeField(source, field);
  }
  if (!VALID_DELETE_WITH_DATA_VALUES.includes(source._onDeleteWithData)) {
    throw new QueryError('comparison coordinate side reader source has invalid _onDeleteWithData', {
      code: 'invalid_coordinate',
      context: { dependency: '_onDeleteWithData' },
    });
  }
}

export default class HostBackedComparisonCoordinateSideReader implements ComparisonCoordinateSideReadPort {
  private readonly source: HostBackedComparisonCoordinateSideReadSource;

  constructor(source: HostBackedComparisonCoordinateSideReadSource) {
    if (source === null || source === undefined) {
      throw new QueryError('comparison coordinate side reader requires a source', {
        code: 'invalid_coordinate',
      });
    }
    validateCoordinateSideReadSource(source);
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
