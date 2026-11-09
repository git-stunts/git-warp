import process from 'node:process';

import { Margins, MarginsUnavailable } from './Margins.ts';
import type WitnessSample from './WitnessSample.ts';

/** Writes complete framed sample records before any trace lifecycle cleanup. */
export default class WitnessReport {
  readonly #scale: number;
  readonly #samples: WitnessSample[] = [];

  constructor(scale: number) {
    this.#scale = scale;
  }

  get samples(): readonly WitnessSample[] {
    return Object.freeze([...this.#samples]);
  }

  async retain(sample: WitnessSample): Promise<void> {
    const sequence = String(sample.sequence);
    const rows = [[
      'sample', String(this.#scale), sequence, sample.phase, sample.operation,
      sample.documentId, sample.subjectId, sample.count === null ? '-' : String(sample.count.total),
      sample.outcome.status, sample.outcome.detail,
    ].map(encodeURIComponent).join('\t')];
    for (const file of sample.count?.files ?? []) {
      rows.push(['trace', sequence, file].map(encodeURIComponent).join('\t'));
    }
    const { membership } = sample.outcome;
    if (membership instanceof Margins) {
      for (const [thread, comments] of membership.threads) {
        rows.push(['membership', sequence, membership.documentId, thread, ...comments].map(encodeURIComponent).join('\t'));
      }
      rows.push(['membership-end', sequence, membership.documentId, String(membership.threads.size)].join('\t'));
    } else if (membership instanceof MarginsUnavailable) {
      rows.push(['read-incomplete', sequence, membership.observer, membership.status, membership.reason].map(encodeURIComponent).join('\t'));
    }
    rows.push(['sample-end', sequence].join('\t'));
    const chunk = rows.join('\n') + '\n';
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(chunk, (error) => error === null || error === undefined ? resolve() : reject(error));
    });
    this.#samples.push(sample);
  }
}
