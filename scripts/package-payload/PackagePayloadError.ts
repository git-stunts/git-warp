export default class PackagePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackagePayloadError';
  }
}
