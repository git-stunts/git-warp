/**
 * Argument assembly for the Git history read commands.
 *
 * Extracted from GitTimelineHistoryAdapter so the buffered and streaming
 * log reads share one definition of how a history query becomes `git log`
 * arguments.
 *
 * @module infrastructure/adapters/GitLogArgs
 */

/** Git `-z` uses NUL as its record terminator, so a format may not contain one. */
function stripNulBytes(format: string): string {
  // eslint-disable-next-line no-control-regex
  return format.replace(/\x00/gu, '');
}

/**
 * Assembles `git log` arguments shared by the buffered and streaming reads.
 *
 * `firstParent` constrains traversal to first parents so a chain read never
 * pays for a merge's side branch, matching how patch-chain walkers advance.
 *
 * `stopAt` bounds the read to the range `stopAt..ref`, so a caller that stops
 * walking at a known boundary does not read history beyond it.
 *
 * `stripNulFormat` removes NUL bytes from the format AFTER deciding whether a
 * format was supplied at all: a caller-supplied format consisting only of NUL
 * bytes still yields an explicit empty `--format=`, matching Git's own
 * treatment of an empty format.
 */
export function buildLogArgs({ base, ref, format, firstParent, stripNulFormat, stopAt }: {
  base: readonly string[];
  ref: string;
  format: string | undefined;
  firstParent: boolean;
  stripNulFormat: boolean;
  stopAt: string | undefined;
}): string[] {
  const args = [...base];
  if (firstParent) {
    args.push('--first-parent');
  }
  const formatArg = resolveFormatArg(format, stripNulFormat);
  if (formatArg !== null) {
    args.push(formatArg);
  }
  args.push(resolveRevRange(ref, stopAt));
  return args;
}

/** Renders the `--format=` argument, or null when no format was supplied. */
function resolveFormatArg(format: string | undefined, stripNulFormat: boolean): string | null {
  if (typeof format !== 'string' || format.length === 0) {
    return null;
  }
  return `--format=${stripNulFormat ? stripNulBytes(format) : format}`;
}

/** Renders the revision selector: a `stopAt..ref` range, or the bare ref. */
function resolveRevRange(ref: string, stopAt: string | undefined): string {
  if (typeof stopAt !== 'string' || stopAt.length === 0) {
    return ref;
  }
  return `${stopAt}..${ref}`;
}
