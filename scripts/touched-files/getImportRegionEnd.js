/**
 * @param {string | null} content
 * @returns {number}
 */
export function getImportRegionEnd(content) {
  if (content === null) {
    return 0;
  }

  const lines = content.split('\n');
  let end = 0;
  let inImportStatement = false;
  let inBlockComment = false;

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = (rawLine ?? '').trim();

    if (index === 0 && trimmed.startsWith('#!')) {
      end = lineNumber;
      continue;
    }

    if (inImportStatement) {
      end = lineNumber;
      if (trimmed.endsWith(';')) {
        inImportStatement = false;
      }
      continue;
    }

    if (inBlockComment) {
      end = lineNumber;
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      end = lineNumber;
      continue;
    }

    if (trimmed.startsWith('/*')) {
      end = lineNumber;
      if (!trimmed.includes('*/')) {
        inBlockComment = true;
      }
      continue;
    }

    if (/^import\b/.test(trimmed) || /^export\s+(?:\*|\{)/.test(trimmed)) {
      end = lineNumber;
      if (!trimmed.endsWith(';')) {
        inImportStatement = true;
      }
      continue;
    }

    break;
  }

  return end;
}
