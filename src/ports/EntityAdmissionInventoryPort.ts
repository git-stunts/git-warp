import type RetainedEntityAdmission from '../domain/entity/RetainedEntityAdmission.ts';
import type EntityAdmissionInventoryBasis from '../domain/entity/EntityAdmissionInventoryBasis.ts';
import type WarpStream from '../domain/stream/WarpStream.ts';

/** Storage-neutral source of retained entity births at one exact coordinate. */
export default abstract class EntityAdmissionInventoryPort {
  abstract scan(
    _basis: EntityAdmissionInventoryBasis,
  ): WarpStream<RetainedEntityAdmission>;
}
