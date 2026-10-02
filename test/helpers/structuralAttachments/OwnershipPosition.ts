/** Test-only occurrence-qualified position; this is not a reference wire format. */
export default class OwnershipPosition {
  readonly graph: string;
  readonly kind: 'node' | 'edge';
  readonly id: string;
  readonly key: string;

  constructor(graph: string, kind: 'node' | 'edge', id: string) {
    requireIdentity(graph);
    requireIdentity(id);
    if (kind !== 'node' && kind !== 'edge') throw new Error('Invalid owner kind');
    this.graph = graph;
    this.kind = kind;
    this.id = id;
    this.key = `${graph}\0${kind}\0${id}`;
    Object.freeze(this);
  }
}

export function requireIdentity(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error('Expected a nonempty identity without NUL');
  }
}
