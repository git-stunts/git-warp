import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOOSE_FANOUT = /^[0-9a-f]{2}$/u;

function git(path: string, args: readonly string[], input?: string): string {
  return execFileSync('git', [...args], { cwd: path, encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 }).trim();
}

function lines(text: string): string[] {
  return text === '' ? [] : text.split('\n');
}

/** What `git count-objects -v` reports, in objects and KiB. */
export type ObjectCounts = {
  readonly loose: number;
  readonly looseKiB: number;
  readonly packs: number;
  readonly packed: number;
  readonly packKiB: number;
};

/** Read-only counts of one repository's objects and refs, for cost witnesses. */
export default class RepositoryObjectCensus {
  readonly #path: string;
  readonly #objects: string;

  constructor(path: string) {
    this.#path = path;
    this.#objects = git(path, ['rev-parse', '--path-format=absolute', '--git-path', 'objects']);
    Object.freeze(this);
  }

  counts(): ObjectCounts {
    const fields = new Map(lines(git(this.#path, ['count-objects', '-v'])).map((line) => {
      const [name = '', value = '0'] = line.split(': ');
      return [name, Number(value)];
    }));
    return {
      loose: fields.get('count') ?? 0,
      looseKiB: fields.get('size') ?? 0,
      packs: fields.get('packs') ?? 0,
      packed: fields.get('in-pack') ?? 0,
      packKiB: fields.get('size-pack') ?? 0,
    };
  }

  /** Every loose object id. */
  loose(): Set<string> {
    const found = new Set<string>();
    for (const fanout of readdirSync(this.#objects).filter((name) => LOOSE_FANOUT.test(name))) {
      for (const rest of readdirSync(join(this.#objects, fanout))) {
        found.add(`${fanout}${rest}`);
      }
    }
    return found;
  }

  /** The type of each object, by `cat-file --batch-check`. */
  types(oids: Iterable<string>): Map<string, string> {
    const listed = [...oids];
    if (listed.length === 0) {
      return new Map();
    }
    const checked = lines(git(this.#path, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], `${listed.join('\n')}\n`));
    return new Map(checked.map((line) => {
      const [oid = '', type = ''] = line.split(' ');
      return [oid, type];
    }));
  }

  /** Objects reachable from the refs under `prefix`, or from every ref when it is omitted. */
  reachable(prefix?: string): Set<string> {
    const refs = lines(git(this.#path, ['for-each-ref', '--format=%(objectname)', ...(prefix === undefined ? [] : [prefix])]));
    if (refs.length === 0) {
      return new Set();
    }
    return new Set(lines(git(this.#path, ['rev-list', '--objects', '--stdin'], `${refs.join('\n')}\n`)).map((line) => line.split(' ')[0] ?? ''));
  }

  /** Ref counts by their first `depth` path components. */
  refFamilies(depth: number): Map<string, number> {
    const families = new Map<string, number>();
    for (const ref of lines(git(this.#path, ['for-each-ref', '--format=%(refname)']))) {
      const family = ref.split('/').slice(0, depth).join('/');
      families.set(family, (families.get(family) ?? 0) + 1);
    }
    return families;
  }

  /** A one-line description of an object, for attribution reports. */
  describe(oid: string, type: string): string {
    const short = oid.slice(0, 10);
    if (type === 'commit') {
      const raw = git(this.#path, ['cat-file', 'commit', oid]);
      const parents = raw.split('\n').filter((line) => line.startsWith('parent ')).length;
      const tree = (raw.split('\n')[0] ?? '').slice('tree '.length);
      const names = lines(git(this.#path, ['ls-tree', '-r', '--name-only', tree])).slice(0, 4).join(', ');
      return `${short} commit parents=${parents} ${(raw.split('\n\n')[1] ?? '').split('\n')[0] ?? ''} tree{${names}}`;
    }
    if (type === 'tree') {
      const names = lines(git(this.#path, ['ls-tree', oid])).map((line) => line.split('\t')[1] ?? '');
      return `${short} tree [${names.slice(0, 6).join(', ')}${names.length > 6 ? `, +${names.length - 6}` : ''}]`;
    }
    const size = git(this.#path, ['cat-file', '-s', oid]);
    const head = execFileSync('git', ['cat-file', 'blob', oid], { cwd: this.#path }).subarray(0, 48).toString('latin1').replace(/[^\x20-\x7e]/gu, '.');
    return `${short} ${type} ${size}B ${head}`;
  }

  /** Objects that no ref reaches, by `git fsck --unreachable --no-reflogs`. */
  unreachableCount(): number {
    return lines(git(this.#path, ['fsck', '--unreachable', '--no-reflogs', '--no-progress'])).filter((line) => line.startsWith('unreachable ')).length;
  }

  refCount(): number {
    return lines(git(this.#path, ['for-each-ref', '--format=%(refname)'])).length;
  }

  /** True when Git wrote a gc.log or a pack this census did not make. */
  autoGcEvidence(): boolean {
    return existsSync(join(this.#path, '.git', 'gc.log')) || this.counts().packs > 0;
  }
}
