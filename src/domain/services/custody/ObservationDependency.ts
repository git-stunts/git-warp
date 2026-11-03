import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import { isObjectId } from './ObservationObjectId.ts';

/** One content, authority or law object an observation's replay requires. */
export default class ObservationDependency {
  readonly type: 'blob' | 'tree';
  readonly oid: string;

  constructor(type: 'blob' | 'tree', oid: string) {
    if ((type !== 'blob' && type !== 'tree') || !isObjectId(oid)) {
      throw new ObservationCustodyError('Observation dependency needs a blob or tree object id');
    }
    this.type = type;
    this.oid = oid;
    Object.freeze(this);
  }
}
