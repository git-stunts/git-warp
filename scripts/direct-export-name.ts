export function directExportName(line: string, kind: 'values' | 'types'): string | null {
  const pattern = kind === 'types'
    ? /^export (?:type|interface) ([A-Za-z0-9_]+)/
    : /^export (?:async )?(?:function|class|const|let|var|enum) ([A-Za-z0-9_]+)/;
  return pattern.exec(line.trimStart())?.[1] ?? null;
}
