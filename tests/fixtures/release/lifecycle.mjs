import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import semanticRelease from 'semantic-release';
import { generateNotes } from '@semantic-release/release-notes-generator';
import config from '../../../release.config.mjs';
import { stampWorkspace } from '../../../tooling/release/versions.mjs';
import { assemble, collectSources } from '../../../tooling/packaging/windows-artifact.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const hash = (data) => createHash('sha256').update(data).digest('hex');

const [root, remote] = process.argv.slice(2);
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
const write = (file, content) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
};
const names = [
  ...readFileSync(join(root, 'Cargo.lock'), 'utf8').matchAll(
    /\[\[package\]\]\nname = "([^"]+)"\nversion = "[^"]+"\n(?!source =)/g,
  ),
].map((match) => match[1]);
stampWorkspace(root, '0.1.0', names);
write('.gitignore', 'release/\ntarget/\n.env\napps/desktop/src-tauri/binaries/\n');
write('LICENSE', 'Application license');
write('licenses/THIRD_PARTY.md', 'Engine notices');
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
git('init', '--initial-branch=master');
git('config', 'user.name', 'Release Test');
git('config', 'user.email', 'release-test@example.invalid');
git('config', 'commit.gpgsign', 'false');
git('config', 'tag.gpgsign', 'false');
git('add', '.');
git('commit', '-m', 'feat: add download manager');
const originalHead = git('rev-parse', 'HEAD');
git('init', '--bare', '--initial-branch=master', remote);
git('remote', 'add', 'origin', remote);
git('push', '-u', 'origin', 'master');
write('.env', 'THIS MUST NEVER BE COMMITTED');

// Exercise semantic-release's actual lifecycle and Git plugin against a local remote.
// Replace native compilation and the GitHub API; neither can run in an offline test.
let failBuild = true;
let published = false;
const options = {
  ...config,
  repositoryUrl: remote,
  ci: false,
  plugins: config.plugins.map((entry) => {
    const [name, settings] = Array.isArray(entry) ? entry : [entry, {}];
    if (name === './tooling/release/workspace.mjs') {
      return {
        prepare: (_options, { nextRelease }) => stampWorkspace(root, nextRelease.version, names),
      };
    }
    if (name === './tooling/release/desktop.mjs') {
      return {
        prepare: async (_options, { nextRelease }) => {
          assert.notEqual(git('rev-parse', 'HEAD'), originalHead);
          assert.equal(nextRelease.gitHead, git('rev-parse', 'HEAD'));
          assert.equal(git('log', '-1', '--format=%s'), 'chore(release): 1.0.0 [skip ci]');
          assert.equal(git('status', '--porcelain'), '');
          assert.equal(git('--git-dir', remote, 'rev-parse', 'master'), nextRelease.gitHead);
          if (failBuild) throw new Error('Simulated installer build failure');
          write('target/release/bundle/nsis/Download.It_1.0.0_x64-setup.exe', 'fixture installer');
          write('apps/desktop/src-tauri/binaries/manifest.json', '{}');
          write('release/windows-x64/source/aria2/engine.tar.gz', 'fixture source');
          await collectSources(root);
          assemble(root);
          write('release/assets/future-installer.dmg', 'future installer fixture');
        },
      };
    }
    if (name === '@semantic-release/github') {
      return {
        publish: (_options, { nextRelease }) => {
          const assets = globSync(settings.assets, { cwd: root });
          assert.ok(assets.some((path) => path.endsWith('future-installer.dmg')));
          assert.ok(assets.some((path) => path.endsWith('-setup.exe')));
          assert.equal(
            git('--git-dir', remote, 'rev-parse', nextRelease.gitTag),
            nextRelease.gitHead,
          );
          const zip = unzipSync(
            readFileSync(
              join(root, 'release/assets/download-it-1.0.0-windows-x64-with-sources.zip'),
            ),
          );
          assert.equal(JSON.parse(Buffer.from(zip['build-info.json'])).commit, nextRelease.gitHead);
          const source = unzipSync(zip['source/download-it-1.0.0.zip']);
          assert.equal(
            Buffer.from(source['apps/desktop/package.json']).toString().trim(),
            git('show', `${nextRelease.gitTag}:apps/desktop/package.json`),
          );
          assert.equal(source['.env'], undefined);
          published = true;
        },
      };
    }
    if (name === '@semantic-release/release-notes-generator') {
      return {
        generateNotes: (_options, context) =>
          generateNotes(settings, {
            ...context,
            cwd: project,
            options: { ...context.options, repositoryUrl: config.repositoryUrl },
          }),
      };
    }
    return [require.resolve(name), settings];
  }),
};
const output = new Writable({
  write(_chunk, _encoding, done) {
    done();
  },
});
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/^(GITHUB_|GIT_|CI$|GH_TOKEN$)/.test(key)),
);
const run = () => semanticRelease(options, { cwd: root, env, stdout: output, stderr: output });
await assert.rejects(run(), /Simulated installer build failure/);
assert.equal(published, false);
assert.equal(git('tag', '--list'), '');
const releaseHead = git('rev-parse', 'HEAD');
const committedFiles = git('diff-tree', '--no-commit-id', '--name-only', '-r', releaseHead)
  .split('\n')
  .sort();
assert.deepEqual(
  committedFiles,
  [...config.plugins.find((entry) => entry[0] === '@semantic-release/git')[1].assets].sort(),
);

failBuild = false;
const result = await run();
assert.equal(published, true);
assert.equal(result.nextRelease.version, '1.0.0');
assert.equal(result.nextRelease.gitHead, releaseHead);
assert.equal(git('rev-parse', 'HEAD'), releaseHead);
assert.equal(await run(), false);
