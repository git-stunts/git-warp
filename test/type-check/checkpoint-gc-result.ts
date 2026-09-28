/**
 * Checkpoint GC result contract -- compile-only.
 *
 * `graph.checkpoint.runGC()` and `maybeRunGC()` are typed by
 * CheckpointCapability, while executeGC builds the domain GCExecuteResult.
 * Every count the domain result carries must be readable through the
 * capability without a cast.
 */

import type CheckpointCapability from '../../src/domain/capabilities/CheckpointCapability.ts';
import type DomainGCExecuteResult from '../../src/domain/services/GCExecuteResult.ts';

declare const checkpoint: CheckpointCapability;

const ran = checkpoint.runGC();
const propertiesPruned: number = ran.propertiesPruned;

const maybe = checkpoint.maybeRunGC();
const maybePropertiesPruned: number | undefined = maybe.result?.propertiesPruned;

type CapabilityGCExecuteResult = ReturnType<CheckpointCapability['runGC']>;
type FieldsMissingFromCapability = Exclude<keyof DomainGCExecuteResult, keyof CapabilityGCExecuteResult>;
const capabilityCarriesEveryDomainField: [FieldsMissingFromCapability] extends [never] ? true : false = true;

export { capabilityCarriesEveryDomainField, maybePropertiesPruned, propertiesPruned };
