import Intent, {
  type EdgeIntentFields,
  type EntityIntentFields,
  type NodeIntentFields,
  type PropertyIntentFields,
} from './Intent.ts';

export type IntentBuilders = {
  readonly node: {
    readonly add: (fields: NodeIntentFields) => Intent;
    readonly remove: (fields: NodeIntentFields) => Intent;
  };
  readonly entity: {
    readonly add: (fields: EntityIntentFields) => Intent;
  };
  readonly edge: {
    readonly add: (fields: EdgeIntentFields) => Intent;
    readonly remove: (fields: EdgeIntentFields) => Intent;
  };
  readonly property: {
    readonly set: (fields: PropertyIntentFields) => Intent;
  };
};

export const intent: IntentBuilders = Object.freeze({
  node: Object.freeze({
    add: (fields: NodeIntentFields) => Intent.addNode(fields),
    remove: (fields: NodeIntentFields) => Intent.removeNode(fields),
  }),
  entity: Object.freeze({
    add: (fields: EntityIntentFields) => Intent.addEntity(fields),
  }),
  edge: Object.freeze({
    add: (fields: EdgeIntentFields) => Intent.addEdge(fields),
    remove: (fields: EdgeIntentFields) => Intent.removeEdge(fields),
  }),
  property: Object.freeze({
    set: (fields: PropertyIntentFields) => Intent.setProperty(fields),
  }),
});
