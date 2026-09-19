# Architecture

## Dependency direction

```text
React pages → widgets → frontend services/client → Tauri commands
                ↓                                      ↓
            components                        application services → domain
                                                       ↓ interfaces
                                          aria2 / SQLite / filesystem / process
```

The desktop bootstrap is the composition root. It is the only place that constructs concrete services and connects them. The Rust workspace enforces crate boundaries; `tooling/check-boundaries.mjs` rejects infrastructure dependencies in domain/application/contracts and enforces frontend layer ownership, client isolation and centralized test placement. See [frontend structure](frontend.md) for the renderer's components, widgets, services and styling conventions.

## Ownership

| Module               | Owns                                                                    | Does not own                          |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------- |
| domain               | Job identity, state, metadata, settings, errors                         | Persistence, UI, transport            |
| application/services | Download lifecycle, recovery, verification orchestration                | SQL, HTTP/RPC payloads, OS commands   |
| application/ports    | DownloadEngine, SourceProbe, repositories, FileStore, ProcessSupervisor | Implementations                       |
| services/aria2       | aria2 protocol, source metadata probe, normalized failures              | UI and application records            |
| services/sqlite      | Dedicated DB worker, SQL, schema version, migrations                    | Engine progress files                 |
| services/filesystem  | Staging, checksums, atomic publication, cleanup                         | Queue policy                          |
| services/process     | Fixed aria2 executable lifecycle and private RPC configuration          | Download commands                     |
| contracts            | Transport DTOs and generated TypeScript definitions                     | SQL row structure, signed source URLs |
| apps/desktop         | Composition, lifecycle, UI, folder picker                               | Download algorithms                   |

Service means an independently testable local module, not an HTTP microservice. Shared code is kept only where it has a clear owner. Do not add miscellaneous helpers to domain just to make them globally accessible.

## State and recovery

Jobs are persisted before being queued in aria2. A stable application ID maps to an aria2 GID. Application mutations and polling are serialized so pause/cancel and completion do not race. SQLite writes run on a dedicated thread with WAL and FULL synchronization. aria2 owns piece accounting and periodically persists `.aria2` control files; the application does not reconstruct downloaded ranges from byte counts.

Startup marks interrupted jobs paused and retries interrupted finalizations. Resume probes the source before reusing bytes; strong ETags or a matching modification date plus size must match. New engine requests carry an applicable conditional header. Restart explicitly discards incomplete data. No automatic restart silently consumes additional bandwidth.

Completion verifies length and optional SHA-256, records the intended final path, atomically creates a hard link without replacing files, commits completion, then removes staging. A crash between publication and commit is recognized by file identity. A collision created after name selection fails safely and retains staging.

## Interfaces

Desktop commands: list_downloads, add_download, pause_download, resume_download (explicit restart flag), cancel_download, get_settings, update_settings, get_engine_health, get_download_details and get_diagnostics. Events: downloads-changed and engine-health. These are internal v0.1 contracts. Engine health is independent of saved job data; live telemetry failures do not remove stored source metadata or diagnostic events.

Browser protocol v1 exposes hello, prepare, commit, abort, and status through request IDs. The Windows native host transports bounded, length-prefixed JSON over stdio and a current-user-only named pipe. The desktop remains the sole owner of the database and download engine. Prepared handoffs expire after 30 seconds without enqueueing; commit atomically persists ownership and a job before contacting aria2. Idempotent retries return that job. Failed engine submissions return ownership only after confirmed removal; uncertain submissions remain committing until desktop restart recovers them as paused jobs. SQLite migration 2 adds handoff records without changing existing job payloads. Existing source metadata gains an optional MIME type with a default for older records.

Internal jobs include URLs and source validators. JobView includes display and progress data only. u64 byte counts are serialized to TypeScript numbers; supported sizes remain below JavaScript's 2^53 exact-integer limit. The UI supports values above 4 GB without 32-bit truncation.

## Security and process boundaries

Only the backend receives the engine secret. aria2 binds loopback, requires a randomly generated token, disables permissive RPC origins, validates TLS, and receives no executable input from the renderer. It is launched with argument arrays, no shell interpolation, and a private temporary configuration. `stop-with-process` and kill-on-drop limit orphaned processes. The application enforces a single instance to avoid simultaneous ownership of the database and staging files.

Source metadata probes use a bounded Range GET, since signed URLs can reject HEAD. Response bodies are not buffered. The desktop shell owns only explicitly declared native permissions; frontend code cannot request arbitrary commands or SQL.
