#!/usr/bin/env node

import process from 'node:process';

import {
  graphModelMigrationCommandUsage,
  runGraphModelMigrationCommandCli,
} from './GraphModelMigrationCommandCli.ts';

function errorMessage(error: Error | string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return error;
}

runGraphModelMigrationCommandCli(process.argv.slice(2))
  .then((result) => {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  })
  .catch((error) => {
    const message = error instanceof Error ? errorMessage(error) : 'unexpected migration command failure';
    process.stderr.write(`${message}\n\n${graphModelMigrationCommandUsage()}\n`);
    process.exitCode = 1;
  });
