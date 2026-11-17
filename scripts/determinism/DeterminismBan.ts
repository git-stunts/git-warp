// SPDX-License-Identifier: Apache-2.0

import type { InlineQuarantine } from './InlineQuarantine.ts';

/**
 * One nondeterministic API that domain code must not reach, matched line by
 * line. The match is textual on purpose: a comment that names the API fails
 * too, so the answer to a hit is a refactor, not an argument with a parser.
 */
export class DeterminismBan {
  readonly label: string;
  readonly pattern: RegExp;
  readonly quarantine: InlineQuarantine | null;

  private constructor(label: string, pattern: RegExp, quarantine: InlineQuarantine | null) {
    if (label.length === 0) {
      throw new RangeError('A determinism ban needs a label');
    }
    if (pattern.global || pattern.sticky) {
      throw new RangeError(`Ban ${label}: a global or sticky pattern keeps state between lines`);
    }
    this.label = label;
    this.pattern = pattern;
    this.quarantine = quarantine;
    Object.freeze(this);
  }

  /** A ban with no exception of any kind. */
  static absolute(label: string, pattern: RegExp): DeterminismBan {
    return new DeterminismBan(label, pattern, null);
  }

  /**
   * A ban that is also a Semgrep rule under an anti-sludge quarantine. A line
   * that carries that rule's inline quarantine marker is exempt from this ban
   * and from no other ban.
   */
  static quarantinedBy(label: string, pattern: RegExp, quarantine: InlineQuarantine): DeterminismBan {
    return new DeterminismBan(label, pattern, quarantine);
  }

  /** True when `line` breaks this ban. */
  isBrokenBy(line: string): boolean {
    if (!this.pattern.test(line)) {
      return false;
    }
    return this.quarantine === null || !this.quarantine.covers(line);
  }
}
