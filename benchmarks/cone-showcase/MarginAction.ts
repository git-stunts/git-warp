import type { Intent } from '../../index.ts';

export type MarginOperation = 'openThread' | 'reply' | 'editComment';
export const MARGIN_OPERATIONS: readonly MarginOperation[] = Object.freeze(['openThread', 'reply', 'editComment']);

/** One user action on the margins: one operation, executed as one atomic intent sequence. */
export default class MarginAction {
  readonly operation: MarginOperation;
  readonly documentId: string;
  readonly subjectId: string;
  readonly intents: readonly Intent[];

  constructor(operation: MarginOperation, documentId: string, subjectId: string, intents: readonly Intent[]) {
    if (!MARGIN_OPERATIONS.includes(operation) || intents.length === 0) {
      throw new RangeError('a margin action needs a known operation and at least one intent');
    }
    if (!/^d\d+$/.test(documentId) || !(operation === 'openThread' ? /^t\d+$/ : /^c\d+$/).test(subjectId)) {
      throw new TypeError('a margin action needs its exact corpus document and subject');
    }
    this.operation = operation;
    this.documentId = documentId;
    this.subjectId = subjectId;
    this.intents = Object.freeze([...intents]);
    Object.freeze(this);
  }
}
