export class MigrationArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationArgumentError';
  }
}

export function resolveMigrationScanDir(args: readonly string[], defaultDir: string): string {
  const dirIdx = args.indexOf('--dir');
  if (dirIdx === -1) {
    return defaultDir;
  }

  const scanDir = args[dirIdx + 1];
  if (scanDir === undefined) {
    throw new MigrationArgumentError('--dir requires a path argument');
  }
  return scanDir;
}
