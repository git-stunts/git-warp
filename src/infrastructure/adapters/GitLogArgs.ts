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
 * `stripNulFormat` removes NUL bytes from the format AFTER deciding whether a
 * format was supplied at all: a caller-supplied format consisting only of NUL
 * bytes still yields an explicit empty `--format=`, matching Git's own
 * treatment of an empty format.
 */
export function buildLogArgs({ base, ref, format, firstParent, stripNulFormat }: {
  base: readonly string[];
  ref: string;
  format: string | undefined;
  firstParent: boolean;
  stripNulFormat: boolean;
}): string[] {
  const args = [...base];
  if (firstParent) {
    args.push('--first-parent');
  }
  if (typeof format === 'string' && format.length > 0) {
    args.push(`--format=${stripNulFormat ? stripNulBytes(format) : format}`);
  }
  args.push(ref);
  return args;
}
