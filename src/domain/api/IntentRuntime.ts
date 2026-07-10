import type { PatchBuilder } from '../services/PatchBuilder.ts';
import type Intent from './Intent.ts';
import type { IntentDescriptor, IntentKind } from './Intent.ts';
import WarpError from '../errors/WarpError.ts';

type IntentLowerer = (descriptor: IntentDescriptor, patch: PatchBuilder) => void;

const lowerers: ReadonlyMap<IntentKind, IntentLowerer> = new Map([
  ['node.add', lowerNodeAdd],
  ['node.remove', lowerNodeRemove],
  ['edge.add', lowerEdgeAdd],
  ['edge.remove', lowerEdgeRemove],
  ['property.set', lowerPropertySet],
  ['edgeProperty.set', lowerEdgePropertySet],
]);

export function applyIntentToPatch(intent: Intent, patch: PatchBuilder): void {
  const { descriptor } = intent;
  const lowerer = lowerers.get(intent.kind);
  if (lowerer === undefined) {
    throw new WarpError('Intent kind is unsupported', 'E_INTENT_KIND');
  }
  lowerer(descriptor, patch);
}

function lowerNodeAdd(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'node.add');
  patch.addNode(descriptor.subject);
}

function lowerNodeRemove(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'node.remove');
  patch.removeNode(descriptor.subject);
}

function lowerEdgeAdd(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'edge.add');
  patch.addEdge(descriptor.from, descriptor.to, descriptor.label);
}

function lowerEdgeRemove(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'edge.remove');
  patch.removeEdge(descriptor.from, descriptor.to, descriptor.label);
}

function lowerPropertySet(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'property.set');
  patch.setProperty(descriptor.subject, descriptor.key, descriptor.value);
}

function lowerEdgePropertySet(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'edgeProperty.set');
  patch.setEdgeProperty(
    descriptor.from,
    descriptor.to,
    descriptor.label,
    descriptor.key,
    descriptor.value,
  );
}

function assertDescriptorKind<K extends IntentKind>(
  descriptor: IntentDescriptor,
  kind: K,
): asserts descriptor is Extract<IntentDescriptor, { readonly kind: K }> {
  if (descriptor.kind !== kind) {
    throw new WarpError('Intent lowerer received a mismatched descriptor', 'E_INTENT_KIND');
  }
}
