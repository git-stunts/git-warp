import PublicSurfaceScanner from './PublicSurfaceScanner.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';

const findings = new PublicSurfaceScanner(process.cwd()).scan();
if (findings instanceof SurfaceRefusal) {
  process.stderr.write(`${findings.reason}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('PUBLIC-SURFACE-INVENTORY-BEGIN\n');
  for (const finding of findings) process.stdout.write(`${finding.key}\n`);
  process.stdout.write('PUBLIC-SURFACE-INVENTORY-END\n');
}
