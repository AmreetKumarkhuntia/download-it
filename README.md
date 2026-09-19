# Download It

A local desktop download manager for Windows, macOS, and Linux. Paste a direct file URL, download through parallel connections, and keep your downloads organized.

Built with **Tauri 2 · React · TypeScript · Rust · SQLite · aria2**.

## What works

- HTTP/HTTPS downloads with parallel connections, queueing, progress, speed, and ETA.
- Pause, resume, cancel, and explicit restart; persisted history and settings.
- Recovery of interrupted jobs as paused downloads, with source revalidation before resuming.
- Sequential fallback for servers without range support and unknown-length downloads.
- Optional SHA-256 validation, safe filenames, collision handling, and publication only after completion.
- Local authenticated aria2 RPC, a single desktop instance, and graceful shutdown.

A development browser extension supports Chrome and Edge on Windows: manual link submission and optional automatic capture of verifiable direct file downloads. See [browser extension setup and local testing](docs/contributing/browser-extension.md). Store publication and installer integration remain future work.

Logged-in downloads, media extraction, archive extraction, scheduling, and background/tray operation are future phases. The app is not a video-site downloader yet.

## Install and release versions

Download the Windows x64 `-setup.exe` from [GitHub Releases](https://github.com/AmreetKumarkhuntia/download-it/releases). aria2 is included. The installer is currently **unsigned**, so Windows may display an unknown-publisher warning. macOS and Linux are build-tested in CI; their published installers and code signing are future additions.

Push Conventional Commits to **`master`** to release: `fix:` creates a patch, `feat:` a minor, and `feat!:` or a `BREAKING CHANGE:` footer a major version. The first release is `1.0.0`. After all checks pass, semantic-release builds the installer, creates a `vX.Y.Z` tag, and publishes release notes, packages, checksums, and corresponding source archives. Documentation-only changes do not release. Other branches and pull requests never publish packages. The original `main` branch is not a release branch.

## Development

Install Node 24.10+, pnpm 10.32.1, stable Rust, and aria2 1.37.0. Keep the lockfiles committed.

Linux (Ubuntu 24.04):

```sh
sudo apt-get install build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf aria2
```

macOS: install Xcode command-line tools, then `brew install aria2 dylibbundler`.
Windows: install the Rust MSVC toolchain, Visual Studio C++ Build Tools, WebView2, and the official aria2 1.37.0 x64 release. Add aria2 to PATH or set `ARIA2_BIN` to its absolute path.

```sh
pnpm install
pnpm contracts
pnpm prepare:aria2
pnpm dev
```

`pnpm dev:web` opens the interface preview at http://localhost:1420. Downloads are deliberately unavailable in the browser preview; they require the desktop backend. `pnpm build` builds only the frontend; `pnpm desktop:build` builds platform installers on the current operating system.

## Verification

```sh
pnpm check
pnpm contracts:check
pnpm test
pnpm test:release
pnpm build
cargo test
ARIA2_BIN=/absolute/path/to/aria2c cargo test -p dm-aria2 --test transfers -- --ignored --test-threads=1
cargo check -p download-it
```

PowerShell: set `$env:ARIA2_BIN` before running the integration test command. Real transfer tests are explicitly ignored in the default Rust test suite because they require aria2 and local listening sockets; CI runs them explicitly on all platforms.

## Structure

`apps/desktop` contains the renderer and thin Tauri host. `crates/domain` defines internal models. `crates/application` owns workflows and ports. `crates/services/{aria2,sqlite,filesystem,process}` implement infrastructure. `crates/contracts` owns the desktop API; `packages/contracts` contains generated TypeScript types.

See [architecture](docs/architecture/overview.md), [adding integrations](docs/contributing/adding-integrations.md), and [release packaging](docs/architecture/releases.md).

## Data and behavior

SQLite lives in Tauri's per-user application data directory. It contains source URLs so downloads can resume; signed URLs should be treated as sensitive. URLs and raw aria2 errors are not emitted into application logs or frontend progress events. Incomplete data lives under `<destination>/.download-it/<job-id>/`. Cancel preserves it; Restart explicitly discards that job's partial data. Completed files are never deleted by these actions.

The current finalization service requires a destination filesystem supporting hard links (for example NTFS, APFS, ext4). On unsupported filesystems it reports a file error and retains the complete staging file. This deliberate constraint preserves atomic publication and existing files; a portable no-replace rename adapter is a future improvement.

Server behavior determines whether parallel connections or resume are available. More connections do not guarantee higher speed. Restart is required when a source changes, cannot be validated, or does not support resume. Closing the app pauses downloads; it does not run a background service.

Click a download's information button or **View details** to see live connection counts, the transfer's actual connection limit, connected server origins and speeds, piece completion, source URLs with sensitive query strings hidden, validators, file type, checksum and destination. Metadata remains available when the engine cannot be reached. The engine status banner retries automatically and clears after a successful poll; saved history alone does not count as an engine connection.

**Diagnostics** shows persistent engine and download events with an error filter and **Copy logs**. The latest 1,000 events are stored in the local SQLite database (schema 3), with up to 500 shown per view. Download details also contains that file's log. Logs omit source URLs, headers and filenames. See [download diagnostics and speed comparisons](docs/contributing/download-diagnostics.md) for troubleshooting and local tests.

## License

Original application source: [MIT](LICENSE). aria2: GPL-2.0-or-later. See [third-party notices](licenses/THIRD_PARTY.md). Windows releases include a companion source-and-notices package; see [release packaging](docs/architecture/releases.md).
