import { spawnSync } from 'node:child_process';

// These tests use only generated fixtures and loopback URLs, never real download data.
const result = spawnSync(
  'cargo',
  [
    'test',
    '--locked',
    '-p',
    'dm-aria2',
    '--test',
    'transfers',
    '--',
    '--ignored',
    '--test-threads=1',
  ],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) {
  const detail = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n');
  if (process.env.GITHUB_ACTIONS === 'true') {
    const escaped = detail
      .slice(-8000)
      .replaceAll('%', '%25')
      .replaceAll('\r', '%0D')
      .replaceAll('\n', '%0A');
    console.log(`::error title=aria2 transfer test failure::${escaped}`);
  }
  process.exitCode = result.status || 1;
}
