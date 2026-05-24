import GenesisEquivalenceGateResult from './GenesisEquivalenceGateResult.ts';
import GraphModelMigrationFinalizationConfirmation
  from './GraphModelMigrationFinalizationConfirmation.ts';
import GraphModelMigrationScratchRef from './GraphModelMigrationScratchRef.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationFinalizationRequestFields = {
  readonly liveRefName: string;
  readonly expectedLiveHead: string | null;
  readonly observedLiveHead: string | null;
  readonly scratchRef: GraphModelMigrationScratchRef | null;
  readonly scratchHead: string | null;
  readonly archiveRefName: string | null;
  readonly confirmation: GraphModelMigrationFinalizationConfirmation | null;
  readonly gateResult: GenesisEquivalenceGateResult | null;
};

/** Pure finalization request envelope; it does not move Git refs. */
export default class GraphModelMigrationFinalizationRequest {
  readonly liveRefName: string;
  readonly expectedLiveHead: string | null;
  readonly observedLiveHead: string | null;
  readonly scratchRef: GraphModelMigrationScratchRef | null;
  readonly scratchHead: string | null;
  readonly archiveRefName: string | null;
  readonly confirmation: GraphModelMigrationFinalizationConfirmation | null;
  readonly gateResult: GenesisEquivalenceGateResult | null;

  constructor(fields: GraphModelMigrationFinalizationRequestFields) {
    const checkedFields = requireFields(fields);
    this.liveRefName = requireNonEmptyString(checkedFields.liveRefName, 'liveRefName');
    this.expectedLiveHead = requireOptionalString(checkedFields.expectedLiveHead, 'expectedLiveHead');
    this.observedLiveHead = requireOptionalString(checkedFields.observedLiveHead, 'observedLiveHead');
    this.scratchRef = requireOptionalScratchRef(checkedFields.scratchRef);
    this.scratchHead = requireOptionalString(checkedFields.scratchHead, 'scratchHead');
    this.archiveRefName = requireOptionalString(checkedFields.archiveRefName, 'archiveRefName');
    this.confirmation = requireOptionalConfirmation(checkedFields.confirmation);
    this.gateResult = requireOptionalGateResult(checkedFields.gateResult);
    Object.freeze(this);
  }
}

function requireFields(
  fields: GraphModelMigrationFinalizationRequestFields | null | undefined,
): GraphModelMigrationFinalizationRequestFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationFinalizationRequest fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

function requireOptionalString(value: string | null, name: string): string | null {
  if (value !== null && (typeof value !== 'string' || value.length === 0)) {
    throw new WarpError(`${name} must be a non-empty string or null`, 'E_VALIDATION');
  }
  return value;
}

function requireOptionalScratchRef(
  scratchRef: GraphModelMigrationScratchRef | null,
): GraphModelMigrationScratchRef | null {
  if (scratchRef !== null && !(scratchRef instanceof GraphModelMigrationScratchRef)) {
    throw new WarpError('scratchRef must be a GraphModelMigrationScratchRef or null', 'E_VALIDATION');
  }
  return scratchRef;
}

function requireOptionalConfirmation(
  confirmation: GraphModelMigrationFinalizationConfirmation | null,
): GraphModelMigrationFinalizationConfirmation | null {
  if (confirmation !== null && !(confirmation instanceof GraphModelMigrationFinalizationConfirmation)) {
    throw new WarpError(
      'confirmation must be a GraphModelMigrationFinalizationConfirmation or null',
      'E_VALIDATION',
    );
  }
  return confirmation;
}

function requireOptionalGateResult(
  gateResult: GenesisEquivalenceGateResult | null,
): GenesisEquivalenceGateResult | null {
  if (gateResult !== null && !(gateResult instanceof GenesisEquivalenceGateResult)) {
    throw new WarpError('gateResult must be a GenesisEquivalenceGateResult or null', 'E_VALIDATION');
  }
  return gateResult;
}
