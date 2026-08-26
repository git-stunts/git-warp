import { Dot } from '../../domain/crdt/Dot.ts';
import PatchError from '../../domain/errors/PatchError.ts';
import { hydrateDecodedPatch } from '../../domain/services/PatchHydrator.ts';
import type Patch from '../../domain/types/Patch.ts';
import EntityAdmissionBoundary from '../../domain/types/EntityAdmissionBoundary.ts';
import EntityAdmissionOrigin, {
  type EntityAdmissionOriginKind,
} from '../../domain/types/EntityAdmissionOrigin.ts';

type DecodedRecord = { readonly [key: string]: unknown };

/** Validates raw entity-admission metadata before entering domain hydration. */
export function hydratePatchAtDecodeBoundary(decoded: unknown): Patch {
  return hydrateDecodedPatch(decoded, readEntityAdmissionsFromPatch(decoded));
}

function readEntityAdmissionsFromPatch(
  decoded: unknown
): readonly EntityAdmissionBoundary[] | undefined {
  if (!isRecord(decoded)) {
    return undefined;
  }
  return readEntityAdmissions(decoded['entityAdmissions']);
}

function readEntityAdmissions(value: unknown): readonly EntityAdmissionBoundary[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return expectArray(value, 'entityAdmissions').map((entry, index) =>
    readEntityAdmission(entry, index)
  );
}

function readEntityAdmission(value: unknown, index: number): EntityAdmissionBoundary {
  const label = `entityAdmissions[${String(index)}]`;
  const record = expectRecord(value, label);
  return new EntityAdmissionBoundary({
    operationIndex: readRequiredInteger(record['operationIndex'], `${label}.operationIndex`),
    operationCount: readRequiredInteger(record['operationCount'], `${label}.operationCount`),
    origin: readEntityAdmissionOrigin(record['origin'], `${label}.origin`),
  });
}

function readEntityAdmissionOrigin(value: unknown, label: string): EntityAdmissionOrigin {
  const record = expectRecord(value, label);
  const kind = readEntityAdmissionOriginKind(record['kind'], label);
  if (kind === 'allocated') {
    return EntityAdmissionOrigin.allocated(
      readRequiredString(record['namespace'], `${label}.namespace`),
      readDot(record['allocationDot'], `${label}.allocationDot`)
    );
  }
  requireAbsentOriginAllocation(record, label);
  return kind === 'supplied-subject'
    ? EntityAdmissionOrigin.suppliedSubject()
    : EntityAdmissionOrigin.legacyUnrecorded();
}

function readEntityAdmissionOriginKind(value: unknown, label: string): EntityAdmissionOriginKind {
  if (value !== 'allocated' && value !== 'supplied-subject' && value !== 'legacy-unrecorded') {
    failPatch(`${label}.kind is unsupported`, { label, actual: typeof value });
  }
  return value;
}

function requireAbsentOriginAllocation(record: DecodedRecord, label: string): void {
  if (record['namespace'] !== null && record['namespace'] !== undefined) {
    failPatch(`${label}.namespace belongs only to allocated admissions`, { label });
  }
  if (record['allocationDot'] !== null && record['allocationDot'] !== undefined) {
    failPatch(`${label}.allocationDot belongs only to allocated admissions`, { label });
  }
}

function readDot(value: unknown, label: string): Dot {
  if (Array.isArray(value)) {
    return readTupleDot(value, label);
  }
  const record = expectRecord(value, label);
  return new Dot(readDotWriterId(record, label), readDotCounter(record, label));
}

function readTupleDot(value: readonly unknown[], label: string): Dot {
  const [writerId, counter] = value;
  if (
    value.length !== 2 ||
    typeof writerId !== 'string' ||
    typeof counter !== 'number' ||
    !Number.isInteger(counter)
  ) {
    failPatch(`${label} dot tuple must be [writerId, counter]`, {
      actual: typeof value,
      label,
    });
  }
  return new Dot(writerId, counter);
}

function readDotWriterId(record: DecodedRecord, label: string): string {
  const { writerId } = record;
  if (typeof writerId === 'string') {
    return writerId;
  }
  const { writer } = record;
  if (typeof writer === 'string') {
    return writer;
  }
  return failPatch(`${label} dot requires writerId/writer`, {
    actual: typeof writerId,
    label,
  });
}

function readDotCounter(record: DecodedRecord, label: string): number {
  const { counter } = record;
  if (typeof counter === 'number' && Number.isInteger(counter)) {
    return counter;
  }
  const { seq } = record;
  if (typeof seq === 'number' && Number.isInteger(seq)) {
    return seq;
  }
  return failPatch(`${label} dot requires integer counter/seq`, {
    actual: typeof counter,
    label,
  });
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    failPatch(`Decoded patch requires string '${field}'`, {
      actual: typeof value,
      field,
    });
  }
  return value;
}

function readRequiredInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    failPatch(`Decoded patch requires integer '${field}'`, {
      actual: typeof value,
      field,
    });
  }
  return value;
}

function expectArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    failPatch(`Decoded patch field '${field}' must be an array`, {
      actual: typeof value,
      field,
    });
  }
  return value;
}

function expectRecord(value: unknown, label: string): DecodedRecord {
  if (!isRecord(value)) {
    failPatch(`Decoded patch ${label} must be an object`, {
      actual: typeof value,
      label,
    });
  }
  return value;
}

function isRecord(value: unknown): value is DecodedRecord {
  return (
    value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
  );
}

function failPatch(message: string, context: DecodedRecord): never {
  throw new PatchError(message, { context });
}
