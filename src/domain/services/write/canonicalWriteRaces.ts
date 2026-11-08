import WriteRace from '../../api/WriteRace.ts';
import { compareStrings } from '../../utils/StringComparison.ts';

/**
 * The one order a write's races are saved, bound and reported in, so a receipt core
 * rebuilt from its record is byte-identical to the original. Each race names its
 * writers once, sorted.
 */
export function canonicalWriteRaces(races: readonly WriteRace[]): readonly WriteRace[] {
  return Object.freeze(races.map(canonicalRace).sort(compareRaces));
}

function canonicalRace(race: WriteRace): WriteRace {
  const { kind, subject, key, overflow, causality } = race;
  return new WriteRace({ kind, subject, key, overflow, causality, writers: [...new Set(race.writers)].sort(compareStrings) });
}

const WRITER_SEPARATOR = '\u0000';

/** Each field in turn, most significant first; the first that differs decides. */
const RACE_ORDER: ReadonlyArray<(left: WriteRace, right: WriteRace) => number> = Object.freeze([
  (left, right) => compareStrings(left.kind, right.kind),
  (left, right) => compareStrings(left.subject, right.subject),
  (left, right) => compareStrings(left.key ?? '', right.key ?? ''),
  (left, right) => compareWriters(left.writers, right.writers),
  (left, right) => left.overflow - right.overflow,
  (left, right) => compareStrings(left.causality, right.causality),
]);

function compareRaces(left: WriteRace, right: WriteRace): number {
  for (const compare of RACE_ORDER) {
    const order = compare(left, right);
    if (order !== 0) {
      return order;
    }
  }
  return 0;
}

/** Writer ids are Git ref segments, which never hold NUL, so this compares them in list order. */
function compareWriters(left: readonly string[], right: readonly string[]): number {
  return compareStrings(left.join(WRITER_SEPARATOR), right.join(WRITER_SEPARATOR));
}
