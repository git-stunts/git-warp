/* @generated from annotations.graphql by Wesley 0.3.0-alpha.1 and scripts/generated-sdk/RenderAnnotationsSdk.ts. Do not edit. */

/** Generated SDKs construct validated Intent and Observer values for Runtime Lane workflows. */
import type {
  Intent,
  Observer,
  ReadingValue,
} from '@git-stunts/git-warp';
import {
  createManyObserver,
  createObserver,
  intent,
  reading,
} from '@git-stunts/git-warp/advanced';
import type {
  MutationDeleteCommentRequest,
  MutationEditCommentRequest,
  MutationOpenThreadRequest,
  MutationReplyRequest,
  MutationResolveThreadRequest,
  QueryCommentFieldsRequest,
  QueryDocumentThreadsRequest,
  QueryThreadCommentPageRequest,
  QueryThreadCommentsRequest,
  QueryThreadFieldsRequest,
} from './annotations.wesley.generated.ts';

/** One stored field. An absent property reads as null. */
export type FieldValue = string | number | boolean | null;

/** One bounded page of neighbour ids, with the graph prefix removed. */
export type NeighborPage = Readonly<{
  ids: readonly string[];
  cursor: string | null;
  complete: boolean;
}>;

class AnnotationsSdkValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationsSdkValidationError';
  }
}

function requireRequest<TRequest>(request: TRequest, operation: string): TRequest {
  if (typeof request !== 'object' || request === null) {
    throw new AnnotationsSdkValidationError(`${operation} request must be an object`);
  }
  return request;
}

function requireId(prefix: string, value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AnnotationsSdkValidationError(`${field} must be a non-empty string`);
  }
  return prefix + value;
}

function requireValue<TValue extends string | number | boolean>(value: TValue, field: string): TValue {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new AnnotationsSdkValidationError(`${field} must be a safe integer`);
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new AnnotationsSdkValidationError(`${field} must be a scalar`);
  }
  return value;
}

function requireIds(ids: readonly string[], max: number, field: string): readonly string[] {
  if (!Array.isArray(ids)) {
    throw new AnnotationsSdkValidationError(`${field} must be an array`);
  }
  if (ids.length > max) {
    throw new AnnotationsSdkValidationError(`${field} must contain at most ${max} values`);
  }
  return Object.freeze(ids.map((id, index) => requireId('', id, `${field}[${index}]`)));
}

function cursorOption(cursor: string | null | undefined): { readonly cursor?: string } {
  return typeof cursor === 'string' && cursor.length > 0 ? { cursor } : {};
}

function decodeScalar(value: ReadingValue): FieldValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  throw new AnnotationsSdkValidationError('annotations field Observer expected a scalar');
}

function neighborId(edge: ReadingValue, prefix: string): string {
  if (typeof edge === 'object' && edge !== null && 'neighborId' in edge && typeof edge.neighborId === 'string'
    && edge.neighborId.startsWith(prefix)) {
    return edge.neighborId.slice(prefix.length);
  }
  throw new AnnotationsSdkValidationError(`annotations neighbour must be a ${prefix} node`);
}

function neighborPageDecoder(prefix: string): (value: ReadingValue) => NeighborPage {
  return (value) => {
    if (typeof value !== 'object' || value === null || !('edges' in value) || !Array.isArray(value.edges)
      || !('completeness' in value) || !('cursor' in value)) {
      throw new AnnotationsSdkValidationError('annotations neighbourhood Observer expected a neighbourhood page');
    }
    const edges: readonly ReadingValue[] = value.edges;
    const cursor = typeof value.cursor === 'string' ? value.cursor : null;
    return Object.freeze({
      ids: Object.freeze(edges.map((edge) => neighborId(edge, prefix))),
      cursor,
      complete: value.completeness === 'complete',
    });
  };
}

const COMMENT_FIELDS_KEYS = Object.freeze(['author', 'body', 'createdAt', 'inReplyTo', 'editedAt'] as const);
const THREAD_FIELDS_KEYS = Object.freeze(['document', 'quote', 'start', 'end', 'status', 'resolvedBy'] as const);

function deleteComment(fields: MutationDeleteCommentRequest): readonly Intent[] {
  const request = requireRequest(fields, 'annotations.deleteComment');
  const intents: Intent[] = [];
  intents.push(intent.edge.remove({ from: requireId('thread:', request.threadId, 'annotations.deleteComment.threadId'), to: requireId('comment:', request.commentId, 'annotations.deleteComment.commentId'), label: 'has_comment' }));
  intents.push(intent.node.remove({ subject: requireId('comment:', request.commentId, 'annotations.deleteComment.commentId') }));
  return Object.freeze(intents);
}

function editComment(fields: MutationEditCommentRequest): readonly Intent[] {
  const request = requireRequest(fields, 'annotations.editComment');
  const intents: Intent[] = [];
  intents.push(intent.property.set({ subject: requireId('comment:', request.commentId, 'annotations.editComment.commentId'), key: 'body', value: requireValue(request.body, 'annotations.editComment.body') }));
  intents.push(intent.property.set({ subject: requireId('comment:', request.commentId, 'annotations.editComment.commentId'), key: 'editedAt', value: requireValue(request.editedAt, 'annotations.editComment.editedAt') }));
  return Object.freeze(intents);
}

function openThread(fields: MutationOpenThreadRequest): readonly Intent[] {
  const request = requireRequest(fields, 'annotations.openThread');
  const intents: Intent[] = [];
  intents.push(intent.node.add({ subject: requireId('document:', request.documentId, 'annotations.openThread.documentId') }));
  intents.push(intent.node.add({ subject: requireId('thread:', request.threadId, 'annotations.openThread.threadId') }));
  intents.push(intent.property.set({ subject: requireId('thread:', request.threadId, 'annotations.openThread.threadId'), key: 'document', value: requireValue(request.documentId, 'annotations.openThread.documentId') }));
  intents.push(intent.property.set({ subject: requireId('thread:', request.threadId, 'annotations.openThread.threadId'), key: 'quote', value: requireValue(request.quote, 'annotations.openThread.quote') }));
  intents.push(intent.property.set({ subject: requireId('thread:', request.threadId, 'annotations.openThread.threadId'), key: 'start', value: requireValue(request.start, 'annotations.openThread.start') }));
  intents.push(intent.property.set({ subject: requireId('thread:', request.threadId, 'annotations.openThread.threadId'), key: 'end', value: requireValue(request.end, 'annotations.openThread.end') }));
  intents.push(intent.property.set({ subject: requireId('thread:', request.threadId, 'annotations.openThread.threadId'), key: 'status', value: 'open' }));
  intents.push(intent.edge.add({ from: requireId('document:', request.documentId, 'annotations.openThread.documentId'), to: requireId('thread:', request.threadId, 'annotations.openThread.threadId'), label: 'has_thread' }));
  intents.push(intent.node.add({ subject: requireId('comment:', request.commentId, 'annotations.openThread.commentId') }));
  intents.push(intent.property.set({ subject: requireId('comment:', request.commentId, 'annotations.openThread.commentId'), key: 'author', value: requireValue(request.author, 'annotations.openThread.author') }));
  intents.push(intent.property.set({ subject: requireId('comment:', request.commentId, 'annotations.openThread.commentId'), key: 'body', value: requireValue(request.body, 'annotations.openThread.body') }));
  intents.push(intent.property.set({ subject: requireId('comment:', request.commentId, 'annotations.openThread.commentId'), key: 'createdAt', value: requireValue(request.createdAt, 'annotations.openThread.createdAt') }));
  intents.push(intent.edge.add({ from: requireId('thread:', request.threadId, 'annotations.openThread.threadId'), to: requireId('comment:', request.commentId, 'annotations.openThread.commentId'), label: 'has_comment' }));
  return Object.freeze(intents);
}

function reply(fields: MutationReplyRequest): readonly Intent[] {
  const request = requireRequest(fields, 'annotations.reply');
  const intents: Intent[] = [];
  intents.push(intent.node.add({ subject: requireId('comment:', request.commentId, 'annotations.reply.commentId') }));
  intents.push(intent.property.set({ subject: requireId('comment:', request.commentId, 'annotations.reply.commentId'), key: 'author', value: requireValue(request.author, 'annotations.reply.author') }));
  intents.push(intent.property.set({ subject: requireId('comment:', request.commentId, 'annotations.reply.commentId'), key: 'body', value: requireValue(request.body, 'annotations.reply.body') }));
  intents.push(intent.property.set({ subject: requireId('comment:', request.commentId, 'annotations.reply.commentId'), key: 'createdAt', value: requireValue(request.createdAt, 'annotations.reply.createdAt') }));
  if (request.inReplyTo !== undefined && request.inReplyTo !== null) {
    intents.push(intent.property.set({ subject: requireId('comment:', request.commentId, 'annotations.reply.commentId'), key: 'inReplyTo', value: requireValue(request.inReplyTo, 'annotations.reply.inReplyTo') }));
  }
  intents.push(intent.edge.add({ from: requireId('thread:', request.threadId, 'annotations.reply.threadId'), to: requireId('comment:', request.commentId, 'annotations.reply.commentId'), label: 'has_comment' }));
  return Object.freeze(intents);
}

function resolveThread(fields: MutationResolveThreadRequest): readonly Intent[] {
  const request = requireRequest(fields, 'annotations.resolveThread');
  const intents: Intent[] = [];
  intents.push(intent.property.set({ subject: requireId('thread:', request.threadId, 'annotations.resolveThread.threadId'), key: 'status', value: 'resolved' }));
  intents.push(intent.property.set({ subject: requireId('thread:', request.threadId, 'annotations.resolveThread.threadId'), key: 'resolvedBy', value: requireValue(request.resolvedBy, 'annotations.resolveThread.resolvedBy') }));
  return Object.freeze(intents);
}

function commentFields(fields: QueryCommentFieldsRequest): Observer<FieldValue> {
  const request = requireRequest(fields, 'annotations.commentFields');
  const ids = requireIds(request.commentIds, 200, 'annotations.commentFields.commentIds');
  return createManyObserver('annotations.comment-fields', function* readings() {
    for (const id of ids) {
      for (const key of COMMENT_FIELDS_KEYS) {
        yield reading.property({ subject: 'comment:' + id, key });
      }
    }
  }, decodeScalar);
}

function documentThreads(fields: QueryDocumentThreadsRequest): Observer<NeighborPage> {
  const request = requireRequest(fields, 'annotations.documentThreads');
  return createObserver('annotations.document-threads', reading.neighborhood({ subject: requireId('document:', request.documentId, 'annotations.documentThreads.documentId'), direction: 'out', labels: ['has_thread'], limit: 100, ...cursorOption(request.cursor) }), neighborPageDecoder('thread:'));
}

function threadCommentPage(fields: QueryThreadCommentPageRequest): Observer<NeighborPage> {
  const request = requireRequest(fields, 'annotations.threadCommentPage');
  return createObserver('annotations.thread-comment-page', reading.neighborhood({ subject: requireId('thread:', request.threadId, 'annotations.threadCommentPage.threadId'), direction: 'out', labels: ['has_comment'], limit: 100, ...cursorOption(request.cursor) }), neighborPageDecoder('comment:'));
}

function threadComments(fields: QueryThreadCommentsRequest): Observer<NeighborPage> {
  const request = requireRequest(fields, 'annotations.threadComments');
  const ids = requireIds(request.threadIds, 100, 'annotations.threadComments.threadIds');
  return createManyObserver('annotations.thread-comments', function* readings() {
    for (const id of ids) {
      yield reading.neighborhood({ subject: 'thread:' + id, direction: 'out', labels: ['has_comment'], limit: 100 });
    }
  }, neighborPageDecoder('comment:'));
}

function threadFields(fields: QueryThreadFieldsRequest): Observer<FieldValue> {
  const request = requireRequest(fields, 'annotations.threadFields');
  const ids = requireIds(request.threadIds, 100, 'annotations.threadFields.threadIds');
  return createManyObserver('annotations.thread-fields', function* readings() {
    for (const id of ids) {
      for (const key of THREAD_FIELDS_KEYS) {
        yield reading.property({ subject: 'thread:' + id, key });
      }
    }
  }, decodeScalar);
}

export const annotations = Object.freeze({
  intents: Object.freeze({
    deleteComment,
    editComment,
    openThread,
    reply,
    resolveThread,
  }),
  observers: Object.freeze({
    commentFields,
    documentThreads,
    threadCommentPage,
    threadComments,
    threadFields,
  }),
  fields: Object.freeze({
    commentFields: COMMENT_FIELDS_KEYS,
    threadFields: THREAD_FIELDS_KEYS,
  }),
  limits: Object.freeze({
    commentFields: 200,
    threadComments: 100,
    threadFields: 100,
  }),
});
