export default class CliJsonFormatterAdapter {
  format(value: object): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }
}
