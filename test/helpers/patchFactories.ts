/**
 * Shared patch and op factories for test fixtures.
 *
 * Eliminates 106+ inline patch creation patterns scattered across
 * test files. Each factory returns a minimal valid object with
 * sensible defaults.
 */

// ---------------------------------------------------------------------------
// Op factories — create minimal valid operation objects
// ---------------------------------------------------------------------------

export interface TestDot {
  writerId: string;
  lamport: number;
}

export function dot(writerId = 'w1', lamport = 1): TestDot {
  return { writerId, lamport };
}

export function nodeAdd(nodeId: string, d?: TestDot) {
  return { type: 'NodeAdd' as const, node: nodeId, dot: d ?? dot() };
}

export function nodeRemove(nodeId: string, d?: TestDot) {
  return { type: 'NodeRemove' as const, node: nodeId, dot: d ?? dot() };
}

export function edgeAdd(from: string, to: string, label: string, d?: TestDot) {
  return { type: 'EdgeAdd' as const, from, to, label, dot: d ?? dot() };
}

export function edgeRemove(from: string, to: string, label: string, d?: TestDot) {
  return { type: 'EdgeRemove' as const, from, to, label, dot: d ?? dot() };
}

export function propSet(node: string, key: string, value: unknown) {
  return { type: 'PropSet' as const, node, key, value: inlineValue(value) };
}

export function nodePropSet(node: string, key: string, value: unknown) {
  return { type: 'NodePropSet' as const, node, key, value: inlineValue(value) };
}

export function edgePropSet(from: string, to: string, label: string, key: string, value: unknown) {
  return { type: 'EdgePropSet' as const, from, to, label, key, value: inlineValue(value) };
}

// ---------------------------------------------------------------------------
// Value factories
// ---------------------------------------------------------------------------

export function inlineValue(value: unknown) {
  return { type: 'inline' as const, value };
}

export function blobValue(oid: string) {
  return { type: 'blob' as const, oid };
}

// ---------------------------------------------------------------------------
// Patch factory — create a minimal valid patch object
// ---------------------------------------------------------------------------

export interface TestPatchOptions {
  writer?: string;
  lamport?: number;
  ops?: unknown[];
  context?: string | null;
  schema?: number;
  parents?: string[];
}

export function patch(options: TestPatchOptions = {}) {
  const {
    writer = 'w1',
    lamport = 1,
    ops = [],
    context = null,
    schema = 2,
    parents = [],
  } = options;
  return { schema, writer, lamport, ops, context, parents };
}

// ---------------------------------------------------------------------------
// Patch chain factory — create a sequence of patches for a writer
// ---------------------------------------------------------------------------

export function patchChain(writerId: string, count: number, startLamport = 1): Array<ReturnType<typeof patch>> {
  return Array.from({ length: count }, (_, i) =>
    patch({ writer: writerId, lamport: startLamport + i }),
  );
}

// ---------------------------------------------------------------------------
// Quick graph setup — add nodes + edges in one call
// ---------------------------------------------------------------------------

export function graphOps(spec: {
  nodes?: string[];
  edges?: Array<{ from: string; to: string; label: string }>;
  props?: Array<{ node: string; key: string; value: unknown }>;
}, d?: TestDot): unknown[] {
  const ops: unknown[] = [];
  const opDot = d ?? dot();
  for (const n of spec.nodes ?? []) {
    ops.push(nodeAdd(n, opDot));
  }
  for (const e of spec.edges ?? []) {
    ops.push(edgeAdd(e.from, e.to, e.label, opDot));
  }
  for (const p of spec.props ?? []) {
    ops.push(propSet(p.node, p.key, p.value));
  }
  return ops;
}
