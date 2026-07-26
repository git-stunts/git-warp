import type Reading from './Reading.ts';
import type ReadingResult from './ReadingResult.ts';
import type Tick from './Tick.ts';

export type DraftReadingTarget = Readonly<{
  readonly read: (reading: Reading) => Promise<ReadingResult>;
  readonly tick: Tick;
}>;
