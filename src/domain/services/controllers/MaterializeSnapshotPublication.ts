export type MaterializeSnapshotPublication = 'publish' | 'skip';

export type MaterializeSnapshotPublicationOptions = Readonly<{
  snapshotPublication: MaterializeSnapshotPublication;
}>;

const PUBLISH_SNAPSHOT_OPTIONS: MaterializeSnapshotPublicationOptions = Object.freeze({
  snapshotPublication: 'publish',
});

const SKIP_SNAPSHOT_OPTIONS: MaterializeSnapshotPublicationOptions = Object.freeze({
  snapshotPublication: 'skip',
});

export function snapshotPublicationForReceipts(
  opts: { receipts: boolean },
): MaterializeSnapshotPublicationOptions {
  if (opts.receipts) {
    return SKIP_SNAPSHOT_OPTIONS;
  }
  return PUBLISH_SNAPSHOT_OPTIONS;
}

export function shouldPublishMaterializeSnapshot(
  options?: MaterializeSnapshotPublicationOptions,
): boolean {
  return options === undefined || options.snapshotPublication === 'publish';
}
