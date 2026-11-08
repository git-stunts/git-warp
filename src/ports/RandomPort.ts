/**
 * Port for entropy.
 *
 * Domain code never reads ambient host randomness. Anything that mints
 * identity or samples at random receives this port, so tests and replays
 * can inject a deterministic source. Adapters supply host CSPRNG bytes.
 */
export default interface RandomPort {
  /** Returns `length` fresh random bytes. */
  randomBytes(length: number): Uint8Array;
}
