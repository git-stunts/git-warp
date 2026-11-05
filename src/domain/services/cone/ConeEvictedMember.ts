import type ConeEvictedValue from './ConeEvictedValue.ts';
import type ConeLifecycleEvent from './ConeLifecycleEvent.ts';

/** Conflict evidence retained when a register value or lifecycle event leaves the member cache. */
export type ConeEvictedMember = ConeEvictedValue | ConeLifecycleEvent;
