import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function validateVersion(version) {
  // Stable releases only. Prerelease channels can be added deliberately later.
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Expected a stable semantic version, received: ${version}`);
  }
}

export function stampCargoLock(content, names, version) {
  validateVersion(version);
  const pending = new Set(names);
  const updated = content.replace(
    /(\[\[package\]\]\r?\nname = "([^"]+)"\r?\nversion = ")[^"]+("[^]*?)(?=\r?\n\[\[package\]\]|$)/g,
    (block, prefix, name, suffix) => {
      if (!pending.has(name)) return block;
      if (/^source = /m.test(suffix))
        throw new Error(`Workspace package has a registry source: ${name}`);
      pending.delete(name);
      return `${prefix}${version}${suffix}`;
    },
  );
  if (pending.size)
    throw new Error(`Workspace packages missing from Cargo.lock: ${[...pending].join(', ')}`);
  return updated;
}

export function stampWorkspace(root, version, workspaceNames) {
  validateVersion(version);
  const edits = new Map();
  const cargo = readFileSync(join(root, 'Cargo.toml'), 'utf8');
  const pattern = /(\[workspace\.package\]\s*\r?\nversion = ")[^"]+(".*)/;
  if (!pattern.test(cargo)) throw new Error('Missing workspace.package.version in Cargo.toml');
  edits.set(
    'Cargo.toml',
    cargo.replace(pattern, (_match, prefix, suffix) => `${prefix}${version}${suffix}`),
  );
  edits.set(
    'Cargo.lock',
    stampCargoLock(readFileSync(join(root, 'Cargo.lock'), 'utf8'), workspaceNames, version),
  );
  for (const file of [
    'apps/desktop/package.json',
    'apps/browser-extension/package.json',
    'packages/contracts/package.json',
    'apps/desktop/src-tauri/tauri.conf.json',
  ]) {
    const data = JSON.parse(readFileSync(join(root, file), 'utf8'));
    if (typeof data.version !== 'string') throw new Error(`Missing version in ${file}`);
    data.version = version;
    edits.set(file, JSON.stringify(data, null, 2) + '\n');
  }
  // Validate every input before changing any file. No dependency versions are rewritten.
  for (const [file, content] of edits) writeFileSync(join(root, file), content);
}
