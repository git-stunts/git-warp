/**
 * Why a cone basis could not advance. Obstructions are expected outcomes,
 * returned rather than thrown, and each names the repair that clears it.
 */
export default abstract class ConeObstruction {
  /** Stable machine-readable reason. */
  abstract readonly code: string;

  /** One-sentence human explanation, including the repair. */
  abstract describe(): string;
}
