// SPDX-License-Identifier: Apache-2.0

/**
 * Diff basis for the quarantine graduate-check gate.
 *
 * Computes the set of paths a branch touches relative to its merge-base with
 * a target ref. Two properties matter more than convenience here.
 *
 * **Rename detection is disabled.** This gate does not care whether Git
 * believes a file was renamed; it cares that neither the old nor the new path
 * can escape scrutiny. With `--no-renames` a rename is an ordinary deletion
 * plus addition, so both paths enter the touched set — no similarity
 * threshold, no rename grammar to parse, and no way for a heavily rewritten
 * rename to be classified out of the gate. Copies remain plain additions,
 * which is what the gate wants: new code is judged on its own merits and can
 * never inherit a quarantine.
 *
 * **Paths are byte-exact.** `-z` is a protocol, not human-readable lines.
 * Leading and trailing whitespace are legal filename content, so trimming a
 * path would let `src/example.ts ` stop matching its manifest entry and turn
 * a touched quarantined file into a silent PASS.
 *
 * Failure to establish a basis throws. A gate that cannot determine what
 * changed cannot prove that nothing quarantined was touched, so it must not
 * report success.
 *
 * @module scripts/quarantineDiffBasis
 */

import { execFileSync } from 'node:child_process';

/**
 * Raised when the diff basis cannot be established. The gate treats this
 * as a tooling failure (exit 2), never as a pass.
 */
export class DiffBasisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiffBasisError';
  }
}

/**
 * Returns the touched-path set for the current branch against the target
 * base, using git merge-base for a true branch diff.
 *
 * Throws DiffBasisError when the base or merge-base cannot be resolved.
 */
export function getTouchedFiles(base: string, repoRoot: string): readonly string[] {
  const mergeBase = resolveMergeBase(base, repoRoot);
  let output: string;
  try {
    output = execFileSync(
      'git',
      ['diff', '--name-only', '-z', '--no-renames', `${mergeBase}..HEAD`],
      { cwd: repoRoot, encoding: 'utf8' },
    );
  } catch (err) {
    throw new DiffBasisError(
      `git diff against merge-base ${mergeBase} failed: `
      + `${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // NUL-delimited: split only on the delimiter and keep every byte of each
  // path. Do not trim — whitespace is legal in a filename.
  return output.split('\0').filter((path) => path.length > 0);
}

function resolveMergeBase(base: string, repoRoot: string): string {
  let mergeBase: string;
  try {
    mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch (err) {
    throw new DiffBasisError(
      `cannot resolve merge-base against ${base}: `
      + `${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (mergeBase.length === 0) {
    throw new DiffBasisError(`merge-base against ${base} produced no commit`);
  }
  return mergeBase;
}
