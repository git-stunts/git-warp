import type SurfaceRatchet from './SurfaceRatchet.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';

export const PUBLIC_SURFACE_ROUTE_CHANGES_PATH = 'policy/public-surface-route-changes.txt';

/** One allowance whose recorded route moved: same subpath, export and rule; the old row must disappear. */
export default class SurfaceRouteChange {
  readonly current: string;
  readonly replaced: string;

  private constructor(current: string, replaced: string) {
    this.current = current;
    this.replaced = replaced;
    Object.freeze(this);
  }

  /** Reads `<new key><TAB><old key>` lines; `#` lines are comments. */
  static parseAll(text: string): readonly SurfaceRouteChange[] | SurfaceRefusal {
    const changes: SurfaceRouteChange[] = [];
    for (const line of text.split('\n').filter((entry) => entry !== '' && !entry.startsWith('#'))) {
      const change = SurfaceRouteChange.parse(line);
      if (change instanceof SurfaceRefusal) return change;
      changes.push(change);
    }
    const unique = (keys: readonly string[]): boolean => new Set(keys).size === keys.length;
    if (!unique(changes.map((change) => change.replaced)) || !unique(changes.map((change) => change.current))) {
      return new SurfaceRefusal('Duplicate public surface route change');
    }
    return Object.freeze(changes);
  }

  /** True when both lines name the same move; only a move that the merge base listed may be admitted. */
  equals(other: SurfaceRouteChange): boolean {
    return this.current === other.current && this.replaced === other.replaced;
  }

  /** Drops additions that are listed moves of a row the base held, under the same owner, and the candidate dropped. */
  static admit(additions: readonly string[], ratchets: Readonly<{
    readonly changes: readonly SurfaceRouteChange[];
    readonly previous: SurfaceRatchet;
    readonly current: SurfaceRatchet;
  }>): readonly string[] {
    const before = new Map(ratchets.previous.entries.map((entry) => [entry.key, entry.owner]));
    const owners = new Map(ratchets.current.entries.map((entry) => [entry.key, entry.owner]));
    const moved = new Set(ratchets.changes
      .filter((change) => !owners.has(change.replaced) && before.get(change.replaced) === owners.get(change.current))
      .map((change) => change.current));
    return Object.freeze(additions.filter((line) => !moved.has(line.slice(line.indexOf('\t') + 1))));
  }

  private static parse(line: string): SurfaceRouteChange | SurfaceRefusal {
    const match = /^([^\t\r\n]+)\t([^\t\r\n]+)$/u.exec(line);
    if (match === null) return new SurfaceRefusal('Malformed public surface route change');
    const current = String(match[1]);
    const replaced = String(match[2]);
    return sameCapability(current, replaced)
      ? new SurfaceRouteChange(current, replaced)
      : new SurfaceRefusal('A route change must keep its subpath, export and rule');
  }
}

function sameCapability(current: string, replaced: string): boolean {
  const kept = identity(current);
  return current !== replaced && kept !== null && kept === identity(replaced);
}

/** Subpath, export and rule; the route is the only field a change may alter. */
function identity(key: string): string | null {
  const fields = key.split(' ');
  if (fields.length < 4) return null;
  return [fields[0], fields[1], ...fields.slice(3)].join(' ');
}
