import PersistenceError from '../../domain/errors/PersistenceError.ts';

/** One `for-each-ref --format='%(objectname) %(refname)'` line. */
const REF_TARGET_LINE = /^([0-9a-f]{40}|[0-9a-f]{64}) (\S+)$/u;
/** `for-each-ref` printed a line that is not an object id and a ref name. */
export const E_REF_LISTING_MALFORMED = 'E_REF_LISTING_MALFORMED';

/** The `for-each-ref` arguments that list every ref under `prefix` with its target. */
export function refTargetListingArgs(prefix: string): string[] {
  return ['for-each-ref', '--format=%(objectname) %(refname)', prefix];
}

/** Parses that listing into ref name → object id, refusing any line it cannot read. */
export function parseRefTargetListing(output: string, prefix: string): ReadonlyMap<string, string> {
  const targets = new Map<string, string>();
  for (const line of output.split('\n').filter((each) => each.trim() !== '')) {
    const [ref, oid] = parseRefTargetLine(line, prefix);
    targets.set(ref, oid);
  }
  return targets;
}

function parseRefTargetLine(line: string, prefix: string): readonly [string, string] {
  const match = REF_TARGET_LINE.exec(line);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new PersistenceError(`Malformed for-each-ref line: ${line}`, E_REF_LISTING_MALFORMED, { context: { ref: prefix } });
  }
  return [match[2], match[1]];
}
