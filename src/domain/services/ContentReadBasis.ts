import type RefPort from '../../ports/RefPort.ts';
import { compareStrings } from '../utils/StringComparison.ts';
import WarpError from '../errors/WarpError.ts';
import { buildWritersPrefix, parseWriterIdFromRef } from '../utils/RefLayout.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export const MAX_CONTENT_READ_WRITERS = 1024;

/** Immutable heads for a bounded full-history content observation. */
export default class ContentReadBasis {
  readonly entries: readonly (readonly [string, string])[];

  constructor(frontier: ReadonlyMap<string, string>) {
    if (frontier.size > MAX_CONTENT_READ_WRITERS) { throw contentReadLimit(); }
    this.entries = Object.freeze([...frontier].sort(([a], [b]) => compareStrings(a, b))
      .map(([writer, head]) => {
        requireNonEmptyString(writer, 'content.writer');
        requireNonEmptyString(head, 'content.head');
        return Object.freeze<[string, string]>([writer, head]);
      }));
    Object.freeze(this);
  }

  static async capture(refs: RefPort, graph: string): Promise<ContentReadBasis> {
    const names = await refs.listRefs(buildWritersPrefix(graph), { limit: MAX_CONTENT_READ_WRITERS + 1 });
    if (names.length > MAX_CONTENT_READ_WRITERS) { throw contentReadLimit(); }
    const frontier = new Map<string, string>();
    for (const name of names.sort()) {
      const writer = parseWriterIdFromRef(name);
      const head = await refs.readRef(name);
      if (writer !== null && head !== null) { frontier.set(writer, head); }
    }
    return new ContentReadBasis(frontier);
  }
}

export function contentReadLimit(): WarpError {
  return new WarpError('Content observation exceeds its bounded history profile', 'E_CONTENT_READ_LIMIT');
}
