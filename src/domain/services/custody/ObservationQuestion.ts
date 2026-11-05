import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import { isObservationName } from './observationName.ts';

/** The versioned question an observation asked. An intent's premise is a question too. */
export default class ObservationQuestion {
  readonly name: string;
  readonly version: number;

  constructor(name: string, version: number) {
    if (!isObservationName(name) || !Number.isSafeInteger(version) || version < 1) {
      throw new ObservationCustodyError('Observation question needs a name and a positive version');
    }
    this.name = name;
    this.version = version;
    Object.freeze(this);
  }
}
