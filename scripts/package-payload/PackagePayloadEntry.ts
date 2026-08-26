import PackagePayloadError from './PackagePayloadError.ts';

export default class PackagePayloadEntry {
  readonly path: string;
  readonly size: number;

  constructor(path: string, size: number) {
    assertValidPath(path);
    assertValidSize(path, size);
    this.path = path;
    this.size = size;
    Object.freeze(this);
  }
}

function assertValidPath(path: string): void {
  const pathSegments = path.split('/');
  if (path.length === 0 || path.startsWith('/') || pathSegments.includes('..')) {
    throw new PackagePayloadError(`invalid package path: ${path}`);
  }
}

function assertValidSize(path: string, size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new PackagePayloadError(`invalid size for package path ${path}`);
  }
}
