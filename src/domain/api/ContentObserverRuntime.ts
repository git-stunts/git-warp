import WarpError from '../errors/WarpError.ts';
import ContentAttachment from './ContentAttachment.ts';
import ContentOwner from './ContentOwner.ts';
import Observer from './Observer.ts';
import type { NodeIntentFields, EdgeIntentFields } from './Intent.ts';
import type { ReadingValue } from './ReadingValue.ts';

const owners = new WeakMap<Observer, ContentOwner>();

/** Observes the current node attachment at one captured causal coordinate. */
export function createNodeContentObserver(fields: NodeIntentFields): Observer<ContentAttachment | null> {
  return contentObserver(new ContentOwner({ kind: 'node', subject: fields?.subject }));
}

/** Observes the current edge attachment at one captured causal coordinate. */
export function createEdgeContentObserver(fields: EdgeIntentFields): Observer<ContentAttachment | null> {
  return contentObserver(new ContentOwner({ ...fields, kind: 'edge' }));
}

export function contentObserverOwner<TValue extends ReadingValue>(observer: Observer<TValue>): ContentOwner | null {
  return owners.get(observer) ?? null;
}

function contentObserver(owner: ContentOwner): Observer<ContentAttachment | null> {
  const observer = new Observer<ContentAttachment | null>({
    id: `content.${owner.descriptor.kind}`, cardinality: 'exactly-one', decode: requireAttachment,
  });
  owners.set(observer, owner);
  return observer;
}

function requireAttachment(value: ReadingValue): ContentAttachment | null {
  if (value === null || value instanceof ContentAttachment) { return value; }
  throw new WarpError('Content observer requires an attachment or absence', 'E_CONTENT_READING');
}
