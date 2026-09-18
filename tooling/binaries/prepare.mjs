import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const versions = JSON.parse(readFileSync(join(root, 'tooling/binaries/versions.json')));
const target =
  process.env.TARGET_TRIPLE ??
  execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)[1];
const name = process.platform === 'win32' ? 'aria2c.exe' : 'aria2c';
const source =
  process.env.ARIA2_BIN ??
  execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)[0];
if (!existsSync(source)) throw new Error('Install aria2 or set ARIA2_BIN to the executable.');
const version = execFileSync(source, ['--version'], { encoding: 'utf8' }).match(
  /aria2 version ([\d.]+)/,
)?.[1];
if (version !== versions.aria2.version)
  throw new Error(
    `Expected aria2 ${versions.aria2.version}, found ${version}. Review and update versions.json before changing the engine.`,
  );
const binaries = join(root, 'apps/desktop/src-tauri/binaries');
mkdirSync(binaries, { recursive: true });
const destination = join(binaries, `aria2c-${target}${process.platform === 'win32' ? '.exe' : ''}`);
copyFileSync(source, destination);
chmodSync(destination, 0o755);
const libs = join(binaries, 'aria2-libs');
mkdirSync(libs, { recursive: true });
if (process.platform === 'linux') {
  const linked = execFileSync('ldd', [source], { encoding: 'utf8' });
  if (linked.includes('not found')) throw new Error('aria2 has missing shared libraries.');
  // glibc and the loader come from the supported target OS; copy the other transitive dependencies.
  for (const [, file] of linked.matchAll(/=>\s+(\/\S+)\s+\(/g)) {
    if (/^(libc|libm|libpthread|libdl|librt|libresolv)\.so/.test(basename(file))) continue;
    copyFileSync(file, join(libs, basename(file)));
  }
} else if (process.platform === 'darwin') {
  execFileSync(
    'dylibbundler',
    ['-od', '-b', '-x', destination, '-d', libs, '-p', '@executable_path/../Resources/aria2-libs/'],
    { stdio: 'inherit' },
  );
}
const sha256 = createHash('sha256').update(readFileSync(destination)).digest('hex');
writeFileSync(
  join(binaries, 'manifest.json'),
  JSON.stringify(
    {
      name: 'aria2',
      version,
      target,
      sha256,
      source: versions.aria2.source,
      license: versions.aria2.license,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Prepared aria2 ${version} for ${target}; SHA-256 ${sha256}`);
