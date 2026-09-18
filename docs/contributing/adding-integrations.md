# Adding an integration

1. Define the application capability before choosing a vendor library. Put domain concepts in domain and the required interface in application/ports.
2. Add a concrete service crate under crates/services. Its production dependencies may include application/domain and vendor libraries, but not sibling service crates. Inject small shared infrastructure interfaces where necessary.
3. Keep vendor payloads private. Normalize progress and failures at the adapter boundary. Never expose URLs containing credentials or raw vendor errors to general-purpose logs.
4. Register the implementation in desktop bootstrap. Application services coordinate multi-service operations.
5. Add transport DTOs only when the interface requires them, run pnpm contracts, and implement the typed client in frontend services. UI feature code imports the client and contract types.
6. Add a service contract test and update dependency rules, architecture documentation, and third-party notices.

## Planned adapters

- Browser extension: apps/browser-extension, Native Messaging host, explicit link submission. No access to the engine RPC token. Authenticate/validate the native transport independently.
- Media extraction: a future MediaExtractor port and yt-dlp service. Extraction finds formats and source URLs. It is not ZIP extraction.
- Media processing: a future MediaProcessor port and FFmpeg service; ffprobe inspects streams. Audio/video muxing is separate from ordinary HTTP range assembly.
- Alternative rendering: replace apps/desktop's frontend while retaining application contracts. Business logic must never move into React hooks.
- Alternative engine: implement DownloadEngine and SourceProbe, declare capabilities when multiple engines exist, and run the same transfer contract suite.

Do not create empty plugin registries, remote APIs, or future service crates before a real feature needs them.
