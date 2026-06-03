import WarpError from '../errors/WarpError.ts';
import type TreeEntryPath from './TreeEntryPath.ts';

export default class TreeEntryFound {
  readonly path: TreeEntryPath;
  readonly oid: string;

  constructor(options: { readonly path: TreeEntryPath; readonly oid: string }) {
    if (options.oid.trim().length === 0) {
      throw new WarpError(
        'Tree entry OID must be non-empty',
        'E_TREE_ENTRY_OID',
      );
    }
    this.path = options.path;
    this.oid = options.oid;
    Object.freeze(this);
  }
}
