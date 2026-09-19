import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const hostName = 'io.github.amreetkumarkhuntia.downloadit.browser.dev';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const browsers = { chrome: 'Google\\Chrome', edge: 'Microsoft\\Edge' };
export function makeManifest(binary, ids) {
  if (!ids.length || ids.some((id) => !/^[a-p]{32}$/.test(id)))
    throw new Error('Supply the 32-letter extension IDs shown by Chrome or Edge.');
  return {
    name: hostName,
    description: 'Download It development bridge',
    path: resolve(binary),
    type: 'stdio',
    allowed_origins: [...new Set(ids)].map((id) => `chrome-extension://${id}/`),
  };
}
export function registrationKeys(names) {
  return names.map((name) => {
    if (!(name in browsers)) throw new Error('Supported browsers: chrome, edge.');
    return `HKCU\\Software\\${browsers[name]}\\NativeMessagingHosts\\${hostName}`;
  });
}
export function run(args) {
  if (process.platform !== 'win32')
    throw new Error('Register the native host from Windows PowerShell, in a Windows checkout.');
  if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA is unavailable.');
  const directory = join(process.env.LOCALAPPDATA, 'DownloadIt/BrowserIntegration/development');
  const file = join(directory, 'host.json');
  if (args[0] === 'unregister') {
    for (const key of registrationKeys(Object.keys(browsers))) {
      let current;
      try {
        current = execFileSync('reg.exe', ['query', key, '/ve'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        continue;
      }
      // Never remove a registration pointing at another checkout or installation.
      if (current.toLowerCase().includes(file.toLowerCase()))
        execFileSync('reg.exe', ['delete', key, '/f'], { stdio: 'inherit' });
    }
    rmSync(file, { force: true });
    console.log('Removed Download It development registration.');
    return;
  }
  const selected = [];
  const ids = [];
  for (let i = 0; i < args.length; i += 2) {
    const name = /^--(chrome|edge)-id$/.exec(args[i])?.[1];
    if (!name || !args[i + 1])
      throw new Error('Usage: pnpm browser:register --chrome-id <ID> --edge-id <ID>');
    selected.push(name);
    ids.push(args[i + 1]);
  }
  const binary = join(root, 'target/debug/download-it-native-host.exe');
  if (!existsSync(binary)) throw new Error('Run pnpm browser:build on Windows first.');
  const manifest = makeManifest(binary, ids);
  // Preserve previously registered browser IDs when adding a second browser.
  if (existsSync(file)) {
    const old = JSON.parse(readFileSync(file, 'utf8'));
    if (old.name !== hostName) throw new Error('Unexpected host manifest; refusing to replace it.');
    manifest.allowed_origins = [...new Set([...old.allowed_origins, ...manifest.allowed_origins])];
  }
  mkdirSync(directory, { recursive: true });
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  for (const key of registrationKeys(selected))
    execFileSync('reg.exe', ['add', key, '/ve', '/t', 'REG_SZ', '/d', file, '/f'], {
      stdio: 'inherit',
    });
  console.log(
    'Native bridge registered for this Windows user. Open Download It, then reload the extension.',
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run(process.argv.slice(2).filter((arg) => arg !== '--'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
