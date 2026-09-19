import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('@commitlint/cli/cli.js');
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const lint = (args, input) =>
  execFileSync(process.execPath, [cli, '--verbose', ...args], {
    input,
    stdio: ['pipe', 'inherit', 'inherit'],
  });

if (event.pull_request) lint([], event.pull_request.title);

const head = event.pull_request?.head.sha ?? process.env.GITHUB_SHA;
let base = event.pull_request?.base.sha ?? event.before;
if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Expected a GitHub commit SHA.');

if (!base || /^0+$/.test(base)) {
  // New branches have no "before" SHA. Check all commits added since master.
  if (git('branch', '--remotes', '--list', 'origin/master')) {
    base = git('merge-base', 'origin/master', head);
  }
  // Manual runs on master and repository bootstrap still validate the latest commit.
  if (!base || /^0+$/.test(base) || base === head) {
    lint([], git('log', '-1', '--format=%B', head));
    process.exit(0);
  }
}

if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Expected a GitHub base commit SHA.');
lint(['--from', base, '--to', head]);
