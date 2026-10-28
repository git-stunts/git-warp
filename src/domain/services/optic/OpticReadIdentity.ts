import type ConeReadIdentity from './ConeReadIdentity.ts';
import type ReadIdentity from './ReadIdentity.ts';

/**
 * The witness of one bounded optic read: a checkpoint-tail read (compatibility
 * graph handles) or a cone read (public Lane reads, #1039).
 */
export type OpticReadIdentity = ReadIdentity | ConeReadIdentity;
