import type WriteRace from '../../api/WriteRace.ts';
import { canonicalStringify, type CanonicalJsonValue } from '../../utils/canonicalStringify.ts';
import { textEncode } from '../../utils/bytes.ts';
import ObservationReceiptCore from '../custody/ObservationReceiptCore.ts';
import type WriteAttemptRecord from './WriteAttemptRecord.ts';

const WRITE_CORE_VERSION = 1;

type CoreFields = { readonly [field: string]: CanonicalJsonValue };

/**
 * The canonical core of a write that published `commit`, reproducible from its record on any retry.
 * It binds the races the write was admitted with, in their canonical order; a `derived` write binds none.
 */
export function publishedWriteCore(graph: string, record: WriteAttemptRecord, commit: string): ObservationReceiptCore {
  return coreOf('published', {
    ...premiseFields(graph, record), commit, admission: record.admission, races: record.races.map(raceFields),
    occurrences: record.occurrences.map(({ intentIndex, subject }) => ({ intentIndex, subject })),
  });
}

/** The canonical core of an armed write whose one publication definitely did not happen. */
export function failedWriteCore(graph: string, record: WriteAttemptRecord, cause: string): ObservationReceiptCore {
  return coreOf('unpublished', { ...premiseFields(graph, record), cause });
}

function premiseFields(graph: string, record: WriteAttemptRecord): CoreFields {
  const { intents, writerId, predecessor } = record.premise;
  return { version: WRITE_CORE_VERSION, graph, writer: writerId, predecessor, intents: intents.hex };
}

function raceFields({ kind, subject, key, writers, overflow, causality }: WriteRace): CoreFields {
  return { kind, subject, key, writers, overflow, causality };
}

function coreOf(variant: string, outcome: CoreFields): ObservationReceiptCore {
  return new ObservationReceiptCore({ family: 'write', variant, outcome: textEncode(canonicalStringify(outcome)) });
}
