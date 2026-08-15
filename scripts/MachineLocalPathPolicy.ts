import { MachineLocalPathStreamScanner } from './MachineLocalPathStreamScanner.ts';

export class MachineLocalPathPolicy {
  containsMachineLocalPath(content: string): boolean {
    const scanner = this.createStreamScanner();
    scanner.write(new TextEncoder().encode(content));
    return scanner.finish();
  }

  createStreamScanner(): MachineLocalPathStreamScanner {
    return new MachineLocalPathStreamScanner();
  }
}
