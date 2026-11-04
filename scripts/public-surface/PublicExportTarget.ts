export default class PublicExportTarget {
  readonly subpath: string;
  readonly target: string;

  constructor(subpath: string, target: string) {
    if (!safeSubpath(subpath) || !safeTarget(target) || !/\.(?:[mc]?js|d\.[mc]?ts)$/u.test(target)) {
      throw new TypeError('Invalid executable public export mapping');
    }
    this.subpath = subpath;
    this.target = target;
    Object.freeze(this);
  }

  declaration(): string {
    return this.target.replace(/(?<!\.d)\.(mjs|cjs|js)$/u, (suffix) => {
      const extensions = new Map([['.js', '.d.ts'], ['.mjs', '.d.mts'], ['.cjs', '.d.cts']]);
      return extensions.get(suffix) ?? suffix;
    });
  }

  isDeclaration(): boolean {
    return /\.d\.[cm]?ts$/u.test(this.target);
  }

  identity(): string {
    return `${this.subpath}\t${this.target}`;
  }
}

export function safeSubpath(path: string): boolean {
  return path === '.' || (path.startsWith('./') && safeSegments(path));
}

export function safeTarget(path: string): boolean {
  return path.startsWith('./') && safeSegments(path);
}

function safeSegments(path: string): boolean {
  return !/[\\*\s]/u.test(path) && [...path].every((character) => character.charCodeAt(0) > 32)
    && !path.slice(2).split('/').some((part) => part === '..' || part === '.');
}
