/**
 * @param {Array<{ status: string, path: string, oldPath?: string }>} changedFiles
 * @returns {Array<{ status: string, path: string, oldPath?: string }>}
 */
export function pairTypeScriptConversions(changedFiles) {
  const deletedJsByTargetTsPath = new Map(
    changedFiles
      .filter(file => file.status === 'D' && file.path.endsWith('.js'))
      .map(file => [`${file.path.slice(0, -3)}.ts`, file]),
  );
  const convertedEntries = [];

  for (const file of changedFiles) {
    if (!file.path.endsWith('.ts') || file.oldPath !== undefined) {
      continue;
    }
    const oldPath = deletedJsByTargetTsPath.get(file.path)?.path;
    if (oldPath !== undefined) {
      convertedEntries.push([file.path, oldPath]);
    }
  }

  const convertedTsPaths = new Map(convertedEntries);
  return changedFiles.flatMap(file => {
    if (file.path.endsWith('.ts') && file.oldPath === undefined) {
      const oldPath = convertedTsPaths.get(file.path);
      if (oldPath !== undefined) {
        return [{ ...file, oldPath }];
      }
    }

    const convertedTargetPath = `${file.path.slice(0, -3)}.ts`;
    if (file.status === 'D' && file.path.endsWith('.js') && convertedTsPaths.has(convertedTargetPath)) {
      return [];
    }
    return [file];
  });
}
