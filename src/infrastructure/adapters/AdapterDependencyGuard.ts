import WarpError from '../../domain/errors/WarpError.ts';

/** Fails closed when a required adapter dependency is absent at runtime. */
export function requireAdapterDependency(value: unknown, name: string): void {
  if (value === null || value === undefined) {
    throw new WarpError(`Adapter requires ${name}`, 'E_INVALID_DEPENDENCY');
  }
}
