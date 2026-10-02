import WarpError from '../errors/WarpError.ts';
import ContentAttachmentHandle from '../graph/ContentAttachmentHandle.ts';
import ContentAttachmentMime from '../graph/ContentAttachmentMime.ts';
import ContentAttachmentPayload from '../graph/ContentAttachmentPayload.ts';
import ContentAttachmentSize from '../graph/ContentAttachmentSize.ts';
import type ContentStagingAuthority from '../services/ContentStagingAuthority.ts';
import type { PatchBuilder } from '../services/PatchBuilder.ts';
import {
  CONTENT_PROPERTY_KEY, CONTENT_SIZE_PROPERTY_KEY, CONTENT_MIME_PROPERTY_KEY,
  decodeLegacyEdgePropNode, encodeLegacyEdgePropNode, isLegacyEdgePropNode,
} from '../services/KeyCodec.ts';
import EdgePropSet from '../types/ops/EdgePropSet.ts';
import NodePropSet from '../types/ops/NodePropSet.ts';
import PropSet from '../types/ops/PropSet.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import Intent, { isContentIntentDescriptor, type ContentIntentDescriptor } from './Intent.ts';
import StagedContent from './StagedContent.ts';

export const CONTENT_INTENT_OPERATION_COUNT = 3;
const retainedPayloads = new WeakMap<Intent, ContentAttachmentPayload>();
type ContentPropertyOperation = PropSet | NodePropSet | EdgePropSet;

/** Resolves trusted staging or retained-history provenance before mutating a patch. */
export function applyContentIntentToPatch(
  intent: Intent, patch: PatchBuilder, authority?: ContentStagingAuthority,
): void {
  const { descriptor } = intent;
  if (!isContentIntentDescriptor(descriptor)) { throw contentIntentError(); }
  if (descriptor.kind === 'node.content.clear') {
    patch.clearContent(descriptor.subject);
  } else if (descriptor.kind === 'edge.content.clear') {
    patch.clearEdgeContent(descriptor.from, descriptor.to, descriptor.label);
  } else {
    lowerContentAttachment(descriptor, patch, requireContentPayload(intent, descriptor.content, authority));
  }
}

type AttachDescriptor = Extract<ContentIntentDescriptor, { readonly content: StagedContent }>;
function requireContentPayload(
  intent: Intent, content: StagedContent, authority?: ContentStagingAuthority,
): ContentAttachmentPayload {
  const payload = retainedPayloads.get(intent) ?? authority?.requirePayload(content);
  if (payload === undefined) {
    throw new WarpError('Attachment requires content staged by this Runtime', 'E_CONTENT_FOREIGN');
  }
  return payload;
}

function lowerContentAttachment(
  descriptor: AttachDescriptor, patch: PatchBuilder, payload: ContentAttachmentPayload,
): void {
  if (descriptor.kind === 'node.content.attach') {
    patch.attachStagedContent(descriptor.subject, payload);
  } else {
    patch.attachStagedEdgeContent(descriptor, payload);
  }
}

/** Checks the complete ordered metadata triple, including its explicit owner. */
export function contentIntentMatchesOperations(
  descriptor: ContentIntentDescriptor, operations: readonly PatchOp[],
): boolean {
  if (operations.length !== CONTENT_INTENT_OPERATION_COUNT) { return false; }
  const expected = contentPropertyValues(descriptor);
  return expected.every(([key, value], index) => {
    const operation = operations[index];
    return isContentPropertyOperation(operation) && ownerMatches(descriptor, operation)
      && operation.key === key && operation.value === value;
  });
}

function contentPropertyValues(descriptor: ContentIntentDescriptor): readonly (readonly [string, string | number | null])[] {
  const values = 'content' in descriptor
    ? [descriptor.content.id, descriptor.content.size, descriptor.content.mime]
    : [null, null, null];
  return [
    [CONTENT_PROPERTY_KEY, values[0] ?? null],
    [CONTENT_SIZE_PROPERTY_KEY, values[1] ?? null],
    [CONTENT_MIME_PROPERTY_KEY, values[2] ?? null],
  ];
}

/** Recognizes managed metadata as one retained attachment, never three scalar writes. */
export function contentIntentFromOperations(
  operations: readonly PatchOp[], index: number,
): Intent | null {
  const triple = contentTriple(operations, index);
  if (triple === null || triple[0].key !== CONTENT_PROPERTY_KEY) { return null; }
  const intent = intentFromTriple(triple);
  return intent !== null && matchesRecovered(intent, operations, index) ? intent : null;
}

type ContentTriple = readonly [ContentPropertyOperation, ContentPropertyOperation, ContentPropertyOperation];
function contentTriple(operations: readonly PatchOp[], index: number): ContentTriple | null {
  const identity = operations[index];
  const size = operations[index + 1];
  const mime = operations[index + 2];
  return isContentPropertyOperation(identity) && isContentPropertyOperation(size) && isContentPropertyOperation(mime)
    ? [identity, size, mime] : null;
}

function intentFromTriple([identity, size, mime]: ContentTriple): Intent | null {
  if (identity.value === null && size.value === null && mime.value === null) { return clearIntentFor(identity); }
  const content = contentFromMetadata(identity, size, mime);
  if (content === null) { return null; }
  const intent = attachIntentFor(identity, content);
  retainedPayloads.set(intent, retainedPayload(content));
  return intent;
}

function retainedPayload(content: StagedContent): ContentAttachmentPayload {
  return new ContentAttachmentPayload({
    handle: new ContentAttachmentHandle(content.id),
    size: new ContentAttachmentSize(content.size),
    mime: content.mime === null ? null : new ContentAttachmentMime(content.mime),
  });
}

function contentFromMetadata(
  identity: ContentPropertyOperation, size: ContentPropertyOperation, mime: ContentPropertyOperation,
): StagedContent | null {
  if (typeof identity.value !== 'string' || typeof size.value !== 'number'
    || !isContentMime(mime.value)) { return null; }
  return new StagedContent({ id: identity.value, size: size.value, mime: mime.value });
}

function isContentMime<T>(value: T | string | null): value is string | null {
  return value === null || typeof value === 'string';
}

function matchesRecovered(intent: Intent, operations: readonly PatchOp[], index: number): boolean {
  const { descriptor } = intent;
  return isContentIntentDescriptor(descriptor)
    && contentIntentMatchesOperations(descriptor, operations.slice(index, index + CONTENT_INTENT_OPERATION_COUNT));
}

function clearIntentFor(operation: ContentPropertyOperation): Intent {
  if (operation instanceof EdgePropSet) { return Intent.clearEdgeContent(operation); }
  return isLegacyEdgePropNode(operation.node)
    ? Intent.clearEdgeContent(decodeLegacyEdgePropNode(operation.node))
    : Intent.clearNodeContent({ subject: operation.node });
}

function attachIntentFor(operation: ContentPropertyOperation, content: StagedContent): Intent {
  if (operation instanceof EdgePropSet) { return Intent.attachEdgeContent({ ...operation, content }); }
  return isLegacyEdgePropNode(operation.node)
    ? Intent.attachEdgeContent({ ...decodeLegacyEdgePropNode(operation.node), content })
    : Intent.attachNodeContent({ subject: operation.node, content });
}

function ownerMatches(descriptor: ContentIntentDescriptor, operation: ContentPropertyOperation): boolean {
  if ('subject' in descriptor) {
    return !(operation instanceof EdgePropSet) && operation.node === descriptor.subject;
  }
  return operation instanceof EdgePropSet
    ? edgeOwnerMatches(descriptor, operation)
    : operation.node === encodeLegacyEdgePropNode(descriptor.from, descriptor.to, descriptor.label);
}

function edgeOwnerMatches(
  descriptor: Extract<ContentIntentDescriptor, { readonly from: string }>, operation: EdgePropSet,
): boolean {
  return operation.from === descriptor.from && operation.to === descriptor.to && operation.label === descriptor.label;
}

function isContentPropertyOperation(operation: PatchOp | undefined): operation is ContentPropertyOperation {
  return operation instanceof PropSet || operation instanceof NodePropSet || operation instanceof EdgePropSet;
}

function contentIntentError(): WarpError {
  return new WarpError('Expected an attachment intent', 'E_INTENT_KIND');
}
