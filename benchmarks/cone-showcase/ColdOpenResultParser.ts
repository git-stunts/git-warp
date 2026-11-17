import { Margins, MarginsUnavailable, type MarginsRead } from './Margins.ts';

export const COLD_RESULT_LIMIT = 65_536;
const VERSION = 'cone-margins-v1';

function exactCount(text: string): number {
  if (!/^(0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new TypeError('a cold result count must be a nonnegative safe integer');
  }
  return Number(text);
}

function framedLines(output: string): string[] {
  if (output.length === 0 || output.length > COLD_RESULT_LIMIT
    || new TextEncoder().encode(output).byteLength > COLD_RESULT_LIMIT
    || !output.endsWith('\n')) {
    throw new TypeError('a cold result must be bounded and end with a newline');
  }
  return output.slice(0, -1).split('\n');
}

function requireMatchingFrame(header: readonly string[], trailer: readonly string[], expectedDocument: string): void {
  const [version, , documentId] = header;
  const [end, endDocument] = trailer;
  if (header.length !== 3 || version !== VERSION || documentId !== expectedDocument
    || !/^d\d+$/.test(expectedDocument) || trailer.length !== 4
    || end !== 'end' || endDocument !== expectedDocument) {
    throw new TypeError('a cold result must have one matching header and trailer');
  }
}

function incompleteReason(lines: readonly string[], expectedThreads: number, expectedComments: number): MarginsUnavailable {
  const reason = lines[0]?.split('\t') ?? [];
  if (lines.length !== 1 || reason.length !== 4 || reason[0] !== 'reason'
    || expectedThreads !== 0 || expectedComments !== 0) {
    throw new TypeError('an incomplete cold result must retain exactly one reason');
  }
  const [, observer = '', status = '', detail = ''] = reason;
  return new MarginsUnavailable(decodeURIComponent(observer), decodeURIComponent(status), decodeURIComponent(detail));
}

function completedMembership(lines: readonly string[], expectedDocument: string, expectedThreads: number, expectedComments: number): Margins {
  const threads = new Map<string, readonly string[]>();
  let comments = 0;
  for (const line of lines) {
    const fields = line.split('\t');
    const [kind, threadId = '', members = ''] = fields;
    if (fields.length !== 3 || kind !== 'thread' || threads.has(threadId)) {
      throw new TypeError('a cold result must contain one record per actual thread');
    }
    const ids = members === '' ? [] : members.split(',');
    comments += ids.length;
    threads.set(threadId, ids);
  }
  const result = new Margins(expectedDocument, threads);
  if (result.threads.size !== expectedThreads || comments !== expectedComments) {
    throw new TypeError('cold result membership does not match its trailer counts');
  }
  return result;
}

/** Decode the complete framed membership transport from the actual child. */
export default function parseColdOpenResult(output: string, expectedDocument: string): MarginsRead {
  const lines = framedLines(output);
  const header = lines.shift()?.split('\t') ?? [];
  const trailer = lines.pop()?.split('\t') ?? [];
  const [, outcome] = header;
  const [, , threadCount = '', commentCount = ''] = trailer;
  requireMatchingFrame(header, trailer, expectedDocument);
  const expectedThreads = exactCount(threadCount);
  const expectedComments = exactCount(commentCount);
  if (outcome === 'incomplete') {
    return incompleteReason(lines, expectedThreads, expectedComments);
  }
  if (outcome !== 'completed') {
    throw new TypeError('a cold result must declare completed or incomplete');
  }
  return completedMembership(lines, expectedDocument, expectedThreads, expectedComments);
}

/** Encode actual membership; counts cannot substitute for identities. */
export function formatColdOpenResult(documentId: string, result: MarginsRead): string {
  if (!/^d\d+$/.test(documentId)) {
    throw new TypeError('a cold result needs a corpus document identity');
  }
  if (result instanceof MarginsUnavailable) {
    return [
      [VERSION, 'incomplete', documentId].join('\t'),
      ['reason', result.observer, result.status, result.reason].map((field, index) =>
        index === 0 ? field : encodeURIComponent(field)).join('\t'),
      ['end', documentId, '0', '0'].join('\t'),
      '',
    ].join('\n');
  }
  if (result.documentId !== documentId) {
    throw new TypeError('a cold read returned another document');
  }
  const rows = [...result.threads].map(([thread, comments]) => ['thread', thread, comments.join(',')].join('\t'));
  const comments = [...result.threads.values()].reduce((total, ids) => total + ids.length, 0);
  return [
    [VERSION, 'completed', documentId].join('\t'),
    ...rows,
    ['end', documentId, String(result.threads.size), String(comments)].join('\t'),
    '',
  ].join('\n');
}
