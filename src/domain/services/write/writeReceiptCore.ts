import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import { textEncode } from '../../utils/bytes.ts';
import ObservationReceiptCore from '../custody/ObservationReceiptCore.ts';
import type WriteAttemptRecord from './WriteAttemptRecord.ts';

const WRITE_CORE_VERSION = 1;

/** The canonical core of a write that published `commit`, reproducible from its record on any retry. */
export function publishedWriteCore(graph: string, record: WriteAttemptRecord, commit: string): ObservationReceiptCore {
  return coreOf('published', { ...premiseFields(graph, record), commit, admission: record.admission,
    occurrences: record.occurrences.map(({ intentIndex, subject }) => ({ intentIndex, subject })) });
}

/** The canonical core of an armed write whose one publication definitely did not happen. */
export function failedWriteCore(graph: string, record: WriteAttemptRecord, cause: string): ObservationReceiptCore {
  return coreOf('unpublished', { ...premiseFields(graph, record), cause });
}

function premiseFields(graph: string, record: WriteAttemptRecord): Record<string, string | number | null> {
  const { intents, writerId, predecessor } = record.premise;
  return { version: WRITE_CORE_VERSION, graph, writer: writerId, predecessor, intents: intents.hex };
}

function coreOf(variant: string, outcome: Readonly<Record<string, string | number | null | ReadonlyArray<Readonly<Record<string, string | number>>>>>): ObservationReceiptCore {
  return new ObservationReceiptCore({ family: 'write', variant, outcome: textEncode(canonicalStringify(outcome)) });
}
