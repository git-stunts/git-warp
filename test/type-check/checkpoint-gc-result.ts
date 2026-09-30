/**
 * Checkpoint GC result contract -- compile-only.
 *
 * `graph.checkpoint.runGC()` and `maybeRunGC()` are typed by
 * CheckpointCapability, while executeGC builds the domain GCExecuteResult.
 * Every count the domain result carries must be readable through the
 * capability without a cast, and the domain constructor must require every
 * count. This project gates CI; the test project's typecheck is advisory.
 */

import type CheckpointCapability from '../../src/domain/capabilities/CheckpointCapability.ts';
import GCExecuteResult from '../../src/domain/services/GCExecuteResult.ts';

type DomainGCExecuteResult = GCExecuteResult;

declare const checkpoint: CheckpointCapability;

const ran = checkpoint.runGC();
const propertiesPruned: number = ran.propertiesPruned;

const maybe = checkpoint.maybeRunGC();
const maybePropertiesPruned: number | undefined = maybe.result?.propertiesPruned;

type CapabilityGCExecuteResult = ReturnType<CheckpointCapability['runGC']>;
type FieldsMissingFromCapability = Exclude<keyof DomainGCExecuteResult, keyof CapabilityGCExecuteResult>;
const capabilityCarriesEveryDomainField: [FieldsMissingFromCapability] extends [never] ? true : false = true;

// A producer states every count. If the constructor goes back to defaulting
// propertiesPruned, this directive becomes unused and the gate fails.
// @ts-expect-error -- propertiesPruned is required; omitting it must not type-check.
const omitted = new GCExecuteResult({
  nodesCompacted: 1,
  edgesCompacted: 2,
  tombstonesRemoved: 3,
});

export { capabilityCarriesEveryDomainField, maybePropertiesPruned, omitted, propertiesPruned };
