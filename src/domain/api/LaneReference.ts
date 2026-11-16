/** Names the Lane an entity admission inventory certificate covers. */
export type LaneReference = Readonly<{
  readonly kind: 'worldline' | 'strand';
  readonly name: string;
}>;
