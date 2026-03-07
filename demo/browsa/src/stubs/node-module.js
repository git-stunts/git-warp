// Stub for node:module in browser builds.
function notAvailable() {
  throw new Error('node:module is not available in the browser');
}

export const createRequire = notAvailable;
export default {};
