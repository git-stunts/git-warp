import PatchError from './PatchError.ts';

/** Writer identity fallback requires the injected configuration capability. */
export default class MissingWriterConfigurationError extends PatchError {
  constructor() {
    super('Writer identity resolution requires the requested configuration capability', {
      code: 'E_MISSING_CONFIG',
    });
  }
}
