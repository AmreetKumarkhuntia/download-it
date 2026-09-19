# Browser extension development

The first integration supports Chrome and Edge on Windows. Both the browser and Download It must run natively on Windows. A Windows browser cannot use the Linux native host built in WSL. Use a Windows checkout, for example `C:\dev\download-it`, and Windows PowerShell.

## Run the desktop application

Install Node 24.10+, pnpm 10.32.1, stable Rust with the MSVC toolchain, Visual Studio C++ Build Tools (Desktop development with C++), WebView2, and aria2 1.37.0. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

From the repository root:

```powershell
npm install -g pnpm@10.32.1
rustup default stable-msvc
$env:ARIA2_BIN = "C:\Tools\aria2\aria2c.exe"
pnpm install --frozen-lockfile
pnpm contracts:check
pnpm prepare:aria2
pnpm dev
```

Replace `ARIA2_BIN` with your actual executable path. The first build can take several minutes. Keep the desktop window open and set its default download directory to a test folder. Closing the app pauses its downloads. `pnpm dev:web` is only a UI preview and cannot receive extension downloads.

Close any installed Download It instance before starting the development app. Both use the same per-user application data directory. This version upgrades SQLite to schema 3 (browser handoffs and diagnostics); older builds cannot reopen that database. Preserve a copy of the application data directory before testing if you need to return to an older build, or use a separate Windows test account.

The existing `tooling/binaries/windows.ps1` is intended for CI, where `RUNNER_TEMP` and `GITHUB_ENV` are set; it is not the local installer.

## Build and load the extension

In another Windows PowerShell terminal at the repository root:

```powershell
pnpm browser:build
```

This builds `apps/browser-extension/dist` and `target/debug/download-it-native-host.exe`. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, click **Load unpacked**, and select `apps/browser-extension/dist`. Copy the extension ID displayed by each browser.

```powershell
pnpm browser:register --chrome-id "<Chrome extension ID>" --edge-id "<Edge extension ID>"
```

Replace the placeholders; omit the unused browser flag if testing only one. Registration uses the current user's registry and does not require administrator privileges. Its manifest lives at `%LOCALAPPDATA%\DownloadIt\BrowserIntegration\development\host.json`; it allows only the registered IDs and points at the debug executable in your checkout. Register again after moving the checkout or changing extension IDs.

Open the extension popup. It should say **Desktop app connected**. Test a pasted direct URL or right-click a link and choose **Download with Download It**. The desktop app's default destination is used.

Automatic capture is initially off. Enable it in the popup and grant the requested download and HTTP/HTTPS site permissions. Exclusions accept comma- or whitespace-separated domain names and include their subdomains. Turning capture off stops new handoffs; already pending handoffs still reconcile. Previously granted permissions remain until revoked in browser settings.

Re-run `pnpm browser:build` and click **Reload** on the extensions page after changes. Tauri development mode rebuilds desktop Rust changes. Stop browser handoffs before rebuilding the native host, since Windows can lock a running executable.

## Local test fixture

```powershell
pnpm browser:test-fixture
```

Open `http://127.0.0.1:8765`. It serves generated data only, with direct, redirected, expired, login-page, unverified, POST, and blob examples. The page displays the expected SHA-256 for the direct file:

```powershell
Get-FileHash "C:\YourTestDownloads\download-it-fixture.bin" -Algorithm SHA256
```

Check these flows in both Chrome and Edge:

- Capture off: normal browser downloads work. Manual context-menu and popup submissions work.
- Capture on: the direct file and redirect create one desktop job; the browser transfer is cancelled only after the desktop confirms ownership. The file checksum matches the fixture.
- App closed: the extension reports **Download It is not running. Open it to capture downloads.** The browser continues. Open the app yourself; subsequent downloads can be captured. Existing browser downloads are not retroactively captured.
- Exclude `127.0.0.1`: automatic transfers stay in the browser. Remove the exclusion for subsequent tests.
- POST, blob, login-page and unverifiable files stay in the browser. Very fast files can finish before capture and remain there too. Automatic capture requires matching size, MIME type and usable source validators; manual submissions support more direct URLs.
- During a handoff, reload the extension or close the app. Use **Check pending handoffs** after reopening it. Prepared transfers fall back; accepted transfers reconcile to the same desktop job. A lost commit reply leaves the browser paused until ownership can be confirmed.
- A failed browser resume/cancel retains its pending record. Check browser Downloads and the desktop queue before retrying. If an engine operation remains uncertain, restart the desktop app so its normal recovery can restore the durable job as paused.
- If you manually resume the browser transfer during a handoff and both transfers finish, check for duplicate files. Cancel an unneeded desktop job and clear that completed browser download's history entry, then check pending handoffs again. The extension never deletes completed files.

Request IDs and browser download IDs are retained for recovery. Raw download URLs are not stored in extension local storage or diagnostics. Network observations stay briefly in service-worker memory. Desktop handoff records contain source URLs in the existing per-user SQLite database; signed URLs remain sensitive. Cookies, authorization headers, request bodies, and the aria2 RPC secret are never sent to the extension.

## Automated checks and removal

```powershell
pnpm check
pnpm contracts:check
pnpm test
pnpm test:release
pnpm build
pnpm browser:build
cargo test --locked
cargo clippy --all-targets -- -D warnings
node tests/rust/run-transfers.mjs
```

Real transfer tests require `ARIA2_BIN`. Windows Rust tests also exercise pipe framing and exclusive listener creation. CI builds and tests the extension and runs Rust tests on its native OS matrix; interactive browser installation remains a manual smoke test.

```powershell
pnpm browser:unregister
```

Then remove the unpacked extension in the browser. Removal only targets this development host registration; it preserves desktop downloads and unrelated browser registrations. Resolve pending handoffs before unregistering.

This release uses an unpacked extension and development bridge. Browser-store publication, production installer registration, Firefox, Linux/macOS bridges, authenticated downloads, and app auto-launch are not included.
