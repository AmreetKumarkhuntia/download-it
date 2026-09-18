import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const digest = (data) => createHash('sha256').update(data).digest('hex');

async function fetchFile(url) {
  // GitHub's asset API also works on networks that cannot reach github.com release URLs.
  const release = url.match(
    /^https:\/\/github.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/(.+)$/,
  );
  if (release) {
    const metadata = await fetch(
      `https://api.github.com/repos/${release[1]}/releases/tags/${release[2]}`,
      {
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!metadata.ok) throw new Error(`Release lookup failed: HTTP ${metadata.status} for ${url}`);
    const asset = (await metadata.json()).assets.find((value) => value.name === release[3]);
    if (!asset) throw new Error(`Missing release asset: ${url}`);
    url = asset.url;
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/octet-stream' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
  if (response.headers.get('content-type')?.includes('application/json'))
    throw new Error(`Expected source file, received JSON: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function collectSources(root = projectRoot) {
  const sourceDirectory = join(root, 'release/windows-x64/source/aria2');
  const manifest = JSON.parse(readFileSync(join(root, 'tooling/packaging/windows-sources.json')));
  mkdirSync(sourceDirectory, { recursive: true });
  const entries = [];
  for (const source of manifest.sources) {
    const path = join(sourceDirectory, source.name);
    const data = existsSync(path) ? readFileSync(path) : await fetchFile(source.url);
    const sha256 = digest(data);
    if (source.sha256 !== sha256) throw new Error(`Source checksum mismatch: ${source.name}`);
    writeFileSync(path, data);
    entries.push({ ...source, sha256 });
    console.log(`Collected ${source.name} (${sha256})`);
  }
  writeFileSync(
    join(sourceDirectory, 'manifest.json'),
    JSON.stringify({ recipe: manifest.recipe, sources: entries }, null, 2) + '\n',
  );
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

export function assemble(root = projectRoot) {
  const output = join(root, 'release/windows-x64');
  const sourceDirectory = join(output, 'source/aria2');
  const manifest = JSON.parse(readFileSync(join(root, 'tooling/packaging/windows-sources.json')));
  const nsis = join(root, 'target/release/bundle/nsis');
  const installers = existsSync(nsis)
    ? readdirSync(nsis).filter((name) => name.endsWith('-setup.exe'))
    : [];
  if (installers.length !== 1)
    throw new Error(
      `Expected one NSIS installer, found ${installers.length}. Build with --bundles nsis first.`,
    );
  if (!existsSync(join(sourceDirectory, 'manifest.json')))
    throw new Error('Collect engine sources before assembling the artifact.');
  const sources = JSON.parse(readFileSync(join(sourceDirectory, 'manifest.json'))).sources;
  if (sources.length !== manifest.sources.length)
    throw new Error('Engine source collection is incomplete.');
  for (const source of manifest.sources) {
    if (digest(readFileSync(join(sourceDirectory, source.name))) !== source.sha256)
      throw new Error(`Source changed: ${source.name}`);
  }
  mkdirSync(output, { recursive: true });
  cpSync(join(nsis, installers[0]), join(output, installers[0]));
  cpSync(join(root, 'licenses'), join(output, 'licenses'), { recursive: true });
  cpSync(join(root, 'LICENSE'), join(output, 'LICENSE'));
  cpSync(
    join(root, 'apps/desktop/src-tauri/binaries/manifest.json'),
    join(output, 'aria2-manifest.json'),
  );
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const info = {
    platform: 'windows-x64',
    signed: false,
    commit,
    version: JSON.parse(readFileSync(join(root, 'apps/desktop/package.json'))).version,
    run: process.env.GITHUB_RUN_ID ?? null,
  };
  // Read tracked files from the worktree so source includes the exact stamped versions.
  // Do not archive ignored binaries, node_modules, local secrets, or .git credentials.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const appSource = Object.fromEntries(
    tracked.map((file) => [file, readFileSync(join(root, file))]),
  );
  writeFileSync(join(output, 'source', `download-it-${info.version}.zip`), zipSync(appSource));
  writeFileSync(join(output, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  writeFileSync(
    join(output, 'README.txt'),
    [
      `Download It ${info.version} — Windows x64 installer`,
      '',
      `Run ${installers[0]} to install.`,
      'This installer is unsigned. Windows may display an unknown-publisher warning.',
      'WebView2 is installed by the setup bootstrapper if needed (internet required).',
      'aria2 is bundled; it does not need to be installed separately.',
      '',
      `Source revision: ${commit}`,
      'SHA256SUMS.txt covers the installer and every accompanying file.',
      'source/ contains the application source and the engine/dependency sources from the upstream Windows build recipe.',
      'licenses/ contains application and upstream engine notices; the dependency source archives retain their license files.',
      'For changes to the engine or dependency builds, update the source manifest and build recipes together.',
      '',
    ].join('\n'),
  );
  const checksums = files(output)
    .filter((path) => basename(path) !== 'SHA256SUMS.txt')
    .sort()
    .map(
      (path) => `${digest(readFileSync(path))}  ${relative(output, path).replaceAll('\\', '/')}`,
    );
  writeFileSync(join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  const assets = join(root, 'release/assets');
  mkdirSync(assets, { recursive: true });
  cpSync(join(output, installers[0]), join(assets, installers[0]));
  const packageFiles = Object.fromEntries(
    files(output).map((file) => [relative(output, file).replaceAll('\\', '/'), readFileSync(file)]),
  );
  const zipName = `download-it-${info.version}-windows-x64-with-sources.zip`;
  writeFileSync(join(assets, zipName), zipSync(packageFiles, { level: 0 }));
  const releaseChecksums = [installers[0], zipName].map(
    (file) => `${digest(readFileSync(join(assets, file)))}  ${file}`,
  );
  writeFileSync(join(assets, 'SHA256SUMS.txt'), releaseChecksums.join('\n') + '\n');
  console.log(`Prepared ${installers[0]} and ${checksums.length} checksummed package files.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === 'sources') await collectSources();
  else if (command === 'assemble') assemble();
  else throw new Error('Usage: node tooling/packaging/windows-artifact.mjs sources|assemble');
}
