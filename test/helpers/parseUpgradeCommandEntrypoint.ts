export function parseUpgradeCommandEntrypoint(command: string): string {
  const stages = command.split(' && ');
  const [, nodeCommand] = stages;
  if (stages.length !== 2 || nodeCommand === undefined || !nodeCommand.startsWith('node ')) {
    throw new Error(`Unexpected upgrade command shape: ${command}`);
  }
  return nodeCommand.slice('node '.length);
}
