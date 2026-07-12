import Reading, {
  type NeighborhoodReadingFields,
  type NodeReadingFields,
  type PropertyReadingFields,
} from './Reading.ts';

export type ReadingBuilders = {
  readonly property: (fields: PropertyReadingFields) => Reading;
  readonly neighborhood: (fields: NeighborhoodReadingFields) => Reading;
  readonly node: {
    readonly exists: (fields: NodeReadingFields) => Reading;
  };
};

export const reading: ReadingBuilders = Object.freeze({
  property: (fields: PropertyReadingFields) => Reading.property(fields),
  neighborhood: (fields: NeighborhoodReadingFields) => Reading.neighborhood(fields),
  node: Object.freeze({
    exists: (fields: NodeReadingFields) => Reading.nodeExists(fields),
  }),
});

export default reading;
