# 0001: Local services behind application-owned interfaces

Status: accepted.

The first version is an offline-capable desktop manager for direct file URLs. Reuse aria2's transfer engine as an independent process, and use Tauri for desktop distribution. Rust application services orchestrate the engine, SQLite, and filesystem implementations through ports. Original application source is MIT; aria2 retains its own GPL license.

This keeps the engine replaceable without making the MVP depend on a daemon, cloud account, plugin runtime, or custom networking implementation. The tradeoff is platform-specific executable packaging and upstream engine behavior. The database worker remains local; no SQL is exposed to the renderer.

Media extraction and browser capture are deferred. An integration is added only when it has a concrete workflow and tests.
