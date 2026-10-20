#!/usr/bin/env node
// usage: ComposeReleaseNotes.ts <repository> <tag> <summary.md> [existing-release.md]
// Writes curated GitHub Release notes for <tag> to stdout from CHANGELOG.md.
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { formatFailure } from '../formatFailure.ts';
import ReleaseNotesComposer, { ReleaseNotesError } from './ReleaseNotesComposer.ts';

function main(argv: readonly string[]): void {
  const [repository, tag, summaryPath, existingPath] = argv;
  if (repository === undefined || tag === undefined || summaryPath === undefined || argv.length > 4) {
    throw new ReleaseNotesError('usage: ComposeReleaseNotes.ts <repository> <tag> <summary.md> [existing-release.md]');
  }
  const notes = new ReleaseNotesComposer({ repository, tag }).compose({
    changelog: readFileSync('CHANGELOG.md', 'utf8'),
    summary: readFileSync(summaryPath, 'utf8'),
    existing: existingPath === undefined ? null : readFileSync(existingPath, 'utf8'),
  });
  process.stdout.write(notes);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${formatFailure(error)}\n`);
  process.exitCode = 1;
}
