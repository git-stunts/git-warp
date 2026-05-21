import { readFile } from 'node:fs/promises';

import ContinuumArtifactDescriptor from '../../domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumArtifactIngestionPolicy from '../../domain/continuum/ContinuumArtifactIngestionPolicy.ts';
import { parseContinuumArtifactDescriptorFields } from './continuumArtifactJsonParser.ts';
import type { ContinuumArtifactJsonLoadContext } from './continuumArtifactJsonTypes.ts';
import { validateLoadContext } from './continuumArtifactJsonValidation.ts';

export type { ContinuumArtifactJsonLoadContext } from './continuumArtifactJsonTypes.ts';

/** Loads Continuum artifact descriptors from JSON files at the adapter edge. */
export default class ContinuumArtifactJsonFileAdapter {
  private readonly policy: ContinuumArtifactIngestionPolicy;

  constructor(policy: ContinuumArtifactIngestionPolicy = new ContinuumArtifactIngestionPolicy()) {
    this.policy = policy;
  }

  /** Reads and ingests a generated artifact descriptor from disk. */
  async loadFile(
    path: string,
    context: ContinuumArtifactJsonLoadContext,
  ): Promise<ContinuumArtifactDescriptor> {
    const raw = await readFile(path, 'utf8');
    return this.loadString(raw, context);
  }

  /** Ingests a generated artifact descriptor from JSON text. */
  loadString(raw: string, context: ContinuumArtifactJsonLoadContext): ContinuumArtifactDescriptor {
    validateLoadContext(context);
    const fields = parseContinuumArtifactDescriptorFields(raw, context);
    return this.policy.ingest(new ContinuumArtifactDescriptor(fields));
  }
}
