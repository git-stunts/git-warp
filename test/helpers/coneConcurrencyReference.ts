import { expect } from 'vitest';
import type PatchEntry from '../../src/domain/artifacts/PatchEntry.ts';
import ConeReader from '../../src/domain/services/cone/ConeReader.ts';
import type ConeRoot from '../../src/domain/services/cone/ConeRoot.ts';
import type ConeConcurrency from '../../src/domain/services/cone/ConeConcurrency.ts';
import { decodeLegacyEdgePropNode, encodeEdgeKey, isLegacyEdgePropNode } from '../../src/domain/services/KeyCodec.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import type ConeRecordStorePort from '../../src/ports/ConeRecordStorePort.ts';

type Element = { readonly family: 'node' | 'edge'; readonly id: string };
type ElementOp = { readonly element: Element; readonly key: string | null; readonly role: 'edit' | 'remove' };
type Event = { readonly sha: string; readonly opIndex: number; readonly role: 'edit' | 'remove' };

/**
 * Reference sibling sets from a history's causal order (#1039): a patch
 * happened before another when it precedes it on its writer chain or when
 * the other observed it, transitively through any patch. For each register
 * and each element lifecycle, the reference keeps each patch's last event and
 * then the events no other kept event's patch causally follows.
 */
export async function assertConeConcurrencyEquivalent(
  history: { readonly seed: number; readonly chains: ReadonlyMap<string, readonly PatchEntry[]> },
  cone: { readonly store: ConeRecordStorePort; readonly root: ConeRoot },
): Promise<{ readonly sets: number; readonly plural: number }> {
  const order = causalOrder(history.chains);
  const registers = new Map<string, Event[]>();
  const lifecycles = new Map<string, Event[]>();
  for (const entry of [...history.chains.values()].flat()) {
    for (const [slot, event] of lastEvents(entry)) {
      const into = slot.startsWith('register|') ? registers : lifecycles;
      into.set(slot, [...(into.get(slot) ?? []), event]);
    }
  }
  const reader = new ConeReader(cone.store);
  let compared = 0;
  let plural = 0;
  for (const [slots, kind] of [[registers, 'register'], [lifecycles, 'lifecycle']] as const) {
    for (const [slot, events] of slots) {
      const expected = maximal(events, order).map(label).sort();
      const concurrency = await concurrencyOf(reader, cone.root, slot);
      const members = kind === 'register'
        ? concurrency.register(slot.split('|')[3] ?? '').members
        : concurrency.lifecycle.members;
      const actual = members.map((member) => label({
        sha: member.event.patchSha, opIndex: member.event.opIndex, role: 'role' in member ? member.role : 'edit',
      })).sort();
      expect(actual, `${slot} siblings, seed ${history.seed}`).toEqual(expected);
      compared += 1;
      plural += expected.length > 1 ? 1 : 0;
    }
  }
  return { sets: compared, plural };
}

async function concurrencyOf(reader: ConeReader, root: ConeRoot, slot: string): Promise<ConeConcurrency> {
  const [, family = '', id = ''] = slot.split('|');
  return family === 'node' ? (await reader.node(root, id)).concurrency : (await reader.edge(root, id)).concurrency;
}

function label(event: Event): string {
  return `${event.sha}:${event.opIndex}:${event.role}`;
}

/** Per patch sha, every patch sha it causally follows. */
function causalOrder(chains: ReadonlyMap<string, readonly PatchEntry[]>): Map<string, Set<string>> {
  const direct = new Map<string, string[]>();
  for (const chain of chains.values()) {
    chain.forEach((entry, index) => {
      const previous = chain[index - 1];
      const observed = entry.patch.observedFrontier?.heads.map((head) => head.patchSha) ?? [];
      direct.set(entry.sha, [...(previous === undefined ? [] : [previous.sha]), ...observed]);
    });
  }
  const closed = new Map<string, Set<string>>();
  const visit = (sha: string): Set<string> => {
    const known = closed.get(sha);
    if (known !== undefined) {
      return known;
    }
    const ancestors = new Set<string>();
    for (const parent of direct.get(sha) ?? []) {
      if (parent !== sha) {
        ancestors.add(parent);
        for (const ancestor of visit(parent)) {
          ancestors.add(ancestor);
        }
      }
    }
    closed.set(sha, ancestors);
    return ancestors;
  };
  for (const sha of direct.keys()) {
    visit(sha);
  }
  return closed;
}

function maximal(events: readonly Event[], order: ReadonlyMap<string, ReadonlySet<string>>): Event[] {
  return events.filter((event) => !events.some((other) => other.sha !== event.sha && order.get(other.sha)?.has(event.sha) === true));
}

/** Per register and per element lifecycle slot, the patch's last event. */
function lastEvents(entry: PatchEntry): Map<string, Event> {
  const slots = new Map<string, Event>();
  entry.patch.ops.forEach((op, opIndex) => {
    const effect = effectOf(op);
    if (effect === null) {
      return;
    }
    const element = `${effect.element.family}|${effect.element.id}`;
    if (effect.key !== null) {
      slots.set(`register|${element}|${effect.key}`, { sha: entry.sha, opIndex, role: 'edit' });
    }
    slots.set(`lifecycle|${element}`, { sha: entry.sha, opIndex, role: effect.role });
  });
  return slots;
}

function effectOf(op: PatchOp): ElementOp | null {
  switch (op.type) {
    case 'NodeAdd': return { element: { family: 'node', id: op.node }, key: null, role: 'edit' };
    case 'NodeRemove': return op.observedDots.length === 0 ? null : { element: { family: 'node', id: op.node }, key: null, role: 'remove' };
    case 'NodePropSet': return { element: { family: 'node', id: op.node }, key: op.key, role: 'edit' };
    case 'PropSet': return legacyProperty(op.node, op.key);
    case 'EdgeAdd': return { element: { family: 'edge', id: encodeEdgeKey(op.from, op.to, op.label) }, key: null, role: 'edit' };
    case 'EdgeRemove': return op.observedDots.length === 0 ? null
      : { element: { family: 'edge', id: encodeEdgeKey(op.from, op.to, op.label) }, key: null, role: 'remove' };
    case 'EdgePropSet': return { element: { family: 'edge', id: encodeEdgeKey(op.from, op.to, op.label) }, key: op.key, role: 'edit' };
    default: return null;
  }
}

function legacyProperty(node: string, key: string): ElementOp {
  if (!isLegacyEdgePropNode(node)) {
    return { element: { family: 'node', id: node }, key, role: 'edit' };
  }
  const { from, to, label: edgeLabel } = decodeLegacyEdgePropNode(node);
  return { element: { family: 'edge', id: encodeEdgeKey(from, to, edgeLabel) }, key, role: 'edit' };
}
