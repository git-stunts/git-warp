import type MarginCorpus from './MarginCorpus.ts';
import type { Margins } from './Margins.ts';

/** Compares actual read membership with the independently generated corpus. */
export default function matchesCorpus(margins: Margins, expectedDocument: string, corpus: MarginCorpus): boolean {
  if (margins.documentId !== expectedDocument || !corpus.documents.includes(expectedDocument)) {
    return false;
  }
  const threads = corpus.threadsOf(expectedDocument);
  if (margins.threads.size !== threads.length) {
    return false;
  }
  return threads.every((thread) => {
    const actual = margins.threads.get(thread);
    const expected = corpus.commentsOf(thread);
    return actual !== undefined && actual.length === expected.length
      && expected.every((comment) => actual.includes(comment));
  });
}
