import { ExpiringSet } from '@git-stunts/git-cas';
import type { ExpiringSetAddResult, ExpiringSetSweepResult } from '@git-stunts/git-cas';
import type CallLatch from './CallLatch.ts';

/** Pauses a real expiring-set sweep without replacing storage admission. */
export default class SyncReplaySweepGate implements ExpiringSet {
  readonly sweeps: ExpiringSetSweepResult[] = [];
  readonly admissions: ExpiringSetAddResult[] = [];
  private readonly set: ExpiringSet;
  private readonly latch: CallLatch;

  constructor(set: ExpiringSet, latch: CallLatch) {
    if (!(set instanceof ExpiringSet)) {
      throw new Error('The replay sweep witness requires a real expiring set');
    }
    this.set = set;
    this.latch = latch;
  }

  get ref(): string { return this.set.ref; }

  contains(key: string): ReturnType<ExpiringSet['contains']> {
    return this.set.contains(key);
  }

  async addIfAbsent(key: string, options: Parameters<ExpiringSet['addIfAbsent']>[1]): Promise<ExpiringSetAddResult> {
    const result = await this.set.addIfAbsent(key, options);
    this.admissions.push(result);
    return result;
  }

  async sweep(): Promise<ExpiringSetSweepResult> {
    const result = await this.latch.through(async () => await this.set.sweep());
    this.sweeps.push(result);
    return result;
  }

  inspect(options?: Parameters<ExpiringSet['inspect']>[0]): ReturnType<ExpiringSet['inspect']> {
    return this.set.inspect(options);
  }

  doctor(): ReturnType<ExpiringSet['doctor']> {
    return this.set.doctor();
  }
}
