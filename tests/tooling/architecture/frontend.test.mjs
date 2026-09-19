import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFrontend,
  checkTestPlacement,
} from '../../../tooling/architecture/frontend-rules.mjs';

function check(files) {
  const root = mkdtempSync(join(tmpdir(), 'download-it-boundaries-'));
  try {
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { moduleResolution: 'Bundler', baseUrl: '.', paths: { '@/*': ['src/*'] } },
      }),
    );
    for (const [name, content] of Object.entries(files)) {
      const path = join(root, 'src', name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    return checkFrontend(join(root, 'src'), join(root, 'tsconfig.json'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('widgets can connect services to presentational components', () => {
  assert.deepEqual(
    check({
      'widgets/Downloads.ts': "import '../services/downloads'; import '../components/Card';",
      'components/Card.ts': 'export const Card = 1;',
      'services/downloads.ts': 'export const load = () => fetch("/downloads");',
    }),
    [],
  );
});
for (const declaration of [
  "import { load } from '../services/downloads';",
  "export { load } from '../services/downloads';",
  "const load = () => import('@/services/downloads');",
  "const load = require('@/services/downloads');",
]) {
  test(`rejects component service access: ${declaration}`, () => {
    assert.match(
      check({
        'components/Card.ts': declaration,
        'services/downloads.ts': 'export const load = 1;',
      }).join('\n'),
      /components cannot depend on services/,
    );
  });
}
test('barrels cannot hide a forbidden dependency', () => {
  assert.match(
    check({
      'components/Card.ts': "import './helpers';",
      'components/helpers.ts': "export * from '../services/downloads';",
      'services/downloads.ts': 'export const load = 1;',
    }).join('\n'),
    /helpers.ts: components cannot depend on services/,
  );
});
test('pages cannot subscribe to services and services cannot import UI', () => {
  const errors = check({
    'pages/Downloads.ts': "import '../services/downloads';",
    'services/downloads.ts': "import '../pages/Downloads';",
  });
  assert.equal(errors.length, 2);
});
test('rejects unresolvable lazy imports and direct platform calls', () => {
  const errors = check({
    'components/Card.ts': 'fetch("/data"); navigator.clipboard.readText(); import(moduleName);',
  });
  assert.equal(errors.length, 3);
});
test('test implementations live in tests while Rust module wiring stays in source', () => {
  assert.equal(checkTestPlacement('src/card.test.tsx', '').length, 1);
  assert.equal(checkTestPlacement('src/card.tsx', "import { test } from 'vitest';").length, 1);
  assert.equal(checkTestPlacement('src/lib.rs', '#[tokio::test]\nasync fn check() {}').length, 1);
  assert.equal(checkTestPlacement('src/lib.rs', '#[test]\nfn check() {}').length, 1);
  assert.deepEqual(
    checkTestPlacement(
      'src/lib.rs',
      '#[cfg(test)]\n#[path = "../../../tests/rust/unit.rs"]\nmod tests;',
    ),
    [],
  );
});
