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
