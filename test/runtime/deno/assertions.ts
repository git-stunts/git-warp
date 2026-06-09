type Comparable =
  | null
  | boolean
  | number
  | string
  | readonly Comparable[]
  | { readonly [key: string]: Comparable };

type ErrorConstructor = (abstract new (message: string) => Error) & { readonly name: string };

function format(value: Comparable): string {
  return JSON.stringify(value);
}

export function assert(condition: boolean, message = "Assertion failed"): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEquals(actual: Comparable, expected: Comparable, message?: string): void {
  if (format(actual) !== format(expected)) {
    throw new Error(message ?? `Expected ${format(actual)} to equal ${format(expected)}`);
  }
}

export function assertMatch(actual: string, pattern: RegExp, message?: string): void {
  if (!pattern.test(actual)) {
    throw new Error(message ?? `Expected ${actual} to match ${pattern.source}`);
  }
}

export async function assertRejects(
  action: () => Promise<Comparable>,
  errorClass: ErrorConstructor,
  messageIncludes?: string,
): Promise<Error> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof Error)) {
      throw new Error("Expected rejection to throw an Error instance");
    }
    const expectedName = errorClass.name;
    const actualName = error.name;
    if (!(error instanceof errorClass)) {
      throw new Error(`Expected rejection to be ${expectedName}, got ${actualName}`);
    }
    if (messageIncludes !== undefined && !error.message.includes(messageIncludes)) {
      throw new Error(`Expected rejection message to include ${messageIncludes}`);
    }
    return error;
  }
  throw new Error("Expected promise to reject");
}
