# Platform builds and semantic releases

## Release policy

`master` is the stable release branch. CI validates pushes on all branches and pull requests, but only pushes/manual workflow runs on `master` can publish. The original `main` branch is unchanged and does not publish; maintainers can make `master` the GitHub default branch in repository settings. The release job uses its short-lived `GITHUB_TOKEN` with `contents: write` to push the release commit, tag, and assets. Branch rules must allow that bot to push version commits; if they require a PR for every change, configure an authorized release bot and its token instead. Validation jobs have read-only access.

Commit messages and PR titles must use `feat`, `fix`, `refactor`, `doc`, or `chore`, with optional scopes and breaking-change markers. `commitlint.config.mjs` enforces this list, including `doc` rather than `docs`. CI checks the pushed commit range or PR commits and title; on a new branch it checks commits since `master`, and manual runs check the latest commit. Existing history is not rewritten. Use squash or rebase merges, since an automatically generated `Merge ...` message does not follow this policy. Locally run `pnpm lint:commits --last`, `pnpm lint:commits --from <base> --to HEAD`, or `pnpm lint:commits --edit .git/COMMIT_EDITMSG`.

The first release is **1.0.0**. Thereafter semantic-release reads commits since the last release:

| Commit                                                  | Version change       |
| ------------------------------------------------------- | -------------------- |
| `fix(engine): handle interrupted transfers`             | Patch: 1.0.0 → 1.0.1 |
| `feat(downloads): add scheduling`                       | Minor: 1.0.0 → 1.1.0 |
| `feat(api)!: change download contracts`                 | Major: 1.0.0 → 2.0.0 |
| Any commit with a `BREAKING CHANGE:` footer             | Major                |
| `refactor:`, `doc:`, `chore:` without a breaking change | No release           |

The highest change wins when a push includes multiple commits. Use Conventional Commit titles for squash merges. `release.config.mjs` owns the policy; `tooling/release/` owns version stamping and preparation, while `tooling/packaging/` owns distributable assembly. Releases currently share one version across the desktop app, Rust core/services, and contracts. Those internal crates and JS packages are not separately published to npm or crates.io.

## CI pipeline

1. Validate commit messages/PR titles, formatting, architecture boundaries, generated contracts, frontend tests/build, and release-tooling tests.
2. Run Rust tests, Clippy, real aria2 transfer tests, and desktop compilation on Windows x64, Linux x64, macOS Intel, and macOS Apple Silicon.
3. On `master`, semantic-release determines whether a release is needed. If not, it creates no package, tag, or release.
4. For a release, stamp the version into the Rust workspace and its Cargo.lock entries, desktop, browser-extension and contracts package manifests, and Tauri config. The UI reads the desktop package version at build time; the extension build derives its manifest version from its package.
5. Push `chore(release): X.Y.Z [skip ci]` containing only those versioned manifests and `Cargo.lock`. `@semantic-release/git` runs after version stamping and before installer preparation.
6. From that release commit, verify pinned upstream binary/source hashes, preserve engine notices, and build the Windows NSIS installer. Package the exact application source, upstream engine/dependency sources and recipes, build metadata, and SHA-256 checksums. Build metadata records the release commit SHA.
7. Only after preparation succeeds, tag that same commit `vX.Y.Z` and publish the GitHub Release and every deliverable staged in `release/assets/`. No follow-on tag workflow is needed, and no issue/PR comments or labels are created.

Releases are serialized; a running `master` workflow is not automatically canceled by the next push. Branch protection should require CI and disallow direct unreviewed changes to release workflows.

Version manifests on `master`, the release tag, GitHub's automatic source archive, and the companion source ZIP now share the released version. Installers remain GitHub Release assets; they are never committed to Git. The current workflow continues after creating the version commit: pushes with `GITHUB_TOKEN` do not start another push workflow, and `[skip ci]` also suppresses recursive builds when using a different bot token. Never move or reuse a published version tag.

If validation or packaging fails, no tag has been published. A packaging failure can leave the version commit on `master`; rerun via workflow dispatch on the latest `master`, or pull that commit before pushing a fix. Semantic-release still sees the unreleased changes since the last tag and retries the version; if versions already match, it reuses the existing release commit. If GitHub publishing fails after the tag is pushed, inspect the existing tag/release and recover the missing assets explicitly—rerunning semantic-release does not replay an already tagged release. Do not delete public tags to retry. A subsequent `fix(release): ...` commit can publish a new patch release.

## Published Windows assets

- `Download.It_X.Y.Z_x64-setup.exe` (the exact product filename is generated by Tauri): unsigned Windows x64 NSIS installer, including aria2. WebView2 is bootstrapped if absent and requires internet in that case.
- `download-it-X.Y.Z-windows-x64-with-sources.zip`: the installer plus notices, checksums, build commit/run metadata, version-stamped application source, aria2/dependency source archives, and upstream Windows build recipes.
- `SHA256SUMS.txt`: hashes for the installer and companion ZIP. These detect accidental corruption; they do not replace publisher signing.

Binary assets live under **GitHub Releases**, not an npm registry or GitHub Packages registry. They do not expire like workflow artifacts. Keep the source package available alongside the binary and carry the notices/sources with any redistribution.

## Native builds and extension points

Windows uses MSVC/WebView2 and the official standalone aria2 x64 distribution. Linux uses GTK3/WebKitGTK 4.1. macOS uses its native Intel/Apple Silicon toolchain. Build on the corresponding OS rather than cross-compiling the desktop runtime.

`pnpm prepare:aria2` checks the pinned engine version, copies the executable with Tauri's target suffix, stages its non-system libraries, and records a SHA-256 manifest. Linux libraries are injected only into the child engine's environment; macOS uses dylibbundler to rewrite library references. `pnpm desktop:build` builds native installers locally. `pnpm --filter @dm/desktop tauri build --no-bundle` checks compilation only.

`tooling/release/workspace.mjs` owns platform-independent version stamping; `tooling/release/desktop.mjs` is the current Windows build adapter. Future adapters must build the release commit and stage uniquely named installers, sources, notices, and checksums directly in `release/assets/`. The publisher accepts any extension, including MSI, DMG, AppImage, and deb. Additional native platforms will need jobs on their respective runners, all checking out the same release commit, with their deliverables collected before publishing. Version stamping and the release-commit policy can be reused.

Next release additions:

1. Signed Windows installers and actual install/launch/download/uninstall smoke tests on supported systems. CI currently tests transfers and compilation, not interactive installation.
2. macOS DMG/notarization and Linux AppImage/deb packaging adapters. Audit their exact bundled library sources, distributor patches, and license texts before publishing. Homebrew/distribution binaries cannot reuse the Windows source manifest.
3. Dependency license inventories, release attestations, and protected signing environments.
4. Prerelease channels and automatic updates, with explicit version/signature policy. Browser-extension packaging can be another adapter without changing application services.

Changes to the engine require updating `tooling/binaries/versions.json`, the matching source hashes/build recipes under `tooling/packaging/`, and real-process tests together. The repository uses manual application updates initially.
