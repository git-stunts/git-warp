import GenesisEquivalenceComparisonBasis
  from '../../domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceGateResult
  from '../../domain/migrations/GenesisEquivalenceGateResult.ts';
import GenesisEquivalenceProofSuccess
  from '../../domain/migrations/GenesisEquivalenceProofSuccess.ts';
import GenesisEquivalenceProofSummary
  from '../../domain/migrations/GenesisEquivalenceProofSummary.ts';
import GraphModelMigrationBasis from '../../domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationFinalizationConfirmation
  from '../../domain/migrations/GraphModelMigrationFinalizationConfirmation.ts';
import GraphModelMigrationFinalizationRequest
  from '../../domain/migrations/GraphModelMigrationFinalizationRequest.ts';
import GraphModelMigrationNotice, {
  type GraphModelMigrationNoticeKind,
} from '../../domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationRuntimeConformanceResult, {
  type GraphModelMigrationRuntimeConformanceStatus,
} from '../../domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import GraphModelMigrationScratchRef
  from '../../domain/migrations/GraphModelMigrationScratchRef.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type { JsonObject } from './JsonObject.ts';

const REQUEST_KEYS = Object.freeze([
  'liveRefName',
  'expectedLiveHead',
  'observedLiveHead',
  'scratchRefName',
  'scratchHead',
  'archiveRefName',
  'confirmationToken',
  'equivalence',
  'runtimeReplay',
]);
const CONFIRMATION_KEYS = Object.freeze(['confirmationToken']);
const EQUIVALENCE_KEYS = Object.freeze([
  'legacyBasis',
  'migratedBasis',
  'legacyFactCount',
  'migratedFactCount',
  'mismatchCount',
]);
const BASIS_KEYS = Object.freeze(['graphId', 'basisId']);
const RUNTIME_REPLAY_KEYS = Object.freeze([
  'scratchRefName',
  'scratchHead',
  'status',
  'witness',
  'fatalErrors',
]);
const NOTICE_KEYS = Object.freeze(['kind', 'code', 'message']);

/** Parses finalization confirmation JSON into a runtime-backed confirmation noun. */
export function parseGraphModelMigrationFinalizationConfirmation(
  raw: string,
): GraphModelMigrationFinalizationConfirmation {
  return parseDomainValue('finalization confirmation', () => {
    const envelope = requireJsonObject(parseJson(raw), 'finalizationConfirmation');
    rejectUnknownKeys(envelope, CONFIRMATION_KEYS, 'finalizationConfirmation');
    return new GraphModelMigrationFinalizationConfirmation({
      token: readRequiredString(envelope, 'finalizationConfirmation.confirmationToken', 'confirmationToken'),
    });
  });
}

/** Parses finalization request JSON into a runtime-backed safety request. */
export function parseGraphModelMigrationFinalizationRequest(
  raw: string,
): GraphModelMigrationFinalizationRequest {
  return parseDomainValue('finalization request', () => requestFromJson(parseJson(raw)));
}

function parseDomainValue<T>(label: string, parser: () => T): T {
  try {
    return parser();
  } catch (error) {
    if (error instanceof AdapterValidationError) {
      throw error;
    }
    if (error instanceof WarpError) {
      throw new AdapterValidationError(
        `Graph model migration ${label} is invalid: ${error.message}`,
        { context: { causeCode: error.code, causeMessage: error.message } },
      );
    }
    throw error;
  }
}

function requestFromJson(value: unknown): GraphModelMigrationFinalizationRequest {
  const request = requireJsonObject(value, 'finalizationRequest');
  rejectUnknownKeys(request, REQUEST_KEYS, 'finalizationRequest');
  return new GraphModelMigrationFinalizationRequest({
    liveRefName: readRequiredString(request, 'finalizationRequest.liveRefName', 'liveRefName'),
    expectedLiveHead: readRequiredString(
      request,
      'finalizationRequest.expectedLiveHead',
      'expectedLiveHead',
    ),
    observedLiveHead: readRequiredString(
      request,
      'finalizationRequest.observedLiveHead',
      'observedLiveHead',
    ),
    scratchRef: new GraphModelMigrationScratchRef({
      refName: readRequiredString(request, 'finalizationRequest.scratchRefName', 'scratchRefName'),
    }),
    scratchHead: readRequiredString(request, 'finalizationRequest.scratchHead', 'scratchHead'),
    archiveRefName: readRequiredString(request, 'finalizationRequest.archiveRefName', 'archiveRefName'),
    confirmation: new GraphModelMigrationFinalizationConfirmation({
      token: readRequiredString(request, 'finalizationRequest.confirmationToken', 'confirmationToken'),
    }),
    gateResult: readPassedGateResult(request),
    runtimeConformance: readRuntimeReplay(request),
  });
}

function readPassedGateResult(source: JsonObject): GenesisEquivalenceGateResult {
  const equivalence = readRequiredObject(source, 'equivalence');
  rejectUnknownKeys(equivalence, EQUIVALENCE_KEYS, 'equivalence');
  const basis = new GenesisEquivalenceComparisonBasis({
    legacyBasis: readBasis(equivalence, 'legacyBasis'),
    migratedBasis: readBasis(equivalence, 'migratedBasis'),
  });
  const summary = new GenesisEquivalenceProofSummary({
    basis,
    legacyFactCount: readRequiredSafeInteger(equivalence, 'equivalence.legacyFactCount', 'legacyFactCount'),
    migratedFactCount: readRequiredSafeInteger(equivalence, 'equivalence.migratedFactCount', 'migratedFactCount'),
    mismatchCount: readRequiredSafeInteger(equivalence, 'equivalence.mismatchCount', 'mismatchCount'),
  });
  return new GenesisEquivalenceGateResult({
    proofResult: new GenesisEquivalenceProofSuccess({ basis, summary }),
    divergenceReport: null,
    fatalErrors: [],
  });
}

function readBasis(source: JsonObject, key: string): GraphModelMigrationBasis {
  const basis = readRequiredObject(source, key);
  rejectUnknownKeys(basis, BASIS_KEYS, key);
  return new GraphModelMigrationBasis({
    graphId: readRequiredString(basis, `${key}.graphId`, 'graphId'),
    basisId: readRequiredString(basis, `${key}.basisId`, 'basisId'),
  });
}

function readRuntimeReplay(source: JsonObject): GraphModelMigrationRuntimeConformanceResult {
  const runtimeReplay = readRequiredObject(source, 'runtimeReplay');
  rejectUnknownKeys(runtimeReplay, RUNTIME_REPLAY_KEYS, 'runtimeReplay');
  return new GraphModelMigrationRuntimeConformanceResult({
    scratchRef: new GraphModelMigrationScratchRef({
      refName: readRequiredString(runtimeReplay, 'runtimeReplay.scratchRefName', 'scratchRefName'),
    }),
    scratchHead: readRequiredString(runtimeReplay, 'runtimeReplay.scratchHead', 'scratchHead'),
    status: readRuntimeReplayStatus(runtimeReplay, 'runtimeReplay.status', 'status'),
    witness: readRequiredString(runtimeReplay, 'runtimeReplay.witness', 'witness'),
    fatalErrors: readFatalNotices(runtimeReplay),
  });
}

function readFatalNotices(source: JsonObject): readonly GraphModelMigrationNotice[] {
  return readObjectArray(source, 'fatalErrors').map((notice, index) => {
    const label = `fatalErrors[${index}]`;
    rejectUnknownKeys(notice, NOTICE_KEYS, label);
    return new GraphModelMigrationNotice({
      kind: readNoticeKind(notice, `${label}.kind`, 'kind'),
      code: readRequiredString(notice, `${label}.code`, 'code'),
      message: readRequiredString(notice, `${label}.message`, 'message'),
    });
  });
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AdapterValidationError('Graph model migration finalization request JSON must be valid JSON');
  }
}

function readRequiredObject(source: JsonObject, key: string): JsonObject {
  return requireJsonObject(readRequiredValue(source, key), key);
}

function readObjectArray(source: JsonObject, key: string): readonly JsonObject[] {
  const value = readRequiredValue(source, key);
  if (!Array.isArray(value)) {
    throw new AdapterValidationError(`Graph model migration finalization request field "${key}" must be an array`);
  }
  const objects: JsonObject[] = [];
  value.forEach((entry, index) => {
    objects.push(requireJsonObject(entry, `${key}[${index}]`));
  });
  return Object.freeze(objects);
}

function readRequiredString(source: JsonObject, label: string, key: string): string {
  const value = readRequiredValue(source, key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(
      `Graph model migration finalization request field "${label}" must be a non-empty string`,
    );
  }
  return value;
}

function readRequiredSafeInteger(source: JsonObject, label: string, key: string): number {
  const value = readRequiredValue(source, key);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new AdapterValidationError(
      `Graph model migration finalization request field "${label}" must be a non-negative safe integer`,
    );
  }
  return value;
}

function readRuntimeReplayStatus(
  source: JsonObject,
  label: string,
  key: string,
): GraphModelMigrationRuntimeConformanceStatus {
  const value = readRequiredValue(source, key);
  if (value === 'passed' || value === 'failed') {
    return value;
  }
  throw new AdapterValidationError(
    `Graph model migration finalization request field "${label}" must be passed or failed`,
  );
}

function readNoticeKind(source: JsonObject, label: string, key: string): GraphModelMigrationNoticeKind {
  const value = readRequiredValue(source, key);
  if (value === 'warning' || value === 'fatal') {
    return value;
  }
  throw new AdapterValidationError(
    `Graph model migration finalization request field "${label}" must be warning or fatal`,
  );
}

function readRequiredValue(source: JsonObject, key: string): unknown {
  const value = source[key];
  if (value === undefined) {
    throw new AdapterValidationError(`Graph model migration finalization request field "${key}" is required`);
  }
  return value;
}

function requireJsonObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new AdapterValidationError(
      `Graph model migration finalization request field "${label}" must be an object`,
    );
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(source: JsonObject, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      throw new AdapterValidationError(
        `Graph model migration finalization request field "${label}.${key}" is not allowed`,
      );
    }
  }
}
