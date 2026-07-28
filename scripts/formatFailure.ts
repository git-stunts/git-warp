/** Format nested failures without losing AggregateError members or causes. */
export function formatFailure(error: unknown, seen = new Set<unknown>()): string {
  if (seen.has(error)) {
    return '[circular failure]';
  }
  seen.add(error);
  const message = error instanceof Error ? error.message : String(error);
  const nested: string[] = [];
  if (error instanceof AggregateError) {
    error.errors.forEach((entry, index) => {
      nested.push(`failure ${String(index + 1)}: ${formatFailure(entry, seen)}`);
    });
  }
  if (error instanceof Error && error.cause !== undefined) {
    nested.push(`cause: ${formatFailure(error.cause, seen)}`);
  }
  return nested.length === 0 ? message : `${message}\n${nested.join('\n')}`;
}
