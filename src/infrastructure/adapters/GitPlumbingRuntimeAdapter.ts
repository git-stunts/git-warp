import GitPlumbingRuntime from '@git-stunts/plumbing';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';

type GitPlumbingRuntimeFactory = {
  readonly createDefault: (options: { readonly cwd: string }) => unknown;
};

const runtimeExport: unknown = GitPlumbingRuntime;

/** Opens the untyped plumbing package behind the typed history port. */
export async function openDefaultGitPlumbing(cwd: string): Promise<GitPlumbing> {
  const factory = requireFactory(runtimeExport);
  const plumbing = await factory.createDefault({ cwd });
  if (!isGitPlumbing(plumbing)) {
    throw new AdapterValidationError(
      '@git-stunts/plumbing returned an incompatible runtime',
    );
  }
  return plumbing;
}

function requireFactory(value: unknown): GitPlumbingRuntimeFactory {
  if (!hasCallableProperty(value, 'createDefault')) {
    throw new AdapterValidationError(
      '@git-stunts/plumbing does not expose createDefault',
    );
  }
  return value;
}

function isGitPlumbing(value: unknown): value is GitPlumbing {
  return hasStringProperty(value, 'emptyTree')
    && hasCallableProperty(value, 'execute')
    && hasCallableProperty(value, 'executeStream');
}

function hasCallableProperty<TName extends string>(
  value: unknown,
  name: TName,
): value is { readonly [TKey in TName]: (...args: unknown[]) => unknown } {
  return isPropertyContainer(value) && typeof value[name] === 'function';
}

function hasStringProperty<TName extends string>(
  value: unknown,
  name: TName,
): value is { readonly [TKey in TName]: string } {
  return isPropertyContainer(value) && typeof value[name] === 'string';
}

function isPropertyContainer(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
