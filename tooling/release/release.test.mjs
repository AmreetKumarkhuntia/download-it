import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { unzipSync } from 'fflate';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';
import config from '../../release.config.mjs';
import { stampCargoLock, stampWorkspace, validateVersion } from './versions.mjs';
import { assemble, collectSources } from '../packaging/windows-artifact.mjs';
import { releaseFailure } from './errors.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const logger = { log() {} };
const hash = (data) => createHash('sha256').update(data).digest('hex');

test('release failure annotations redact credentials and escape control characters', () => {
  const message = releaseFailure(
    { errors: [new Error('token=secret-value\nhttps://user:password@github.com/owner/repo 50%')] },
    ['secret-value'],
  );
  assert.ok(!message.includes('secret-value'));
  assert.ok(!message.includes('password'));
  assert.ok(!message.includes('\n'));
  assert.ok(message.includes('%0A'));
  assert.ok(message.includes('50%25'));
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'download-it-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    'Cargo.toml',
    'Cargo.lock',
    'apps/desktop/package.json',
    'apps/browser-extension/package.json',
    'packages/contracts/package.json',
    'apps/desktop/src-tauri/tauri.conf.json',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(project, file), join(root, file));
  }
  return root;
}

test('conventional commits select patch, minor, major, or no release', async () => {
  const [, options] = config.plugins[0];
  for (const [message, expected] of [
    ['fix(engine): resume interrupted transfers', 'patch'],
    ['feat(downloads): add scheduling', 'minor'],
    ['feat(api)!: change the download contract', 'major'],
    [
      'refactor(core): change ports\n\nBREAKING CHANGE: integrations must use the new port',
      'major',
    ],
    ['docs: describe settings', null],
    ['chore: refresh tooling', null],
  ]) {
    assert.equal(
      await analyzeCommits(options, { cwd: project, commits: [{ hash: 'test', message }], logger }),
      expected,
    );
  }
  assert.deepEqual(config.branches, ['master']);
  assert.equal(config.tagFormat, 'v${version}');
  const github = config.plugins.at(-1)[1];
  assert.equal(github.successComment, false);
  assert.equal(github.failComment, false);
  assert.equal(github.releasedLabels, false);
});

test('stable release versions reject malformed or prerelease values', () => {
  for (const value of ['1.0.0', '1.2.3', '2.0.0'])
    assert.doesNotThrow(() => validateVersion(value));
  for (const value of ['v1.0.0', '01.0.0', '1.0', '1.0.0-beta.1', '1.0.0\n', '1.0.0;echo']) {
    assert.throws(() => validateVersion(value));
  }
});

test('the installed preset and notes writer render a complete initial changelog', async () => {
  const notes = await generateNotes(config.plugins[1][1], {
    cwd: project,
    logger,
    options: { repositoryUrl: config.repositoryUrl },
    lastRelease: {},
    nextRelease: { version: '1.0.0', gitTag: 'v1.0.0' },
    commits: [
      { hash: 'a'.repeat(40), message: 'feat(downloads): add scheduling' },
      { hash: 'b'.repeat(40), message: 'fix(engine): resume transfers' },
      { hash: 'c'.repeat(40), message: 'feat(api)!: change contracts' },
    ],
  });
  for (const text of ['1.0.0', 'add scheduling', 'resume transfers', 'BREAKING CHANGES']) {
    assert.ok(notes.includes(text), `Release notes must contain ${text}`);
  }
});

test('Cargo lock stamping preserves third-party dependency versions', () => {
  const original =
    'version = 4\n\n[[package]]\nname = "dm-domain"\nversion = "0.1.0"\n\n[[package]]\nname = "serde"\nversion = "1.0.200"\nsource = "registry+example"\n';
  const stamped = stampCargoLock(original, ['dm-domain'], '1.2.3');
  assert.equal(stamped, original.replace('version = "0.1.0"', 'version = "1.2.3"'));
  assert.throws(() => stampCargoLock(original, ['missing'], '1.0.0'), /missing/);
  assert.throws(() => stampCargoLock(original, ['serde'], '1.0.0'), /registry source/);
});

test('one version is applied to every app manifest and workspace crate', (t) => {
  const root = fixture(t);
  const names = [
    'dm-domain',
    'dm-contracts',
    'dm-application',
    'dm-aria2',
    'dm-sqlite',
    'dm-filesystem',
    'dm-process',
    'dm-browser',
    'download-it-native-host',
    'download-it',
  ];
  stampWorkspace(root, '1.0.0', names);
  for (const file of [
    'apps/desktop/package.json',
    'apps/browser-extension/package.json',
    'packages/contracts/package.json',
    'apps/desktop/src-tauri/tauri.conf.json',
  ]) {
    assert.equal(JSON.parse(readFileSync(join(root, file))).version, '1.0.0');
  }
  assert.match(
    readFileSync(join(root, 'Cargo.toml'), 'utf8'),
    /\[workspace.package\]\nversion = "1.0.0"/,
  );
  const lock = readFileSync(join(root, 'Cargo.lock'), 'utf8');
  for (const name of names) assert.ok(lock.includes(`name = "${name}"\nversion = "1.0.0"`));
});

test('packaging includes stamped source, valid checksums, and no untracked secrets', async (t) => {
  const root = fixture(t);
  const write = (file, data) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), data);
  };
  write('LICENSE', 'Application license');
  write('licenses/THIRD_PARTY.md', 'Engine notices');
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init');
  git('add', '.');
  git(
    '-c',
    'user.name=Release Test',
    '-c',
    'user.email=release-test@example.invalid',
    'commit',
    '-m',
    'fixture',
  );
  // Change after commit to prove that the exact build versions are archived.
  const app = JSON.parse(readFileSync(join(root, 'apps/desktop/package.json')));
  app.version = '1.0.0';
  write('apps/desktop/package.json', JSON.stringify(app));
  write('.env', 'THIS MUST NEVER BE ARCHIVED');
  write('target/release/bundle/nsis/Download.It_1.0.0_x64-setup.exe', 'fixture installer');
  write('apps/desktop/src-tauri/binaries/manifest.json', '{}');
  write('release/windows-x64/source/aria2/engine.tar.gz', 'fixture source');
  write(
    'tooling/packaging/windows-sources.json',
    JSON.stringify({
      recipe: 'fixture',
      sources: [
        {
          name: 'engine.tar.gz',
          url: 'https://example.invalid/source',
          sha256: hash('fixture source'),
        },
      ],
    }),
  );
  await collectSources(root); // Uses the cached fixture, without networking.
  assemble(root);
  const assets = join(root, 'release/assets');
  const zip = unzipSync(
    readFileSync(join(assets, 'download-it-1.0.0-windows-x64-with-sources.zip')),
  );
  const source = unzipSync(zip['source/download-it-1.0.0.zip']);
  assert.equal(JSON.parse(Buffer.from(source['apps/desktop/package.json'])).version, '1.0.0');
  assert.equal(source['.env'], undefined);
  assert.equal(JSON.parse(Buffer.from(zip['build-info.json'])).signed, false);
  for (const line of readFileSync(join(assets, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')) {
    const [expected, file] = line.split('  ');
    assert.equal(hash(readFileSync(join(assets, file))), expected);
  }
  write('release/windows-x64/source/aria2/engine.tar.gz', 'tampered');
  assert.throws(() => assemble(root), /Source changed/);
  await assert.rejects(collectSources(root), /checksum mismatch/);
});
