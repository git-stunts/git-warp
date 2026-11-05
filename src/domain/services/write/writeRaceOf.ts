import type { Plurality } from '../../api/Plurality.ts';
import RegisterPlurality from '../../api/RegisterPlurality.ts';
import WriteRace from '../../api/WriteRace.ts';

/** What a receipt says of one plurality: who raced, without the values. */
export function writeRaceOf(plurality: Plurality): WriteRace {
  const { kind, overflow, causality } = plurality;
  return new WriteRace(plurality instanceof RegisterPlurality
    ? { kind, overflow, causality, subject: plurality.subject, key: plurality.key, writers: [...new Set(plurality.siblings.map(({ writer }) => writer))] }
    : { kind, overflow, causality, subject: lifecycleSubject(plurality.element), key: null, writers: plurality.removedBy });
}

function lifecycleSubject(element: Extract<Plurality, { kind: 'lifecycle' }>['element']): string {
  return element.kind === 'node' ? element.subject : `${element.from}>${element.to}:${element.label}`;
}
