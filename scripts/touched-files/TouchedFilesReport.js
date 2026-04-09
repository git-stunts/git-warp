function appendBucket(lines, label, emoji, entries, showLineDelta = false) {
  lines.push(`  ${label} ${emoji} (${entries.length})`);
  if (entries.length === 0) {
    lines.push('    (none)');
    lines.push('');
    return;
  }

  const sortedEntries = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  for (const entry of sortedEntries) {
    const renameNote = entry.oldPath === undefined ? '' : ` (from ${entry.oldPath})`;
    const lineDelta = showLineDelta && 'added' in entry
      ? ` (+${entry.added}/-${entry.deleted})`
      : '';
    lines.push(`    ${entry.path}${renameNote}${lineDelta}`);
  }
  lines.push('');
}

function freezeEntries(entries) {
  return Object.freeze(entries.map(entry => Object.freeze({ ...entry })));
}

function isCodePath(path) {
  return path.endsWith('.js') || path.endsWith('.ts');
}

export default class TouchedFilesReport {
  /**
   * @param {{ branch: string, baseRef: string, headRef: string, mergeBase: string }} input
   */
  constructor(input) {
    this.branch = input.branch;
    this.baseRef = input.baseRef;
    this.headRef = input.headRef;
    this.mergeBase = input.mergeBase;
    this.convertedToTs = [];
    this.alreadyTsModified = [];
    this.jsBodyModified = [];
    this.jsImportOnly = [];
    this.otherChangedFiles = [];
  }

  /**
   * @param {{ status: string, path: string, oldPath?: string }} entry
   * @returns {void}
   */
  addConvertedToTs(entry) {
    this.convertedToTs.push(entry);
  }

  /**
   * @param {{ status: string, path: string, oldPath?: string }} entry
   * @returns {void}
   */
  addAlreadyTsModified(entry) {
    this.alreadyTsModified.push(entry);
  }

  /**
   * @param {{ status: string, path: string, oldPath?: string }} entry
   * @param {{ kind: 'import-only' | 'body-modified', added: number, deleted: number }} change
   * @returns {void}
   */
  addJavaScriptChange(entry, change) {
    const jsEntry = { ...entry, added: change.added, deleted: change.deleted };
    if (change.kind === 'import-only') {
      this.jsImportOnly.push(jsEntry);
      return;
    }
    this.jsBodyModified.push(jsEntry);
  }

  /**
   * @param {{ status: string, path: string, oldPath?: string }} entry
   * @returns {void}
   */
  addOtherChangedFile(entry) {
    this.otherChangedFiles.push(entry);
  }

  /**
   * @returns {Array<{ path: string, touch: string }>}
   */
  listCodeTouches() {
    return [
      ...this.convertedToTs.map(entry => ({ path: entry.path, touch: 'converted' })),
      ...this.alreadyTsModified.map(entry => ({ path: entry.path, touch: 'ts' })),
      ...this.jsBodyModified.map(entry => ({ path: entry.path, touch: 'js-body' })),
      ...this.jsImportOnly.map(entry => ({ path: entry.path, touch: 'js-import' })),
    ].filter(entry => isCodePath(entry.path));
  }

  /**
   * @returns {string}
   */
  formatText() {
    const lines = [];
    lines.push(`Touched on ${this.branch} (vs ${this.baseRef}, merge-base ${this.mergeBase.slice(0, 8)}):`);
    lines.push('');
    appendBucket(lines, 'Converted to .ts', '✅', this.convertedToTs);
    appendBucket(lines, 'Already .ts, modified', '✅', this.alreadyTsModified);
    appendBucket(lines, 'Still .js, body modified', '⚠', this.jsBodyModified, true);
    appendBucket(lines, 'Still .js, import-only changes', '🟡', this.jsImportOnly, true);
    appendBucket(lines, 'Other changed files', 'ℹ', this.otherChangedFiles);
    if (lines.at(-1) === '') {
      lines.pop();
    }
    return lines.join('\n');
  }

  /**
   * @returns {{
   *   branch: string,
   *   baseRef: string,
   *   headRef: string,
   *   mergeBase: string,
   *   convertedToTs: ReadonlyArray<{ status: string, path: string, oldPath?: string }>,
   *   alreadyTsModified: ReadonlyArray<{ status: string, path: string, oldPath?: string }>,
   *   jsBodyModified: ReadonlyArray<{ status: string, path: string, oldPath?: string, added: number, deleted: number }>,
   *   jsImportOnly: ReadonlyArray<{ status: string, path: string, oldPath?: string, added: number, deleted: number }>,
   *   otherChangedFiles: ReadonlyArray<{ status: string, path: string, oldPath?: string }>,
   * }}
   */
  toJSON() {
    return {
      branch: this.branch,
      baseRef: this.baseRef,
      headRef: this.headRef,
      mergeBase: this.mergeBase,
      convertedToTs: this.convertedToTs,
      alreadyTsModified: this.alreadyTsModified,
      jsBodyModified: this.jsBodyModified,
      jsImportOnly: this.jsImportOnly,
      otherChangedFiles: this.otherChangedFiles,
    };
  }

  /**
   * @returns {TouchedFilesReport}
   */
  freeze() {
    this.convertedToTs = freezeEntries(this.convertedToTs);
    this.alreadyTsModified = freezeEntries(this.alreadyTsModified);
    this.jsBodyModified = freezeEntries(this.jsBodyModified);
    this.jsImportOnly = freezeEntries(this.jsImportOnly);
    this.otherChangedFiles = freezeEntries(this.otherChangedFiles);
    return Object.freeze(this);
  }
}
