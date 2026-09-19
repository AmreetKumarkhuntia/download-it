import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const cli = require.resolve('@commitlint/cli/cli.js');

test('commitlint allows exactly the five requested types, scopes, and breaking changes', () => {
  for (const message of [
    'feat: add scheduling',
    'fix(engine): resume transfers',
    'refactor(core)!: change ports',
    'doc: explain installation',
    'chore: update tooling',
    'chore(release): 1.0.0 [skip ci]',
    'refactor: replace ports\n\nBREAKING CHANGE: use the new API',
  ]) {
    const result = spawnSync(process.execPath, [cli], {
      cwd: project,
      input: message,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${message}\n${result.stdout}\n${result.stderr}`);
  }
  for (const message of [
    ...['docs', 'ci', 'test', 'style', 'perf', 'build', 'revert', 'Feat'].map(
      (type) => `${type}: update project`,
    ),
    'Merge branch master',
    'v1.0.0',
    'fix:',
    'update project',
  ]) {
    const result = spawnSync(process.execPath, [cli], {
      cwd: project,
      input: message,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, `${message}\n${result.stdout}\n${result.stderr}`);
  }
});

test('CI checks full push/PR ranges and edited PR titles without linting legacy history', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'download-it-commits-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(project, 'commitlint.config.mjs'), join(root, 'commitlint.config.mjs'));
  symlinkSync(join(project, 'node_modules'), join(root, 'node_modules'), 'junction');
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '--initial-branch=master');
  git('config', 'user.name', 'Commit Test');
  git('config', 'user.email', 'commit-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const commit = (message) => {
    git('commit', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const legacy = commit('style: legacy commit');
  git('update-ref', 'refs/remotes/origin/master', legacy);
  const run = (event, head) => {
    const path = join(root, 'event.json');
    writeFileSync(path, JSON.stringify(event));
    return spawnSync(process.execPath, [join(project, 'tooling/commits/lint-ci.mjs')], {
      cwd: root,
      env: { ...process.env, GITHUB_EVENT_PATH: path, GITHUB_SHA: head },
      encoding: 'utf8',
    });
  };
  const valid = commit('doc: explain downloads');
  assert.equal(run({ before: legacy }, valid).status, 0);
  assert.equal(run({}, valid).status, 0);
  const invalid = commit('docs: invalid spelling');
  const head = commit('fix: resume transfers');
  assert.notEqual(run({ before: legacy }, head).status, 0);
  assert.notEqual(run({ before: '0'.repeat(40) }, head).status, 0);
  assert.equal(run({ before: invalid }, head).status, 0);
  const pr = (title, base) => ({
    pull_request: { title, base: { sha: base }, head: { sha: head } },
  });
  assert.notEqual(run(pr('fix: resume transfers', legacy), head).status, 0);
  assert.notEqual(run(pr('docs: invalid title', invalid), head).status, 0);
  assert.equal(run(pr('fix: resume transfers', invalid), head).status, 0);
  // Manual/bootstrap runs also work for a root commit without a parent.
  git('update-ref', 'refs/remotes/origin/master', legacy);
  assert.notEqual(run({}, legacy).status, 0);
  git('checkout', '--orphan', 'bootstrap');
  const first = commit('chore: initialize repository');
  git('update-ref', 'refs/remotes/origin/master', first);
  assert.equal(run({}, first).status, 0);
});
