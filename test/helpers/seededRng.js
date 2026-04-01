/**
 * Seeded pseudo-random number generator (Mulberry32).
 *
 * Deterministic: same seed → same sequence. Print seed on failure
 * for reproducibility.
 *
 * @module test/helpers/seededRng
 */

/**
 * Creates a seeded PRNG (Mulberry32).
 *
 * @param {number} seed - 32-bit integer seed
 * @returns {{ next: () => number, nextInt: (min: number, max: number) => number, pick: <T>(arr: T[]) => T, shuffle: <T>(arr: T[]) => T[], seed: number }}
 */
export function createRng(seed) {
  let state = seed | 0;

  function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @param {number} min @param {number} max */
  function nextInt(min, max) {
    return min + Math.floor(next() * (max - min));
  }

  /** @template T @param {T[]} arr @returns {T} */
  function pick(arr) {
    return /** @type {T} */ (arr[nextInt(0, arr.length)]);
  }

  /** @template T @param {T[]} arr */
  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = nextInt(0, i + 1);
      const tmp = /** @type {T} */ (copy[i]);
      copy[i] = /** @type {T} */ (copy[j]);
      copy[j] = tmp;
    }
    return copy;
  }

  return { next, nextInt, pick, shuffle, seed };
}
