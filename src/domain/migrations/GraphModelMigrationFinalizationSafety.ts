import GraphModelMigrationArchiveRef from './GraphModelMigrationArchiveRef.ts';
import GraphModelMigrationFinalizationRequest from './GraphModelMigrationFinalizationRequest.ts';
import GraphModelMigrationFinalizationSafetyResult from './GraphModelMigrationFinalizationSafetyResult.ts';
import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import WarpError from '../errors/WarpError.ts';

const LIVE_REF_PREFIX = 'refs/warp/';

/** Pure finalization safety gate before any live Git ref update can run. */
export default class GraphModelMigrationFinalizationSafety {
  /** Evaluates finalization preconditions without mutating Git history. */
  evaluate(request: GraphModelMigrationFinalizationRequest): GraphModelMigrationFinalizationSafetyResult {
    const checkedRequest = requireRequest(request);
    return new GraphModelMigrationFinalizationSafetyResult({
      request: checkedRequest,
      fatalErrors: collectFatalErrors(checkedRequest),
    });
  }
}

function collectFatalErrors(
  request: GraphModelMigrationFinalizationRequest,
): readonly GraphModelMigrationNotice[] {
  return Object.freeze([
    validateLiveRef(request.liveRefName),
    validateConfirmation(request),
    validateGateResult(request),
    validateArchiveRef(request.archiveRefName),
    validateScratchOutput(request),
    validateLiveHeadExpectation(request),
  ].filter((notice) => notice !== null));
}

function validateLiveRef(liveRefName: string): GraphModelMigrationNotice | null {
  if (liveRefName.startsWith(LIVE_REF_PREFIX)) {
    return null;
  }
  return GraphModelMigrationNotice.fatal(
    'E_INVALID_LIVE_REF',
    `finalization live ref must start with ${LIVE_REF_PREFIX}`,
  );
}

function validateConfirmation(
  request: GraphModelMigrationFinalizationRequest,
): GraphModelMigrationNotice | null {
  if (request.confirmation !== null) {
    return null;
  }
  return GraphModelMigrationNotice.fatal(
    'E_MISSING_FINALIZATION_CONFIRMATION',
    'migration finalization requires explicit operator confirmation',
  );
}

function validateGateResult(
  request: GraphModelMigrationFinalizationRequest,
): GraphModelMigrationNotice | null {
  if (request.gateResult !== null && request.gateResult.allowsPromotion()) {
    return null;
  }
  return GraphModelMigrationNotice.fatal(
    'E_EQUIVALENCE_GATE_NOT_PASSED',
    'migration finalization requires a passed scratch equivalence gate',
  );
}

function validateArchiveRef(archiveRefName: string | null): GraphModelMigrationNotice | null {
  return GraphModelMigrationArchiveRef.validateRefName(archiveRefName);
}

function validateScratchOutput(
  request: GraphModelMigrationFinalizationRequest,
): GraphModelMigrationNotice | null {
  if (request.scratchRef !== null && request.scratchHead !== null) {
    return null;
  }
  return GraphModelMigrationNotice.fatal(
    'E_MISSING_SCRATCH_OUTPUT',
    'migration finalization requires scratch ref and scratch head evidence',
  );
}

function validateLiveHeadExpectation(
  request: GraphModelMigrationFinalizationRequest,
): GraphModelMigrationNotice | null {
  if (request.expectedLiveHead === null) {
    return GraphModelMigrationNotice.fatal(
      'E_MISSING_EXPECTED_LIVE_HEAD',
      'migration finalization requires an expected live ref head',
    );
  }
  if (request.observedLiveHead === null) {
    return GraphModelMigrationNotice.fatal(
      'E_MISSING_OBSERVED_LIVE_HEAD',
      'migration finalization requires observed live ref head evidence',
    );
  }
  if (request.expectedLiveHead === request.observedLiveHead) {
    return null;
  }
  return GraphModelMigrationNotice.fatal(
    'E_STALE_LIVE_REF_EXPECTATION',
    'migration finalization live ref expectation is stale',
  );
}

function requireRequest(
  request: GraphModelMigrationFinalizationRequest,
): GraphModelMigrationFinalizationRequest {
  if (!(request instanceof GraphModelMigrationFinalizationRequest)) {
    throw new WarpError('request must be a GraphModelMigrationFinalizationRequest', 'E_VALIDATION');
  }
  return request;
}
