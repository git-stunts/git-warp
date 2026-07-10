import Reading, {
  type NodeReadingFields,
  type PropertyReadingFields,
} from './Reading.ts';

export type ReadingBuilders = {
  readonly property: (fields: PropertyReadingFields) => Reading;
  readonly node: {
    readonly exists: (fields: NodeReadingFields) => Reading;
  };
};

export const reading: ReadingBuilders = Object.freeze({
  property: (fields: PropertyReadingFields) => Reading.property(fields),
  node: Object.freeze({
    exists: (fields: NodeReadingFields) => Reading.nodeExists(fields),
  }),
});

export default reading;
