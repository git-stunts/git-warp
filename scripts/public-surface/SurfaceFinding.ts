/** Stable capability identity is separate from its movable source coordinate. */
export default class SurfaceFinding {
  readonly key: string;
  readonly source: string;

  constructor(identity: readonly string[], source: string) {
    if (identity.length !== 4 || identity.some((part) => part.length === 0) || source.length === 0) {
      throw new TypeError('A surface finding requires subpath, export, route, rule and source');
    }
    this.key = identity.map((part) => encodeURIComponent(part)).join(' ');
    this.source = source;
    Object.freeze(this);
  }

  describe(): string {
    return `${this.key} (${this.source})`;
  }
}
