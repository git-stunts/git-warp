import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import ts from 'typescript';
import SurfaceRatchet, { PUBLIC_SURFACE_RATCHET_PATH } from './SurfaceRatchet.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';
import SurfaceRouteChange, { PUBLIC_SURFACE_ROUTE_CHANGES_PATH } from './SurfaceRouteChange.ts';

const GUARD_DIRECTORY = 'scripts/public-surface/';
const GIT_TIMEOUT_MS = 10_000;
const GIT_OUTPUT_BYTES = 1_048_576;

/** Reads the actual branch point; an absent or unreadable basis never grants growth. */
export default class SurfaceRatchetHistory {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
    Object.freeze(this);
  }

  check(base: string): readonly string[] | SurfaceRefusal {
    const current = this.currentRatchet();
    if (current instanceof SurfaceRefusal) return current;
    const commit = this.basis(base);
    if (commit instanceof SurfaceRefusal) return commit;
    return commit === null ? Object.freeze([]) : this.compareAt(commit, current);
  }

  private currentRatchet(): SurfaceRatchet | SurfaceRefusal {
    const text = ts.sys.readFile(resolve(this.root, PUBLIC_SURFACE_RATCHET_PATH));
    return text === undefined ? new SurfaceRefusal('Current public surface ratchet is missing') : SurfaceRatchet.parse(text);
  }

  private compareAt(commit: string, current: SurfaceRatchet): readonly string[] | SurfaceRefusal {
    const previous = this.readAt(commit);
    if (previous instanceof SurfaceRefusal) return previous;
    const accepted = this.acceptedMovesAt(commit);
    if (accepted instanceof SurfaceRefusal) return accepted;
    return this.withoutAcceptedMoves(previous, current, accepted);
  }

  /** A move that the merge-base list does not hold is growth; removing a listed move is not. */
  private withoutAcceptedMoves(
    previous: SurfaceRatchet,
    current: SurfaceRatchet,
    accepted: readonly SurfaceRouteChange[],
  ): readonly string[] | SurfaceRefusal {
    const text = ts.sys.readFile(resolve(this.root, PUBLIC_SURFACE_ROUTE_CHANGES_PATH));
    const listed = text === undefined ? Object.freeze([]) : SurfaceRouteChange.parseAll(text);
    if (listed instanceof SurfaceRefusal) return listed;
    const held = (change: SurfaceRouteChange): boolean => accepted.some((basis) => basis.equals(change));
    const changes = listed.filter(held);
    const unlisted = listed.filter((change) => !held(change))
      .map((change) => `NEW route change ${change.current}\t${change.replaced}`);
    return Object.freeze([...unlisted, ...SurfaceRouteChange.admit(current.additionsSince(previous), { changes, previous, current })]);
  }

  private basis(base: string): string | SurfaceRefusal | null {
    const ready = this.historyReady();
    if (ready instanceof SurfaceRefusal) return ready;
    const branchPoint = this.git('merge-base', '--all', '--', base, 'HEAD');
    if (branchPoint instanceof SurfaceRefusal) return branchPoint;
    const commit = branchPoint.trim();
    if (!/^[a-f0-9]{40,64}$/u.test(commit)) return new SurfaceRefusal('One unambiguous merge base is required');
    return this.guardedAt(commit);
  }

  /** The merge base when it holds the ratchet; null only for the first introduction of the guard. */
  private guardedAt(commit: string): string | SurfaceRefusal | null {
    const listing = this.git('ls-tree', '-r', '--name-only', commit, '--', PUBLIC_SURFACE_RATCHET_PATH, GUARD_DIRECTORY);
    if (listing instanceof SurfaceRefusal) return listing;
    const files = listing.split('\n').filter((line) => line !== '');
    if (files.length === 0) return this.initialIntroduction(commit);
    if (!files.includes(PUBLIC_SURFACE_RATCHET_PATH)) return new SurfaceRefusal('Existing guard has lost its ratchet');
    return commit;
  }

  /** An absent merge-base list accepts no move. */
  private acceptedMovesAt(commit: string): readonly SurfaceRouteChange[] | SurfaceRefusal {
    const listing = this.git('ls-tree', '--name-only', commit, '--', PUBLIC_SURFACE_ROUTE_CHANGES_PATH);
    if (listing instanceof SurfaceRefusal) return listing;
    if (listing.trim() === '') return Object.freeze([]);
    const text = this.git('show', `${commit}:${PUBLIC_SURFACE_ROUTE_CHANGES_PATH}`);
    if (text instanceof SurfaceRefusal) return text;
    const accepted = SurfaceRouteChange.parseAll(text);
    return accepted instanceof SurfaceRefusal ? new SurfaceRefusal(`History: ${accepted.reason}`) : accepted;
  }

  private historyReady(): SurfaceRefusal | null {
    const shallow = this.git('rev-parse', '--is-shallow-repository');
    if (shallow instanceof SurfaceRefusal) return shallow;
    return shallow.trim() === 'false' ? null : new SurfaceRefusal('Complete history is required for the public surface ratchet');
  }

  private initialIntroduction(commit: string): SurfaceRefusal | null {
    const history = this.git('log', '--full-history', '-1', '--format=%H', commit, '--', PUBLIC_SURFACE_RATCHET_PATH, GUARD_DIRECTORY);
    if (history instanceof SurfaceRefusal) return history;
    return history.trim() === '' ? null : new SurfaceRefusal('An earlier guard or inventory prevents ratchet reset');
  }

  private readAt(commit: string): SurfaceRatchet | SurfaceRefusal {
    const text = this.git('show', `${commit}:${PUBLIC_SURFACE_RATCHET_PATH}`);
    return text instanceof SurfaceRefusal ? text : SurfaceRatchet.parse(text);
  }

  private git(command: string, ...arguments_: readonly string[]): string | SurfaceRefusal {
    const result = spawnSync('git', [command, ...arguments_], {
      cwd: this.root, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_OUTPUT_BYTES,
    });
    if (result.status !== 0) return new SurfaceRefusal(`Git history inspection failed: ${command}`);
    return result.stdout;
  }
}
