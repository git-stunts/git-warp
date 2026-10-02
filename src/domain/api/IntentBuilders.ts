import Intent, {
  type AutoEntityIntentFields,
  type EdgeIntentFields,
  type EntityIntentFields,
  type NodeIntentFields,
  type NodeContentIntentFields,
  type EdgeContentIntentFields,
  type PropertyIntentFields,
} from './Intent.ts';

export type IntentBuilders = {
  readonly node: {
    readonly add: (fields: NodeIntentFields) => Intent;
    readonly remove: (fields: NodeIntentFields) => Intent;
    readonly attachContent: (fields: NodeContentIntentFields) => Intent;
    readonly clearContent: (fields: NodeIntentFields) => Intent;
  };
  readonly entity: {
    readonly add: (fields: EntityIntentFields) => Intent;
    readonly addAuto: (fields: AutoEntityIntentFields) => Intent;
  };
  readonly edge: {
    readonly add: (fields: EdgeIntentFields) => Intent;
    readonly remove: (fields: EdgeIntentFields) => Intent;
    readonly attachContent: (fields: EdgeContentIntentFields) => Intent;
    readonly clearContent: (fields: EdgeIntentFields) => Intent;
  };
  readonly property: {
    readonly set: (fields: PropertyIntentFields) => Intent;
  };
};

export const intent: IntentBuilders = Object.freeze({
  node: Object.freeze({
    add: (fields: NodeIntentFields) => Intent.addNode(fields),
    remove: (fields: NodeIntentFields) => Intent.removeNode(fields),
    attachContent: (fields: NodeContentIntentFields) => Intent.attachNodeContent(fields),
    clearContent: (fields: NodeIntentFields) => Intent.clearNodeContent(fields),
  }),
  entity: Object.freeze({
    add: (fields: EntityIntentFields) => Intent.addEntity(fields),
    addAuto: (fields: AutoEntityIntentFields) => Intent.addEntityAuto(fields),
  }),
  edge: Object.freeze({
    add: (fields: EdgeIntentFields) => Intent.addEdge(fields),
    remove: (fields: EdgeIntentFields) => Intent.removeEdge(fields),
    attachContent: (fields: EdgeContentIntentFields) => Intent.attachEdgeContent(fields),
    clearContent: (fields: EdgeIntentFields) => Intent.clearEdgeContent(fields),
  }),
  property: Object.freeze({
    set: (fields: PropertyIntentFields) => Intent.setProperty(fields),
  }),
});
