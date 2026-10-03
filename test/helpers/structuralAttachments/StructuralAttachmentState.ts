import OwnershipPosition, { requireIdentity } from './OwnershipPosition.ts';
import OwnedAttachment from './OwnedAttachment.ts';
import AttachmentAtom from './AttachmentAtom.ts';

export type PositionTracking = {
  readonly source: OwnershipPosition;
  readonly targets: readonly OwnershipPosition[];
};
type StateInput = {
  readonly graphs: readonly string[];
  readonly roots: readonly string[];
  readonly positions: readonly OwnershipPosition[];
  readonly owned: readonly OwnedAttachment[];
  readonly atoms?: readonly AttachmentAtom[];
};
export type StateTransition =
  | { readonly kind: 'admitted'; readonly state: StructuralAttachmentState }
  | { readonly kind: 'refused'; readonly reason: string };

/** Finite test-only ownership projection, not the shipped graph engine or DPOI. */
export default class StructuralAttachmentState {
  readonly graphs: readonly string[];
  readonly roots: readonly string[];
  readonly positions: readonly OwnershipPosition[];
  readonly owned: readonly OwnedAttachment[];
  readonly atoms: readonly AttachmentAtom[];

  constructor(input: StateInput) {
    this.graphs = Object.freeze([...input.graphs]);
    this.roots = Object.freeze([...input.roots]);
    this.positions = Object.freeze([...input.positions]);
    this.owned = Object.freeze([...input.owned]);
    this.atoms = Object.freeze([...(input.atoms ?? [])]);
    validateState(this);
    Object.freeze(this);
  }

  has(position: OwnershipPosition): boolean {
    return this.positions.some((item) => item.key === position.key);
  }

  descends(position: OwnershipPosition): boolean {
    // Every graph occurrence, including an empty graph, has depth >= 1.
    return this.owned.some((link) => link.owner.key === position.key);
  }

  value(position: OwnershipPosition): string | null {
    return this.atoms.find((atom) => atom.owner.key === position.key)?.value ?? null;
  }

  path(position: OwnershipPosition): readonly string[] {
    const ancestors: string[] = [];
    let graph = position.graph;
    let parent = this.owned.find((link) => link.child === graph);
    while (parent !== undefined) {
      ancestors.push(parent.owner.key);
      graph = parent.owner.graph;
      parent = this.owned.find((link) => link.child === graph);
    }
    return Object.freeze([...ancestors.reverse(), position.key]);
  }

  edit(position: OwnershipPosition, value: string): StateTransition {
    if (!this.has(position)) return refused('missing-owner');
    if (this.descends(position)) return refused('descendant-replace');
    return { kind: 'admitted', state: new StructuralAttachmentState({
      ...this,
      atoms: [...this.atoms.filter((atom) => atom.owner.key !== position.key),
        new AttachmentAtom(position, value)],
    }) };
  }

  detach(position: OwnershipPosition): StateTransition {
    if (!this.has(position)) return refused('missing-owner');
    if (this.descends(position)) return refused('descendant-detach');
    return { kind: 'admitted', state: new StructuralAttachmentState({
      ...this, atoms: this.atoms.filter((atom) => atom.owner.key !== position.key),
    }) };
  }

  transport(tracking: readonly PositionTracking[]): StateTransition {
    const reason = transportRefusal(this, tracking);
    if (reason !== null) return refused(reason);
    const targets = (position: OwnershipPosition): readonly OwnershipPosition[] =>
      tracking.find((item) => item.source.key === position.key)?.targets ?? [position];
    return { kind: 'admitted', state: new StructuralAttachmentState({
      ...this,
      positions: this.positions.flatMap(targets),
      owned: this.owned.flatMap((link) => targets(link.owner).map((owner) => new OwnedAttachment(owner, link.child))),
      atoms: this.atoms.flatMap((atom) => targets(atom.owner).map((owner) => new AttachmentAtom(owner, atom.value))),
    }) };
  }
}

function refused(reason: string): StateTransition { return { kind: 'refused', reason }; }

function validateState(state: StructuralAttachmentState): void {
  state.graphs.forEach(requireIdentity);
  requireUnique(state.graphs);
  requireUnique(state.positions.map((position) => position.key));
  requireUnique(state.owned.map((link) => link.owner.key));
  requireUnique(state.owned.map((link) => link.child));
  requireUnique(state.atoms.map((atom) => atom.owner.key));
  state.positions.forEach((position) => {
    if (!(position instanceof OwnershipPosition) || !state.graphs.includes(position.graph)) throw new Error('Missing occurrence');
  });
  state.owned.forEach((link) => {
    if (!(link instanceof OwnedAttachment) || !state.has(link.owner) || !state.graphs.includes(link.child)) throw new Error('Incomplete ownership');
  });
  state.atoms.forEach((atom) => {
    if (!(atom instanceof AttachmentAtom) || !state.has(atom.owner) || state.descends(atom.owner)) throw new Error('Invalid atom owner');
  });
  state.graphs.forEach((graph) => validateAcyclic(state, graph, new Set()));
  requireUnique(state.roots);
  const roots = state.graphs.filter((graph) => !state.owned.some((link) => link.child === graph));
  if (roots.length !== state.roots.length || roots.some((graph) => !state.roots.includes(graph))) throw new Error('Missing explicit root');
}

function requireUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw new Error('Duplicate ownership identity');
}

function validateAcyclic(state: StructuralAttachmentState, graph: string, ancestors: ReadonlySet<string>): void {
  if (ancestors.has(graph)) throw new Error('Structural containment cycle');
  const path = new Set([...ancestors, graph]);
  for (const link of state.owned.filter((item) => item.owner.graph === graph)) {
    validateAcyclic(state, link.child, path);
  }
}

function transportRefusal(state: StructuralAttachmentState, tracking: readonly PositionTracking[]): string | null {
  const sources = tracking.map((item) => item.source.key);
  if (new Set(sources).size !== sources.length) return 'duplicate-tracking';
  for (const { source, targets } of tracking) {
    if (!state.has(source)) return 'missing-owner';
    if (state.descends(source) && targets.length !== 1) return 'descendant-delete-or-clone';
    if (targets.some((target) => target.graph !== source.graph || target.kind !== source.kind)) return 'invalid-preserved-image';
  }
  const keys = state.positions.flatMap((position) =>
    (tracking.find((item) => item.source.key === position.key)?.targets ?? [position]).map((target) => target.key));
  return new Set(keys).size === keys.length ? null : 'noninjective-transport';
}
