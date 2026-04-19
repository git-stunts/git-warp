import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

type Constructor<TArgs extends readonly unknown[], TResult> = new (...args: TArgs) => TResult;
type GitCasModuleNamespace = Record<string, unknown>;

function isConstructor<TArgs extends readonly unknown[], TResult>(
  value: unknown,
): value is Constructor<TArgs, TResult> {
  return typeof value === 'function';
}

function requireConstructor<TArgs extends readonly unknown[], TResult>(
  moduleNamespace: GitCasModuleNamespace,
  exportName: string,
): Constructor<TArgs, TResult> {
  const candidate = moduleNamespace[exportName];
  if (!isConstructor<TArgs, TResult>(candidate)) {
    throw new AdapterValidationError(
      `@git-stunts/git-cas export "${exportName}" is missing or not a constructor`,
    );
  }
  return candidate;
}

/**
 * Loads the git-cas constructors behind one validated adapter boundary.
 *
 * Several adapters need the default `ContentAddressableStore` export plus the
 * `CborCodec` constructor. Centralizing the lookup avoids repeating ad hoc
 * dynamic-import casts across the adapter layer.
 */
export async function loadGitCasConstructors<TStoreOptions, TStore, TCodec>(): Promise<{
  ContentAddressableStore: Constructor<[TStoreOptions], TStore>;
  CborCodecCtor: Constructor<[], TCodec>;
}> {
  const moduleNamespace: GitCasModuleNamespace = await import(
    /* webpackIgnore: true */ '@git-stunts/git-cas'
  );
  return {
    ContentAddressableStore: requireConstructor<[TStoreOptions], TStore>(
      moduleNamespace,
      'default',
    ),
    CborCodecCtor: requireConstructor<[], TCodec>(
      moduleNamespace,
      'CborCodec',
    ),
  };
}
