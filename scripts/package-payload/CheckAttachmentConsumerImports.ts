import { readFileSync } from 'node:fs';
import ts from 'typescript';
import '../RequireDockerTests.ts';
import attachmentConsumerImports from './AttachmentConsumerImports.ts';

const files = process.argv.slice(2);
if (files.length === 0) throw new Error('Attachment consumer import check requires fixture files');
const program = ts.createProgram(files, { allowJs: true, noResolve: true });
for (const file of files) {
  const failures = attachmentConsumerImports(readFileSync(file, 'utf8'), file);
  if (program.getSyntacticDiagnostics(program.getSourceFile(file)).length !== 0) {
    failures.push('invalid module syntax');
  }
  for (const failure of failures) console.error(`attachment consumer import check: ${file}: ${failure}`);
  if (failures.length !== 0) process.exitCode = 1;
}
