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
    const text = ts.sys.readFile(resolve(this.root, PUBLIC_SURFACE_RATCHET_PATH));
    if (text === undefined) return new SurfaceRefusal('Current public surface ratchet is missing');
    const current = SurfaceRatchet.parse(text);
    if (current instanceof SurfaceRefusal) return current;
    const previous = this.previous(base);
    if (previous instanceof SurfaceRefusal) return previous;
    if (previous === null) return Object.freeze([]);
    return this.withoutListedMoves(previous, current);
  }

  private withoutListedMoves(previous: SurfaceRatchet, current: SurfaceRatchet): readonly string[] | SurfaceRefusal {
    const text = ts.sys.readFile(resolve(this.root, PUBLIC_SURFACE_ROUTE_CHANGES_PATH));
    const changes = text === undefined ? Object.freeze([]) : SurfaceRouteChange.parseAll(text);
    if (changes instanceof SurfaceRefusal) return changes;
    return SurfaceRouteChange.admit(current.additionsSince(previous), { changes, previous, current });
  }

  private previous(base: string): SurfaceRatchet | SurfaceRefusal | null {
    const ready = this.historyReady();
    if (ready instanceof SurfaceRefusal) return ready;
    const branchPoint = this.git('merge-base', '--all', '--', base, 'HEAD');
    if (branchPoint instanceof SurfaceRefusal) return branchPoint;
    const commit = branchPoint.trim();
    if (!/^[a-f0-9]{40,64}$/u.test(commit)) return new SurfaceRefusal('One unambiguous merge base is required');
    return this.at(commit);
  }

  private at(commit: string): SurfaceRatchet | SurfaceRefusal | null {
    const listing = this.git('ls-tree', '-r', '--name-only', commit, '--', PUBLIC_SURFACE_RATCHET_PATH, GUARD_DIRECTORY);
    if (listing instanceof SurfaceRefusal) return listing;
    const files = listing.split('\n').filter((line) => line !== '');
    if (files.length === 0) return this.initialIntroduction(commit);
    if (!files.includes(PUBLIC_SURFACE_RATCHET_PATH)) return new SurfaceRefusal('Existing guard has lost its ratchet');
    return this.readAt(commit);
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

