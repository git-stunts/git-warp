import WarpError from '../errors/WarpError.ts';
import type TreeEntryPath from './TreeEntryPath.ts';

const GIT_OBJECT_ID_PATTERN = /^[0-9a-fA-F]{4,64}$/u;

export default class TreeEntryFound {
  readonly path: TreeEntryPath;
  readonly oid: string;

  constructor(options: { readonly path: TreeEntryPath; readonly oid: string }) {
    if (!GIT_OBJECT_ID_PATTERN.test(options.oid)) {
      throw new WarpError(
        'Tree entry OID must be a Git object ID',
        'E_TREE_ENTRY_OID',
      );
    }
    this.path = options.path;
    this.oid = options.oid;
    Object.freeze(this);
  }
}
