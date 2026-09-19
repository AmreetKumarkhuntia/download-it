# Tests

All test implementations and fixtures live here. Production directories contain no colocated test files. `@dm/tests` is a private pnpm workspace package; its testing dependencies and configs do not participate in application builds or release version stamping.

| Directory             | Contents                                                                  |
| --------------------- | ------------------------------------------------------------------------- |
| `desktop/components/` | Presentational component behavior tested with props and callbacks.        |
| `desktop/widgets/`    | Connected UI workflows with mocked client/platform boundaries.            |
| `desktop/services/`   | State recovery, selectors, formatting models and polling cleanup.         |
| `browser-extension/`  | Capture eligibility, handoff ownership and worker behavior.               |
| `rust/`               | Application/service unit tests and SQLite/aria2 integration tests.        |
| `tooling/`            | Architecture enforcement, browser registration and release tooling tests. |
| `fixtures/`           | Local HTTP fixture for browser integration smoke tests.                   |

Run from the repository root:

```sh
pnpm check                        # Architecture and production/test TypeScript checks
pnpm test                         # Desktop, browser extension, architecture and registration
pnpm test:release                 # Release fixtures, including temporary Git repositories
pnpm --filter @dm/tests test:desktop
pnpm --filter @dm/tests test:browser
cargo test --workspace --exclude download-it
ARIA2_BIN=/absolute/path/to/aria2c node tests/rust/run-transfers.mjs
```

The real transfer runner requires `cargo` on PATH, aria2 and loopback listening sockets. It runs the six ignored integration cases serially. PowerShell users should set `$env:ARIA2_BIN` before running it. `cargo test` also covers the desktop package when native GTK/WebKit or the target platform's build dependencies are available.

Rust unit tests remain unit tests with access to private implementation details. Each production module references its external file using `#[cfg(test)]` and `#[path = ".../tests/rust/..."] mod tests;`. Keep `use super::*` inside that file. Integration tests are registered with explicit `[[test]]` paths in the aria2 and SQLite Cargo manifests. The target names remain `transfers` and `browser_handoffs`, so existing Cargo commands continue to work. The Windows pipe test remains gated to Windows.

Desktop tests use a jsdom setup that supplies native dialog lifecycle methods. Mock transport at `services/client/`, not inside components. Test the shared workspace at the application boundary when checking subscriptions and page transitions. Use fake timers for polling and restore them after each test. Browser-extension tests use the Node environment and Chrome API mocks.

`pnpm browser:test-fixture` starts the browser download fixture. See [browser testing](../docs/contributing/browser-extension.md) for its routes and manual extension steps. CI uses these same test entry points.
