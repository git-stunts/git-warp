/**
 * A unit-test stand-in for an instance of `type`: an object on its prototype, so `instanceof`
 * holds, carrying only `methods`. Calling a method it does not carry reaches the real one,
 * which fails on the missing private state, so an unexpected call cannot pass silently.
 */
export function prototypeStub<T extends object>(type: abstract new (...args: never[]) => T, methods: Partial<T>): T {
  const stub: T = Object.create(type.prototype);
  return Object.assign(stub, methods);
}
