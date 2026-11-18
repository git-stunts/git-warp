// SPDX-License-Identifier: Apache-2.0

export type PublishedVersionsFields = {
  /** The version that the package's `latest` dist-tag names. */
  readonly latest: string;
  /** The published versions inside the advisory's range, as `npm view <package>@<range> version` lists them. */
  readonly vulnerable: readonly string[];
};

/** What the registry publishes for one vulnerable package, measured against one advisory's range. */
export class PublishedVersions {
  readonly latest: string;
  readonly vulnerable: readonly string[];

  constructor(fields: PublishedVersionsFields) {
    if (fields.latest.length === 0) {
      throw new RangeError('Published versions need the latest version');
    }
    this.latest = fields.latest;
    this.vulnerable = Object.freeze([...fields.vulnerable]);
    Object.freeze(this);
  }

  /** True when the latest version is outside the advisory's range, so a patched version is published. */
  get patchPublished(): boolean {
    return !this.vulnerable.includes(this.latest);
  }
}
