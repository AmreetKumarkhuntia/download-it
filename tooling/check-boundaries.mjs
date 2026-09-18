import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const errors = [];
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(directory, e.name)) : [join(directory, e.name)],
  );
}
const rules = {
  domain: [],
  contracts: ['dm-domain'],
  application: ['dm-domain', 'dm-contracts'],
  'services/aria2': ['dm-domain', 'dm-application'],
  'services/sqlite': ['dm-domain', 'dm-application'],
  'services/filesystem': ['dm-domain', 'dm-application'],
  'services/process': ['dm-domain', 'dm-application'],
};
for (const [module, allowed] of Object.entries(rules)) {
  const source = readFileSync(join(root, 'crates', module, 'Cargo.toml'), 'utf8').split(
    '[dev-dependencies]',
  )[0];
  for (const [, name] of source.matchAll(/^(dm-[\w-]+)\s*[.=]/gm)) {
    if (!allowed.includes(name)) errors.push(`${module} cannot depend on ${name}`);
  }
  if (
    ['domain', 'application', 'contracts'].includes(module) &&
    /^(tauri|rusqlite|reqwest|dm-aria2|dm-sqlite)\s*[.=]/m.test(source)
  )
    errors.push(`${module} depends on a concrete infrastructure library`);
}
for (const path of walk(join(root, 'apps/desktop/src'))) {
  if (!/\.[tj]sx?$/.test(path) || path.includes('/services/')) continue;
  if (/@tauri-apps\/|node:|\bfetch\(/.test(readFileSync(path, 'utf8')))
    errors.push(`${path}: desktop or network access belongs in services`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Architecture boundaries passed.');
