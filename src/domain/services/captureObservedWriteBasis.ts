import type RefPort from '../../ports/RefPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type PatchEntry from '../artifacts/PatchEntry.ts';
import VersionVector from '../crdt/VersionVector.ts';
import InvalidWriteObservationError from '../errors/InvalidWriteObservationError.ts';
import EdgeAdd from '../types/ops/EdgeAdd.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import ObservedWriteFrontier from '../types/ObservedWriteFrontier.ts';
import ObservedWriterHead from '../types/ObservedWriterHead.ts';
import { buildWritersPrefix, parseWriterIdFromRef } from '../utils/RefLayout.ts';
import ObservedWriteBasis from './ObservedWriteBasis.ts';

type WriteObservationRequest = Readonly<{
  refs: RefPort; journal: PatchJournalPort; graphName: string;
  writerId: string; expectedParentSha: string | null;
  ownCandidate: number; context: VersionVector;
  selectedFrontier?: ReadonlyMap<string, string> | undefined;
}>;

/** Reads one immutable patch per captured writer, retaining no graph state or history. */
export default async function captureObservedWriteBasis(fields: WriteObservationRequest): Promise<ObservedWriteBasis> {
  const frontier = fields.selectedFrontier === undefined
    ? await captureFrontier(fields) : pinOwnPredecessor(new Map(fields.selectedFrontier), fields);
  const heads: ObservedWriterHead[] = [];
  let context = fields.context.clone();
  for (const [writer, sha] of frontier) {
    const entry = await readHead(fields.journal, writer, sha);
    heads.push(ObservedWriterHead.fromEntry(writer, sha, entry));
    context = context.merge(observedMembership(entry));
  }
  return new ObservedWriteBasis(new ObservedWriteFrontier(fields.graphName, heads), context, fields.ownCandidate);
}

async function captureFrontier(fields: WriteObservationRequest): Promise<Map<string, string>> {
  const frontier = new Map<string, string>();
  const prefix = buildWritersPrefix(fields.graphName);
  const refs = await fields.refs.listRefs(prefix);
  for (const ref of [...refs].sort()) {
    const writer = writerFromCapturedRef(ref, prefix);
    const sha = await fields.refs.readRef(ref);
    if (sha !== null) { frontier.set(writer, sha); }
  }
  return pinOwnPredecessor(frontier, fields);
}

async function readHead(journal: PatchJournalPort, writer: string, sha: string): Promise<PatchEntry> {
  const history = journal.scanPatchHistory(writer, sha)[Symbol.asyncIterator]();
  try {
    const head = await history.next();
    if (head.done === true) { throw new InvalidWriteObservationError('Captured writer head is unavailable'); }
    return head.value;
  } finally { await history.return?.(); }
}

function observedMembership(entry: PatchEntry): VersionVector {
  const context = VersionVector.from(entry.patch.context);
  for (const op of entry.patch.ops) {
    if (op instanceof NodeAdd || op instanceof EdgeAdd) {
      context.set(op.dot.writerId, Math.max(context.get(op.dot.writerId) ?? 0, op.dot.counter));
    }
  }
  return context;
}

function writerFromCapturedRef(ref: string, prefix: string): string {
  const writer = parseWriterIdFromRef(ref);
  if (!ref.startsWith(prefix) || writer === null) {
    throw new InvalidWriteObservationError('Writer enumeration returned an unrelated ref');
  }
  return writer;
}

function pinOwnPredecessor(frontier: Map<string, string>, fields: WriteObservationRequest): Map<string, string> {
  if (fields.expectedParentSha === null) { frontier.delete(fields.writerId); }
  else { frontier.set(fields.writerId, fields.expectedParentSha); }
  return frontier;
}
