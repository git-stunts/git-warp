import WarpError from '../errors/WarpError.ts';

const NUL_BYTE = '\0';

export default class TreeEntryPath {
  readonly value: string;

  constructor(value: string) {
    if (value.trim().length === 0) {
      throw new WarpError(
        'Tree entry path must be non-empty',
        'E_TREE_ENTRY_PATH',
      );
    }
    if (value.includes(NUL_BYTE)) {
      throw new WarpError(
        'Tree entry path must not contain NUL bytes',
        'E_TREE_ENTRY_PATH',
      );
    }
    if (value.startsWith('/')) {
      throw new WarpError(
        'Tree entry path must be relative',
        'E_TREE_ENTRY_PATH',
      );
    }
    if (value.startsWith(':')) {
      throw new WarpError(
        'Tree entry path must not use Git pathspec magic',
        'E_TREE_ENTRY_PATH',
      );
    }
    this.value = value;
    Object.freeze(this);
  }

  withoutTrailingSlash(): TreeEntryPath {
    if (!this.value.endsWith('/')) {
      return this;
    }
    return new TreeEntryPath(this.value.slice(0, -1));
  }
}
