import type { GitPlumbing } from './gitErrorClassification.ts';

const MISSING_SUFFIX = ' missing';

/** Each object's type, or its missing line, from one git process however many are asked about. */
export async function objectTypes(plumbing: Pick<GitPlumbing, 'execute'>, oids: readonly string[]): Promise<readonly string[]> {
  const input = oids.map((oid) => `${oid}\n`).join('');
  const output = await plumbing.execute({ args: ['cat-file', '--batch-check=%(objecttype)'], input });
  return output.trim().split('\n');
}

export function isMissingObject(line: string): boolean {
  return line.endsWith(MISSING_SUFFIX);
}
