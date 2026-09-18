# Platform builds and releases

## Development build matrix

Windows x64 uses MSVC and WebView2; macOS Intel and Apple Silicon use the matching native Rust target; Linux x64 uses GTK3/WebKitGTK 4.1. Build on the corresponding OS rather than attempting to cross-compile the entire desktop runtime.

`pnpm prepare:aria2` checks the pinned version, copies the executable with Tauri's target suffix, stages its non-system libraries, and records a SHA-256 manifest. Linux libraries are injected only into the child engine's environment. macOS requires dylibbundler to rewrite library references to the app Resources directory. Windows uses the official standalone x64 distribution. Changes to upstream engine versions require updating versions.json and rerunning real-process integration tests.

`pnpm desktop:build` creates the native installers. For a quick compilation check without creating installers, use `pnpm --filter @dm/desktop tauri build --no-bundle`.

## Publication requirements

No automated workflow publishes releases. Before sharing installers:

1. Produce exact corresponding source archives for the bundled aria2 build and any copyleft libraries, including distributor patches, build recipes, and dependency notices. Preserve source and binary hashes. The upstream source URL in the manifest is provenance, not proof that a distribution-patched binary was built from that exact archive.
2. Generate dependency license inventories for both lockfiles and bundled native libraries; include their license texts in the installer resources and release source archive.
3. Run tests and manually smoke-test installation, first launch, folder selection, real download, recovery, and uninstall on each supported target. Test Windows/macOS certificates, proxies, filenames, and dialogs on real target systems.
4. Sign Windows binaries/installers and sign/notarize macOS applications, including nested executables and libraries. Credentials are supplied through the release environment, never committed.
5. Publish SHA-256 checksums and source archives alongside installers. Label unsigned development previews explicitly.

The repository uses manual updates initially. Browser extension registration and automatic updates are future release work.
