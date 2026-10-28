import type ConeBasis from './ConeBasis.ts';
import type ConeObstruction from './ConeObstruction.ts';

/** What advancing a cone basis did. Subclasses carry the evidence. */
export default abstract class ConeIngestOutcome {
  /** The basis the lane holds after this outcome, or the obstruction that stopped it. */
  abstract settled(): ConeBasis | ConeObstruction;
}
