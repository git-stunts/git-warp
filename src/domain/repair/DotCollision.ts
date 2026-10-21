import WarpError from '../errors/WarpError.ts';

/** One add that carries a shared dot: the commit that added it and what it added. */
export type DotCollisionSite = Readonly<{ commit: string; target: string }>;

/**
 * One dot that several adds share (#1022). `scope` is `lane`, or the strand id
 * whose view alone shows the collision. A remove that observes the dot hides
 * every member, not only the one it names.
 */
export default class DotCollision {
  readonly scope: string;
  readonly dot: string;
  readonly sites: readonly DotCollisionSite[];

  constructor(options: Readonly<{ scope: string; dot: string; sites: readonly DotCollisionSite[] }>) {
    if (options.scope.length === 0 || options.dot.length === 0 || options.sites.length < 2) {
      throw new WarpError('A dot collision needs a scope, a dot and at least two add sites', 'E_DOT_COLLISION_INVALID', {
        context: { scope: options.scope, dot: options.dot },
      });
    }
    this.scope = options.scope;
    this.dot = options.dot;
    this.sites = Object.freeze(options.sites.map((site) => Object.freeze({ ...site })));
    Object.freeze(this);
  }

  /** The distinct objects the shared dot was added to, sorted. */
  get members(): readonly string[] {
    return [...new Set(this.sites.map((site) => site.target))].sort();
  }
}
