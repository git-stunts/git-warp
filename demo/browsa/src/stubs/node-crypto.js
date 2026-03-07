// Stub for node:crypto in browser builds.
// These are never actually called in the browser code path — they exist
// only to satisfy Rollup's static import analysis.

function notAvailable() {
  throw new Error('node:crypto is not available in the browser');
}

export const createHash = notAvailable;
export const createHmac = notAvailable;
export const timingSafeEqual = notAvailable;
export default {};
