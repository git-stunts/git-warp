// Stub for node:stream in browser builds.
function notAvailable() {
  throw new Error('node:stream is not available in the browser');
}

export class Readable {
  static from() { return notAvailable(); }
}
export default { Readable };
