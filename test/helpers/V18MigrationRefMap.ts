import {
  readV18MigrationRef,
} from '../../scripts/v18-to-v19/V18MigrationGit.ts';

export async function readV18MigrationRefMap(
  repositoryPath: string,
  refs: readonly string[],
): Promise<Readonly<Record<string, string | null>>> {
  const values: Record<string, string | null> = {};
  for (const refName of refs) {
    values[refName] = await readV18MigrationRef(repositoryPath, refName);
  }
  return Object.freeze(values);
}

export async function readRequiredV18MigrationRefMap(
  repositoryPath: string,
  refs: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const values = await readV18MigrationRefMap(repositoryPath, refs);
  const required: Record<string, string> = {};
  for (const [refName, oid] of Object.entries(values)) {
    if (oid === null) {
      throw new Error(`missing expected ref: ${refName}`);
    }
    required[refName] = oid;
  }
  return Object.freeze(required);
}
