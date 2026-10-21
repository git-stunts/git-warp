import EdgeRemove from '../../src/domain/types/ops/EdgeRemove.ts';
import NodeRemove from '../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import type V21StrandView from './V21StrandView.ts';
import type { V21AddSite, V21Origin, V21ViewPatch } from './V21StrandView.ts';

/** `lane`, or `strand:<name>` for damage only visible inside one strand. */
export type V21DamageScope = string;

export type V21DuplicateDot = Readonly<{
  scope: V21DamageScope;
  identity: string;
  sites: readonly Readonly<{ sha: string; target: string; origin: string }>[];
}>;

export type V21CollateralDeletion = Readonly<{
  scope: V21DamageScope;
  removeSha: string;
  target: string;
  observedDot: string;
  collateralTargets: readonly string[];
}>;

export type V21Damage = Readonly<{
  duplicateDots: readonly V21DuplicateDot[];
  collateralDeletions: readonly V21CollateralDeletion[];
}>;

/**
 * Finds damage the migration reports but never repairs (#1015, #1022):
 * add sites that share one identity, and removes whose observed dot also
 * hides objects other than the one they named.
 */
export function scanV21Damage(
  scope: V21DamageScope,
  view: V21StrandView,
  options: Readonly<{
    /** The v21 identity an add site keeps after migration. */
    identityOf: (site: V21AddSite) => string;
    /** Only removes in these patches are attributed to this scope. */
    removesFrom: (entry: V21ViewPatch) => boolean;
  }>,
): V21Damage {
  return Object.freeze({
    duplicateDots: duplicates(scope, view, options.identityOf),
    collateralDeletions: view.patches
      .filter(options.removesFrom)
      .flatMap((entry) => entry.patch.ops.flatMap((op) => collateral(scope, view, entry.sha, op))),
  });
}

function duplicates(scope: V21DamageScope, view: V21StrandView, identityOf: (site: V21AddSite) => string): V21DuplicateDot[] {
  const byIdentity = new Map<string, V21AddSite[]>();
  for (const sites of view.duplicateDots().values()) {
    for (const site of sites) {
      const identity = identityOf(site);
      byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), site]);
    }
  }
  return [...byIdentity]
    .filter(([, sites]) => sites.length > 1)
    .sort(([left], [right]) => compare(left, right))
    .map(([identity, sites]) => Object.freeze({
      scope,
      identity,
      sites: sites.map((site) => Object.freeze({ sha: site.sha, target: site.target, origin: describeOrigin(site.origin) })),
    }));
}

function collateral(scope: V21DamageScope, view: V21StrandView, removeSha: string, op: PatchOp): V21CollateralDeletion[] {
  const target = removeTarget(op);
  if (target === null) { return []; }
  const observed = op instanceof NodeRemove || op instanceof EdgeRemove ? op.observedDots : [];
  return observed.flatMap((observedDot) => {
    const others = [...new Set(view.sites(observedDot).map((site) => site.target))].filter((other) => other !== target).sort();
    return others.length === 0
      ? []
      : [Object.freeze({ scope, removeSha, target, observedDot, collateralTargets: others })];
  });
}

function removeTarget(op: PatchOp): string | null {
  if (op instanceof NodeRemove) { return op.node; }
  if (op instanceof EdgeRemove) { return `${op.from}\0${op.to}\0${op.label}`; }
  return null;
}

export function describeOrigin(origin: V21Origin): string {
  return origin.kind === 'lane' ? `lane:${origin.writerId}` : `strand:${origin.name}`;
}

function compare(left: string, right: string): number {
  if (left < right) { return -1; }
  return left > right ? 1 : 0;
}
