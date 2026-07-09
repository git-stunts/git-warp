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
  if (descriptor.kind !== 'node.add') {
    throw new WarpError('Intent lowerer received a mismatched descriptor', 'E_INTENT_KIND');
  }
  patch.addNode(descriptor.subject);
}

function lowerNodeRemove(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  if (descriptor.kind !== 'node.remove') {
    throw new WarpError('Intent lowerer received a mismatched descriptor', 'E_INTENT_KIND');
  }
  patch.removeNode(descriptor.subject);
}

function lowerEdgeAdd(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  if (descriptor.kind !== 'edge.add') {
    throw new WarpError('Intent lowerer received a mismatched descriptor', 'E_INTENT_KIND');
  }
  patch.addEdge(descriptor.from, descriptor.to, descriptor.label);
}

function lowerEdgeRemove(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  if (descriptor.kind !== 'edge.remove') {
    throw new WarpError('Intent lowerer received a mismatched descriptor', 'E_INTENT_KIND');
  }
  patch.removeEdge(descriptor.from, descriptor.to, descriptor.label);
}

function lowerPropertySet(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  if (descriptor.kind !== 'property.set') {
    throw new WarpError('Intent lowerer received a mismatched descriptor', 'E_INTENT_KIND');
  }
  patch.setProperty(descriptor.subject, descriptor.key, descriptor.value);
}

function lowerEdgePropertySet(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  if (descriptor.kind !== 'edgeProperty.set') {
    throw new WarpError('Intent lowerer received a mismatched descriptor', 'E_INTENT_KIND');
  }
  patch.setEdgeProperty(
    descriptor.from,
    descriptor.to,
    descriptor.label,
    descriptor.key,
    descriptor.value,
  );
}
