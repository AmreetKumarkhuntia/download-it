import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFrontend, checkTestPlacement, sourceFiles } from './architecture/frontend-rules.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const errors = [];
const rules = {
  domain: [],
  contracts: ['dm-domain'],
  application: ['dm-domain', 'dm-contracts'],
  'services/aria2': ['dm-domain', 'dm-application'],
  'services/sqlite': ['dm-domain', 'dm-application'],
  'services/filesystem': ['dm-domain', 'dm-application'],
  'services/process': ['dm-domain', 'dm-application'],
  'services/browser': ['dm-domain', 'dm-application', 'dm-contracts'],
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
errors.push(
  ...checkFrontend(join(root, 'apps/desktop/src'), join(root, 'apps/desktop/tsconfig.json')),
);
for (const directory of ['apps', 'crates', 'packages', 'tooling']) {
  for (const path of sourceFiles(join(root, directory))) {
    if (!/\.(?:[cm]?[jt]sx?|rs)$/.test(path)) continue;
    errors.push(...checkTestPlacement(path, readFileSync(path, 'utf8')));
  }
}
for (const path of sourceFiles(join(root, 'apps/browser-extension/src'))) {
  if (!/\.[tj]sx?$/.test(path)) continue;
  if (/@tauri-apps\/|node:|\bfetch\(/.test(readFileSync(path, 'utf8')))
    errors.push(`${path}: browser downloads must go through the native bridge`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Architecture boundaries passed.');
