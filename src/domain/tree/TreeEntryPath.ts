import WarpError from '../errors/WarpError.ts';

const NUL_BYTE = '\0';

export default class TreeEntryPath {
  readonly value: string;

  constructor(value: string) {
    assertTreeEntryPath(value);
    this.value = value;
    Object.freeze(this);
  }

  withoutTrailingSlash(): TreeEntryPath {
    if (!this.value.endsWith('/')) {
      return this;
    }
    let end = this.value.length;
    while (end > 0 && this.value[end - 1] === '/') {
      end -= 1;
    }
    return new TreeEntryPath(this.value.slice(0, end));
  }
}

function assertTreeEntryPath(value: string): void {
  assertTreeEntryPathContent(value);
  assertTreeEntryPathBoundaries(value);
}

function assertTreeEntryPathContent(value: string): void {
  if (value.trim().length === 0) {
    throwTreeEntryPathError('Tree entry path must be non-empty');
  }
  if (value.includes(NUL_BYTE)) {
    throwTreeEntryPathError('Tree entry path must not contain NUL bytes');
  }
}

function assertTreeEntryPathBoundaries(value: string): void {
  if (value.trim() !== value) {
    throwTreeEntryPathError('Tree entry path must not have leading or trailing whitespace');
  }
  if (value.startsWith('/')) {
    throwTreeEntryPathError('Tree entry path must be relative');
  }
  if (value.startsWith(':')) {
    throwTreeEntryPathError('Tree entry path must not use Git pathspec magic');
  }
}

function throwTreeEntryPathError(message: string): never {
  throw new WarpError(message, 'E_TREE_ENTRY_PATH');
}
