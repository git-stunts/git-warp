// SPDX-License-Identifier: Apache-2.0

import type { DeterminismBan } from './DeterminismBan.ts';

export type DeterminismViolationSite = {
  /** Repository-relative path with `/` separators. */
  readonly path: string;
  /** 1-based line number. */
  readonly lineNumber: number;
  readonly lineText: string;
};

/** One domain source line that breaks one determinism ban. */
export class DeterminismViolation {
  readonly ban: DeterminismBan;
  readonly path: string;
  readonly lineNumber: number;
  readonly lineText: string;

  constructor(ban: DeterminismBan, site: DeterminismViolationSite) {
    if (!Number.isSafeInteger(site.lineNumber) || site.lineNumber < 1) {
      throw new RangeError(`Line numbers start at 1; got ${site.lineNumber} for ${site.path}`);
    }
    this.ban = ban;
    this.path = site.path;
    this.lineNumber = site.lineNumber;
    this.lineText = site.lineText;
    Object.freeze(this);
  }

  /** `BANNED <label>: <path>:<line>: <source text>` */
  toString(): string {
    return `BANNED ${this.ban.label}: ${this.path}:${this.lineNumber}: ${this.lineText.trim()}`;
  }
}
