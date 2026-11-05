import type CustodyIndeterminate from './CustodyIndeterminate.ts';
import type CustodyRefused from './CustodyRefused.ts';

/** Every custody outcome that is not its operation's success. */
export type CustodyIndeterminateOrRefused = CustodyRefused | CustodyIndeterminate;
