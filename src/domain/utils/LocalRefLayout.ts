/**
 * Home of clone-local WARP refs: state in flight that names this clone's own
 * reservation ledger (#1078). It sits beside `refs/warp/`, not inside it, so a
 * `refs/warp/*` lane wildcard does not copy it. A `refs/*` or mirror copy does,
 * together with the ledger under `refs/cas/`, and the copy then acts as its own clone.
 */
export const LOCAL_REF_PREFIX = 'refs/warp-local';
