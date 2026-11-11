/** Unique real Git Trace2 identities first observed in one sample interval. */
export default class GitProcessCount {
  readonly total: number;
  readonly files: readonly string[];

  constructor(files: readonly string[]) {
    if (files.some((file) => file.length === 0) || new Set(files).size !== files.length) {
      throw new TypeError('a Git process count needs unique nonempty trace identities');
    }
    this.total = files.length;
    this.files = Object.freeze([...files]);
    Object.freeze(this);
  }
}
