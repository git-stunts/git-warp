import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import type { JsonObject } from './JsonObject.ts';
import {
  readRequiredString,
  readStringArray,
  rejectUnknownKeys,
  requireJsonObject,
} from './continuumArtifactJsonValidation.ts';

/** Reads and validates optional Continuum fixture footprints. */
export function readOptionalFootprints(source: JsonObject): void {
  const { footprints } = source;
  if (footprints === undefined) {
    return;
  }
  if (!Array.isArray(footprints)) {
    throw new AdapterValidationError('Continuum family fixture field "footprints" must be an array');
  }
  for (const entry of footprints) {
    const footprint = requireJsonObject(entry, 'Continuum family fixture footprint');
    rejectUnknownKeys(footprint, ['opName', 'reads', 'writes', 'creates', 'deletes'], 'Continuum family fixture footprint');
    readRequiredString(footprint, 'opName');
    readStringArray(footprint, 'reads');
    readStringArray(footprint, 'writes');
    readStringArray(footprint, 'creates');
    readStringArray(footprint, 'deletes');
  }
}
