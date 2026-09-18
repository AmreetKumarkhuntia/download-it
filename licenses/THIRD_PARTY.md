# Third-party components

Download It's original source is MIT licensed. This does not relicense bundled dependencies.

## aria2 1.37.0

Copyright (C) 2006, 2019 Tatsuhiro Tsujikawa and contributors.
License: GPL-2.0-or-later. See `GPL-2.0.txt`.
Source: https://github.com/aria2/aria2/releases/tag/release-1.37.0
Build documentation: https://aria2.github.io/manual/en/html/README.html

aria2 runs as an independent executable and is controlled through its existing JSON-RPC interface. No aria2 code is linked into the application. The shipped executable's version, platform, and checksum are recorded in `aria2-manifest.json`.

## Other dependencies

Rust dependencies and versions are recorded in Cargo.lock; JavaScript dependencies and versions are recorded in pnpm-lock.yaml. React, Tauri, Tailwind CSS, Radix UI, lucide, SQLite bindings, and their transitive dependencies retain their respective licenses. The Button component follows shadcn/ui's MIT-licensed composition pattern.

## Windows releases

The Windows release workflow verifies the official standalone binary archive hash and preserves its upstream notices in `licenses/aria2-windows/`. The companion release ZIP contains pinned aria2 and dependency source archives, their hashes, and the upstream `Dockerfile.mingw` / `mingw-config` build recipes. The dependency archives retain their own license files. These files must stay available alongside the binary release; retain them when redistributing.

## Additional platforms

Binary publication requires collecting licenses and corresponding source (including distribution patches and build scripts) for the exact aria2 binary and every bundled library, and publishing them alongside the installers. A link to upstream master is not a substitute for corresponding source. Linux system aria2 builds and macOS Homebrew builds can include additional LGPL/GPL libraries. Do not publish those libraries with only this summary notice. Automated publication currently covers Windows only.

Run `pnpm prepare:aria2` on each target platform, audit its manifest and dependency list, retain the binary/source hashes, and follow docs/architecture/releases.md.
