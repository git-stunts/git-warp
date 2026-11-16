// Cold open: a fresh Node process opens the Runtime and reads one document's margins.
// Usage: node ColdOpen.ts <repository> <writer> <document-id>
// Prints the complete framed actual-membership transport after Runtime closes.
import '../../scripts/RequireDockerTests.ts';
import process from 'node:process';

import { formatColdOpenResult } from './ColdOpenResultParser.ts';
import { Runtime } from '../../index.ts';
import MarginReader from './MarginReader.ts';
import type { MarginsRead } from './Margins.ts';
import { MARGINS_LANE } from './MarginCorpus.ts';

const [repository, writer, documentId] = process.argv.slice(2);
if (repository === undefined || writer === undefined || documentId === undefined) {
  process.stderr.write('Usage: node ColdOpen.ts <repository> <writer> <document-id>\n');
  process.exit(2);
}
const runtime = await Runtime.open({ at: repository, writer });
let margins: MarginsRead;
try {
  margins = await new MarginReader(await runtime.lane(MARGINS_LANE)).margins(documentId);
} finally {
  await runtime.close();
}
process.stdout.write(formatColdOpenResult(documentId, margins));
