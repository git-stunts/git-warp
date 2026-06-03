import type TreeEntryPath from './TreeEntryPath.ts';

export default class TreeEntryMissing {
  readonly path: TreeEntryPath;

  constructor(path: TreeEntryPath) {
    this.path = path;
    Object.freeze(this);
  }
}
