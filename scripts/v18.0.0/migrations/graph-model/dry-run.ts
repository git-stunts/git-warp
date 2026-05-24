#!/usr/bin/env node

import process from 'node:process';

import {
  graphModelMigrationDryRunUsage,
  runGraphModelMigrationDryRunCli,
} from './GraphModelMigrationDryRunCli.ts';

function errorMessage(error: Error | string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return error;
}

runGraphModelMigrationDryRunCli(process.argv.slice(2))
  .then((result) => {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  })
  .catch((error) => {
    const message = error instanceof Error ? errorMessage(error) : 'unexpected dry-run failure';
    process.stderr.write(`${message}\n\n${graphModelMigrationDryRunUsage()}\n`);
    process.exitCode = 1;
  });
