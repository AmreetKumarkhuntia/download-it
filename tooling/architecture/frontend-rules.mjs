import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ignored = new Set(['node_modules', 'dist', 'target', 'binaries', '.git']);
export function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    ignored.has(entry.name)
      ? []
      : entry.isDirectory()
        ? sourceFiles(join(directory, entry.name))
        : [join(directory, entry.name)],
  );
}

const layers = {
  app: ['pages', 'widgets', 'types'],
  pages: ['pages', 'widgets', 'components', 'types'],
  widgets: ['widgets', 'components', 'services', 'types'],
  components: ['components', 'types'],
  services: ['services', 'types'],
  types: ['types'],
  entry: ['app'],
};
function layerOf(path) {
  if (path === 'App.tsx') return 'app';
  if (path === 'main.tsx') return 'entry';
  if (path === 'env.d.ts') return 'types';
  return path.split('/')[0];
}

// Resolve dependencies with TypeScript, including aliases, barrel exports and lazy imports.
export function checkFrontend(sourceRoot, configPath) {
  const errors = [];
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  for (const path of sourceFiles(sourceRoot)) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const name = relative(sourceRoot, path).replaceAll('\\', '/');
    const layer = layerOf(name);
    const fail = (message) => errors.push(`${name}: ${message}`);
    if (!layers[layer]) {
      fail('source must belong to components, widgets, pages, services or types');
      continue;
    }
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function dependency(specifier, typeOnly = false) {
      if (!specifier || !ts.isStringLiteralLike(specifier)) {
        fail('module paths must be literal strings so dependencies can be checked');
        return;
      }
      const target = specifier.text;
      if (layer === 'types' && !typeOnly) fail('types may only import or export types');
      if (/^(@tauri-apps\/|node:)/.test(target) && !name.startsWith('services/client/')) {
        fail('native APIs belong in services/client');
      }
      if (target === '@dm/contracts' && layer !== 'services' && !typeOnly) {
        fail('contract values belong in services; import type for UI types');
      }
      const resolved = ts.resolveModuleName(target, path, options, ts.sys).resolvedModule;
      if (!resolved) {
        if (
          target.endsWith('.css') &&
          layer === 'entry' &&
          resolve(dirname(path), target) === join(sourceRoot, 'style.css')
        )
          return;
        fail(`cannot resolve dependency ${target}`);
        return;
      }
      if (resolved.isExternalLibraryImport) return;
      const relativeTarget = relative(sourceRoot, resolved.resolvedFileName).replaceAll('\\', '/');
      if (relativeTarget.startsWith('../')) {
        fail(`local dependency ${target} is outside the frontend source`);
      } else if (!layers[layer].includes(layerOf(relativeTarget))) {
        fail(`${layer} cannot depend on ${layerOf(relativeTarget)} (${target})`);
      }
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const typeOnly =
          clause?.isTypeOnly ||
          (!clause?.name &&
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((item) => item.isTypeOnly));
        dependency(node.moduleSpecifier, typeOnly);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const typeOnly =
          node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((item) => item.isTypeOnly));
        dependency(node.moduleSpecifier, typeOnly);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        dependency(node.moduleReference.expression, node.isTypeOnly);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        dependency(node.argument.literal, true);
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        dependency(node.arguments[0]);
      }
      if (layer !== 'services') {
        if (
          ts.isIdentifier(node) &&
          [
            'fetch',
            'XMLHttpRequest',
            'WebSocket',
            '__TAURI_INTERNALS__',
            'localStorage',
            'sessionStorage',
          ].includes(node.text)
        )
          fail('network, persistence and native access belong in services');
        if (ts.isPropertyAccessExpression(node) && ['clipboard', 'cookie'].includes(node.name.text))
          fail('platform access belongs in services');
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return errors;
}

export function checkTestPlacement(path, source) {
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) return [`${path}: tests belong in root tests/`];
  if (
    /\.[cm]?[jt]sx?$/.test(path) &&
    /(?:from\s*|import\s*\(?|require\s*\()\s*['"](?:vitest|node:test|@testing-library\/[^'"]+)['"]/.test(
      source,
    )
  ) {
    return [`${path}: test framework imports belong in root tests/`];
  }
  if (path.endsWith('.rs') && /^\s*#\[\s*(?:[\w:]+::)?test\s*(?:\]|\()/m.test(source)) {
    return [
      `${path}: Rust test implementations belong in root tests/ (use #[cfg(test)] and #[path] here)`,
    ];
  }
  return [];
}
