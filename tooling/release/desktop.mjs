import { execFileSync } from 'node:child_process';
import { assemble, collectSources } from '../packaging/windows-artifact.mjs';

export function verifyConditions() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(
      'The initial release target is Windows x64. Publish through the Windows CI release job.',
    );
  }
  if (!process.env.npm_execpath) throw new Error('Start the release with pnpm release.');
}

export async function prepare(_config, { cwd, nextRelease, logger }) {
  logger.log(`Building ${nextRelease.version} from release commit ${nextRelease.gitHead}`);
  await collectSources(cwd);
  const pnpm = (...args) =>
    execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, stdio: 'inherit' });
  pnpm('prepare:aria2');
  pnpm('--filter', '@dm/desktop', 'tauri', 'build', '--bundles', 'nsis');
  assemble(cwd);
  logger.log('Installer and source package are ready; semantic-release can now tag and publish.');
}
