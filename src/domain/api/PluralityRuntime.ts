import WarpError from '../errors/WarpError.ts';
import LifecyclePlurality from './LifecyclePlurality.ts';
import type { Plurality } from './Plurality.ts';
import RegisterPlurality from './RegisterPlurality.ts';

export type { Plurality } from './Plurality.ts';

/** Copies a plurality list a Reading or Receipt carries, refusing anything but runtime plurality values. */
export function freezePlurality(plurality: readonly Plurality[]): readonly Plurality[] {
  const copied: Plurality[] = [];
  for (const entry of plurality) {
    if (!(entry instanceof RegisterPlurality) && !(entry instanceof LifecyclePlurality)) {
      throw new WarpError('Plurality entries must be register or lifecycle pluralities', 'E_PLURALITY');
    }
    copied.push(entry);
  }
  return Object.freeze(copied);
}
