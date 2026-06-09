type EdgeChangeOrderingInput = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

type PropChangeOrderingInput = {
  readonly key: string;
};

export function compareText(left: string, right: string): number {
  if (left < right) { return -1; }
  if (left > right) { return 1; }
  return 0;
}

export function compareEdgeChanges(left: EdgeChangeOrderingInput, right: EdgeChangeOrderingInput): number {
  return compareText(left.from, right.from)
    || compareText(left.to, right.to)
    || compareText(left.label, right.label);
}

export function comparePropChanges(left: PropChangeOrderingInput, right: PropChangeOrderingInput): number {
  return compareText(left.key, right.key);
}
