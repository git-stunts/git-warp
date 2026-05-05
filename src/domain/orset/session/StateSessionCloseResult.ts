import StateSessionError from "../../errors/StateSessionError.ts";

export type StateSessionCloseResultInit = {
  readonly nodeAliveRootOid: string | null;
  readonly edgeAliveRootOid: string | null;
};

export default class StateSessionCloseResult {
  readonly nodeAliveRootOid: string | null;
  readonly edgeAliveRootOid: string | null;

  constructor(init: StateSessionCloseResultInit) {
    validateRootOid("nodeAliveRootOid", init.nodeAliveRootOid);
    validateRootOid("edgeAliveRootOid", init.edgeAliveRootOid);
    this.nodeAliveRootOid = init.nodeAliveRootOid;
    this.edgeAliveRootOid = init.edgeAliveRootOid;
    Object.freeze(this);
  }
}

function validateRootOid(name: string, rootOid: string | null): void {
  if (rootOid === null) {
    return;
  }
  if (typeof rootOid !== "string" || rootOid.length === 0) {
    throw new StateSessionError(
      `StateSessionCloseResult ${name} must be null or a non-empty string; received ${String(rootOid)}`,
      {
        code: "E_STATE_SESSION_STRUCTURE",
        context: { field: name, rootOid },
      },
    );
  }
}
