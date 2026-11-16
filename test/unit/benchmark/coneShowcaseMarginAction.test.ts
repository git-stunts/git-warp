import { describe, expect, it } from 'vitest';

import { intent } from '../../../advanced.ts';
import MarginAction from '../../../benchmarks/cone-showcase/MarginAction.ts';
import MarginCorpus from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import SeededRandom from '../../../benchmarks/cone-showcase/SeededRandom.ts';
import { CORPUS_SEED, MEASURED_SAVES } from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';

const ADD = intent.node.add({ subject: 'comment:c0' });

/** Every document's threads and every thread's comments, as the corpus states them now. */
function membership(corpus: MarginCorpus): ReadonlyMap<string, readonly (readonly [string, readonly string[]])[]> {
  return new Map(corpus.documents.map((documentId) => [
    documentId, corpus.threadsOf(documentId).map((thread) => [thread, corpus.commentsOf(thread)] as const),
  ]));
}

function threadOfComment(corpus: MarginCorpus, documentId: string, commentId: string): string | undefined {
  return corpus.threadsOf(documentId).find((thread) => corpus.commentsOf(thread).includes(commentId));
}

describe('cone-showcase margin actions', () => {
  // Oracle: the MarginAction contract (specified in its class comment): one known
  // operation on one exact corpus document and subject, with at least one intent.
  it('keeps an exact frozen copy of its operation, identities and intents', () => {
    const intents = [ADD];
    const action = new MarginAction('reply', 'd3', 'c0', intents);
    intents.length = 0;
    expect([action.operation, action.documentId, action.subjectId, action.intents]).toEqual(['reply', 'd3', 'c0', [ADD]]);
    expect(Object.isFrozen(action)).toBe(true);
    expect(Object.isFrozen(action.intents)).toBe(true);
  });

  it('refuses an unknown operation or an action with no intents', () => {
    // @ts-expect-error Exercise the JavaScript boundary.
    expect(() => new MarginAction('deleteThread', 'd0', 'c0', [ADD])).toThrow('a margin action needs a known operation and at least one intent');
    expect(() => new MarginAction('reply', 'd0', 'c0', [])).toThrow('a margin action needs a known operation and at least one intent');
  });

  it.each([
    ['openThread', 'document-0', 't0'],
    ['openThread', 'd0', 'c0'],
    ['reply', 'd0', 't0'],
    ['editComment', 'd0', 'comment-0'],
  ] as const)('refuses %s on document %s with subject %s', (operation, documentId, subjectId) => {
    expect(() => new MarginAction(operation, documentId, subjectId, [ADD])).toThrow('a margin action needs its exact corpus document and subject');
  });

  it('refuses a corpus without a positive whole number of threads, and lists nothing for ids outside it', () => {
    expect(() => new MarginCorpus(0)).toThrow('a margin corpus needs a positive whole number of threads');
    expect(() => new MarginCorpus(1.5)).toThrow('a margin corpus needs a positive whole number of threads');
    const corpus = new MarginCorpus(1);
    expect([corpus.threadsOf('d1'), corpus.commentsOf('t1')]).toEqual([[], []]);
  });

  // Oracle: the README workload (specified): measured saves are replies, comment
  // edits or new threads, drawn by a fixed seeded generator.
  it('draws the same measured saves from the same seed', () => {
    const saves = (): readonly string[] => {
      const corpus = new MarginCorpus(200);
      const random = new SeededRandom(CORPUS_SEED);
      return Array.from({ length: MEASURED_SAVES }, (_unused, index) => corpus.nextSave(random, index % 3))
        .map((action) => [action.operation, action.documentId, action.subjectId].join(' '));
    };
    expect(saves()).toEqual(saves());
  });

  it('changes the expected corpus exactly as each measured save changes the margins', () => {
    const corpus = new MarginCorpus(200);
    const random = new SeededRandom(CORPUS_SEED);
    const kinds = new Set<string>();
    for (let index = 0; index < MEASURED_SAVES; index += 1) {
      const before = membership(corpus);
      const action = corpus.nextSave(random, index % 3);
      kinds.add(action.operation);
      const after = membership(corpus);
      const beforeDocument = before.get(action.documentId) ?? [];
      if (action.operation === 'editComment') {
        expect(threadOfComment(corpus, action.documentId, action.subjectId)).toBeDefined();
        expect(after).toEqual(before);
        expect(action.intents).toHaveLength(1);
      } else if (action.operation === 'reply') {
        const thread = threadOfComment(corpus, action.documentId, action.subjectId);
        expect(thread).toBeDefined();
        expect(beforeDocument.some(([, comments]) => comments.includes(action.subjectId))).toBe(false);
        expect(after.get(action.documentId)).toEqual(beforeDocument.map(([id, comments]) =>
          [id, id === thread ? [...comments, action.subjectId] : comments]));
        expect(action.intents).toHaveLength(4);
      } else {
        expect(beforeDocument.map(([id]) => id)).not.toContain(action.subjectId);
        expect(corpus.threadsOf(action.documentId)).toEqual([...beforeDocument.map(([id]) => id), action.subjectId]);
        expect(corpus.commentsOf(action.subjectId)).toHaveLength(1);
        expect(action.intents).toHaveLength(7);
      }
      for (const [documentId, threads] of before) {
        if (documentId !== action.documentId) {
          expect(after.get(documentId)).toEqual(threads);
        }
      }
    }
    expect(kinds).toEqual(new Set(['openThread', 'reply', 'editComment']));
  });

  // Oracle: every comment author is one of the three witness writers; an index
  // outside WRITERS is refused rather than attributed to a fallback writer.
  it('refuses a reply from a writer index outside the witness writers', () => {
    const corpus = new MarginCorpus(3);
    expect(() => corpus.replies(7)).toThrow(new RangeError('no witness writer at 7'));
    expect(() => corpus.replies(-1)).toThrow(new RangeError('no witness writer at -1'));
  });
});
