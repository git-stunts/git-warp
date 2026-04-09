import { classifyJavaScriptChange } from './classifyJavaScriptChange.js';
import TouchedFilesReport from './TouchedFilesReport.js';

/**
 * @param {Array<{ status: string, path: string, oldPath?: string }>} changedFiles
 * @param {{ branch: string, baseRef: string, headRef: string, mergeBase: string }} reportContext
 * @param {(path: string, oldPath?: string) => Promise<string>} readPatch
 * @param {(ref: string, path: string) => Promise<string | null>} readFileAtRef
 * @returns {Promise<TouchedFilesReport>}
 */
export async function buildTouchedFilesReport(changedFiles, reportContext, readPatch, readFileAtRef) {
  const report = new TouchedFilesReport(reportContext);

  for (const changedFile of changedFiles) {
    if (changedFile.status === 'D') {
      report.addOtherChangedFile(changedFile);
      continue;
    }

    if (
      changedFile.oldPath !== undefined &&
      changedFile.oldPath.endsWith('.js') &&
      changedFile.path.endsWith('.ts')
    ) {
      report.addConvertedToTs(changedFile);
      continue;
    }

    if (changedFile.path.endsWith('.ts')) {
      report.addAlreadyTsModified(changedFile);
      continue;
    }

    if (!changedFile.path.endsWith('.js')) {
      report.addOtherChangedFile(changedFile);
      continue;
    }

    const patch = await readPatch(changedFile.path, changedFile.oldPath);
    const basePath = changedFile.oldPath ?? changedFile.path;
    const [baseContent, headContent] = await Promise.all([
      readFileAtRef(reportContext.mergeBase, basePath),
      readFileAtRef(reportContext.headRef, changedFile.path),
    ]);
    const change = classifyJavaScriptChange(
      changedFile.status,
      patch,
      baseContent,
      headContent,
    );
    report.addJavaScriptChange(changedFile, change);
  }

  return report.freeze();
}
