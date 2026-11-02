import SurfaceAllowance from './SurfaceAllowance.ts';
import type SurfaceFinding from './SurfaceFinding.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';

export const PUBLIC_SURFACE_RATCHET_PATH = 'policy/public-surface-ratchet.txt';

/** An exact inventory: additions and obsolete allowances are both failures. */
export default class SurfaceRatchet {
  readonly entries: readonly SurfaceAllowance[];

  private constructor(entries: readonly SurfaceAllowance[]) {
    this.entries = Object.freeze([...entries]);
    Object.freeze(this);
  }

  static parse(text: string): SurfaceRatchet | SurfaceRefusal {
    const entries: SurfaceAllowance[] = [];
    const lines = text.split('\n').filter((line) => line !== '' && !line.startsWith('#'));
    for (const line of lines) {
      const allowance = SurfaceAllowance.parse(line);
      if (allowance instanceof SurfaceRefusal) return allowance;
      entries.push(allowance);
    }
    const keys = new Set(entries.map((entry) => entry.key));
    if (keys.size !== entries.length) return new SurfaceRefusal('Duplicate public surface allowance');
    return new SurfaceRatchet(entries);
  }

  compare(findings: readonly SurfaceFinding[]): readonly string[] {
    const actual = new Set(findings.map((item) => item.key));
    const allowed = new Set(this.entries.map((entry) => entry.key));
    return Object.freeze([
      ...findings.filter((item) => !allowed.has(item.key)).map((item) => `NEW ${item.describe()}`),
      ...this.entries.filter((entry) => !actual.has(entry.key)).map((entry) => `STALE ${entry.line()}`),
    ]);
  }

  additionsSince(previous: SurfaceRatchet): readonly string[] {
    const admitted = new Set(previous.entries.map((entry) => entry.line()));
    return Object.freeze(this.entries.filter((entry) => !admitted.has(entry.line())).map((entry) => entry.line()));
  }
}
