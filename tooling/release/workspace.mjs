import { execFileSync } from 'node:child_process';
import { stampWorkspace } from './versions.mjs';

export function prepare(_config, { cwd, nextRelease, logger }) {
  const metadata = JSON.parse(
    execFileSync('cargo', ['metadata', '--locked', '--no-deps', '--format-version', '1'], {
      cwd,
      encoding: 'utf8',
    }),
  );
  const names = metadata.packages
    .filter((pkg) => metadata.workspace_members.includes(pkg.id))
    .map((pkg) => pkg.name);
  stampWorkspace(cwd, nextRelease.version, names);
  logger.log(`Stamped application, UI, contracts, and Rust workspace to ${nextRelease.version}`);
}
