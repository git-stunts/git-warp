import WorkloadPlan from './WorkloadPlan.ts';

/** Reproducible workload sizes; these are not process-count performance ceilings. */
export const BULK_THREADS_PER_PATCH = 50;
export const MEASURED_SAVES = 60;
export const MARGINS_READS = 30;
export const COLD_OPENS = 5;
export const CORPUS_SEED = 0x1099;

/** The workload the witness runs at every scale. */
export const WITNESS_PLAN = new WorkloadPlan({ measuredSaves: MEASURED_SAVES, marginsReads: MARGINS_READS, coldOpens: COLD_OPENS });
