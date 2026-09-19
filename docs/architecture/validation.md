# Validation record

Local environment: Linux x64 (WSL), Rust 1.98.1, aria2 1.37.0, pnpm 10.32.1.

- Frontend TypeScript check, Vite production build, and React component tests.
- Rust service unit tests and Clippy with warnings denied.
- Real aria2 transfers against a local HTTP fixture: parallel byte ranges, redirects, sequential fallback, unknown content length, filename collisions, checksum success/failure, authenticated RPC, source changes on resume, restart, and persistent recovery.
- Large-file filesystem validation above 4 GiB using a sparse file.
- Generated API contracts match Rust definitions; architecture import rules and formatting checks pass.
- Linux desktop compile and native link check using isolated GTK/WebKit development libraries.
- Native launch reaches GTK but cannot complete in the isolated sysroot: the distribution WebKit library requires helper executables installed at its compiled system path. A normal WebKitGTK system installation is required for the native launch smoke test.
- Headless Chrome visual inspection of the web preview at 1280 × 900.

The real-process tests run serially. Running multiple full aria2/server fixtures simultaneously on the local constrained environment caused RPC timeouts; each isolated fixture passed.

Windows and both macOS architectures are configured in CI but have not been executed locally. Installer signing/notarization and target-device installation smoke tests remain release tasks. Media extraction is deferred.

## Browser integration validation

The Windows Chrome/Edge development integration adds extension tests for source eligibility, worker startup, POST redirects, closed-app fallback, uncertain commits, and restart recovery. Rust tests cover protocol framing, origin validation, durable handoff transitions, and migration of existing jobs/settings. A real aria2 handoff test verifies idempotent commits and the completed file checksum. The fixture server's range, redirect, expired-link, login-page, and unverifiable-response endpoints have been smoke-tested.

The Windows native-host and pipe code cross-compile and pass Clippy checks from Linux. Interactive Chrome/Edge native-host installation and the Windows-only pipe test must still run on Windows; see [the manual smoke-test steps](../contributing/browser-extension.md). Store publishing and production installer registration remain deferred.

## Frontend and test reorganization

Validated after moving tests to root `tests/` and separating pages, widgets, components and services:

- Production builds for the desktop renderer and browser extension passed.
- Native Linux desktop and native-host debug builds linked successfully using temporary GTK/WebKit development/runtime library paths. System packages were not changed. Native GUI launch and installer packaging were not repeated for this refactor.
- Architecture checks, production/test TypeScript checks, generated contract checks and formatting passed. The workspace and Windows browser/native-host targets passed Clippy with warnings denied.
- 18 desktop tests, 17 browser-extension tests, 11 architecture/registration tests and 7 release tooling tests passed.
- All 22 default Linux Rust tests passed. The six real aria2 integration tests passed serially from their new paths. The first transfer-suite attempt exited with SIGSEGV; the affected test passed in isolation, followed by a passing full serial rerun without code changes. The cause of that initial crash was not established.
- The Rust test inventory is unchanged, including the six explicitly ignored real-transfer tests and the Windows-only pipe test. Rust unit tests retain private-module access through external `#[path]` declarations.
- Headless Chrome checks covered downloads, settings, diagnostics and dialogs at 1280px and 680px widths. The details screen matched the earlier layout, with no horizontal document overflow. The plain web preview loaded without runtime errors and kept native download controls disabled.

See [frontend ownership](frontend.md) and [test commands](../../tests/README.md) for the new structure.
