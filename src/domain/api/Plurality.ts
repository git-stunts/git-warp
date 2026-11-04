import type LifecyclePlurality from './LifecyclePlurality.ts';
import type RegisterPlurality from './RegisterPlurality.ts';

/** One concurrency a Reading or Receipt reports: a register race or a delete raced by an edit (#1039). */
export type Plurality = RegisterPlurality | LifecyclePlurality;
