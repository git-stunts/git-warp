import AttachmentUpdate from './AttachmentUpdate.ts';
import SkeletonRewrite from './SkeletonRewrite.ts';
import StructuralAttachmentState from './StructuralAttachmentState.ts';

type Candidate = AttachmentUpdate | SkeletonRewrite;
type Rejection = { readonly id: string; readonly reason: 'conflict'; readonly blocker: string };
type TickReceipt = {
  readonly basis: StructuralAttachmentState;
  readonly selected: readonly string[];
  readonly published: readonly string[];
  readonly rejected: readonly Rejection[];
  readonly paths: readonly (readonly string[])[];
  readonly abort: string | null;
};

/** Executable reference policy; this does not schedule shipped Runtime writes. */
export default class AttachmentContractTick {
  readonly #basis: StructuralAttachmentState;
  readonly #candidates: readonly Candidate[];

  constructor(basis: StructuralAttachmentState, candidates: readonly Candidate[]) {
    if (!(basis instanceof StructuralAttachmentState)) throw new Error('Invalid tick basis');
    if (candidates.some((item) => !(item instanceof AttachmentUpdate) && !(item instanceof SkeletonRewrite))) throw new Error('Invalid candidate');
    if (new Set(candidates.map((item) => item.id)).size !== candidates.length) throw new Error('Duplicate candidate identity');
    this.#basis = basis;
    this.#candidates = Object.freeze([...candidates].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    Object.freeze(this);
  }

  commit(current: StructuralAttachmentState): { readonly state: StructuralAttachmentState; readonly receipt: TickReceipt } {
    if (current !== this.#basis) return { state: current, receipt: receipt(this.#basis, [], [], [], 'stale-basis', []) };
    const selected: Candidate[] = [];
    const rejected: Rejection[] = [];
    for (const candidate of this.#candidates) {
      const blocker = selected.find((prior) => !independent(candidate, prior, current));
      if (blocker === undefined) selected.push(candidate);
      else rejected.push(Object.freeze({ id: candidate.id, reason: 'conflict', blocker: blocker.id }));
    }
    const ids = selected.map((item) => item.id);
    const paths = selected.flatMap((item) => item instanceof AttachmentUpdate ? [item.uses(current)] : item.tracking.map((entry) => current.path(entry.source)));
    let staged = current;
    for (const candidate of selected) {
      const result = candidate.apply(staged);
      if (result.kind === 'refused') return { state: current, receipt: receipt(this.#basis, ids, [], rejected, result.reason, paths) };
      staged = result.state;
    }
    return { state: staged, receipt: receipt(this.#basis, ids, ids, rejected, null, paths) };
  }
}

function independent(left: Candidate, right: Candidate, state: StructuralAttachmentState): boolean {
  const uses = (item: Candidate): readonly string[] => item instanceof AttachmentUpdate ? item.uses(state) : item.uses();
  return !overlap(left.deletes(), uses(right)) && !overlap(right.deletes(), uses(left)) && !overlap(left.writes(), right.writes());
}
function overlap(left: readonly string[], right: readonly string[]): boolean { return left.some((key) => right.includes(key)); }
function receipt(basis: StructuralAttachmentState, selected: readonly string[], published: readonly string[], rejected: readonly Rejection[], abort: string | null, paths: readonly (readonly string[])[]): TickReceipt {
  return Object.freeze({ basis, selected: Object.freeze([...selected]), published: Object.freeze([...published]),
    rejected: Object.freeze([...rejected]), paths: Object.freeze(paths.map((path) => Object.freeze([...path]))), abort });
}
