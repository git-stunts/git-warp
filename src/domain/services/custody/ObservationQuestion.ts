import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';

/** The versioned question an observation asked. An intent's premise is a question too. */
export default class ObservationQuestion {
  readonly name: string;
  readonly version: number;

  constructor(name: string, version: number) {
    if (typeof name !== 'string' || name.length === 0 || !Number.isSafeInteger(version) || version < 1) {
      throw new ObservationCustodyError('Observation question needs a name and a positive version');
    }
    this.name = name;
    this.version = version;
    Object.freeze(this);
  }
}
