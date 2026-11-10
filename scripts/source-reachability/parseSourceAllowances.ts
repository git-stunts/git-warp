export const UNREACHABLE_SOURCE_ALLOWLIST_PATH = 'policy/unreachable-source-allowlist.txt';
const ALLOWANCE = /^#([1-9][0-9]*)\t(src\/[^\t\r\n]+\.ts)$/u;

/** Parses owned source allowances without treating malformed or duplicate rows as permission. */
export default function parseSourceAllowances(text: string): Readonly<{
  paths: ReadonlySet<string>; rows: ReadonlySet<string>; problems: readonly string[];
}> {
  const paths = new Set<string>();
  const rows = new Set<string>();
  const problems: string[] = [];
  for (const line of text.split('\n').filter((entry) => entry !== '' && !entry.startsWith('# '))) {
    const allowed = ALLOWANCE.exec(line)?.[2];
    if (allowed === undefined) problems.push(`MALFORMED allowance: ${line}`);
    else if (paths.has(allowed)) problems.push(`DUPLICATE allowance ${allowed}`);
    else { paths.add(allowed); rows.add(line); }
  }
  return Object.freeze({ paths, rows, problems: Object.freeze(problems) });
}
