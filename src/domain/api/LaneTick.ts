/** Storage-neutral point on a Lane. */
type Tick = Readonly<{
  readonly id: string;
  readonly lane: string;
}>;

export default Tick;
