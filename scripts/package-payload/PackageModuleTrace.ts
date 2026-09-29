/** Immutable, deduplicated evidence from a packed module traversal. */
export default class PackageModuleTrace {
  readonly paths: readonly string[];
  readonly packages: readonly string[];
  readonly findings: readonly string[];

  constructor(paths: Iterable<string>, packages: Iterable<string>, findings: readonly string[]) {
    this.paths = Object.freeze([...new Set(paths)].sort());
    this.packages = Object.freeze([...new Set(packages)].sort());
    this.findings = Object.freeze([...findings]);
    Object.freeze(this);
  }
}
