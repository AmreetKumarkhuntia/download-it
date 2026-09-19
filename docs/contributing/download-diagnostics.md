# Download details and diagnostics

Run `pnpm dev` after the setup in the README. `pnpm dev:web` is a visual preview; it does not start aria2 or provide live transfers.

Every download, including completed and paused entries, has an information button. Active downloads also have a **View details** link next to their connection count. The view refreshes every two seconds while open and shows:

- Active connections and the connection limit attached to that transfer, which can differ from newly saved preferences.
- Current speed, the shared global speed cap, and origins/speeds reported by aria2's `getServers` method. Server entries are snapshots, not stable connection identifiers.
- Completed pieces, piece size and up to 120 consecutive groups of pieces. Green indicates completed data, not which connection owns a piece.
- Original and last probed resolved source URLs, MIME type, byte-range support, ETag, Last-Modified, expected checksum, destination, size, added time and download ID. Query strings, fragments and embedded credentials are excluded from displayed URLs. Range and source metadata describe the last source check, not every ongoing response.

The global health banner checks the engine even with no active downloads. A timeout no longer leaves a permanent warning after recovery. While updates are unavailable, cards show saved progress and withhold stale speed/connection readings. The list can remain populated because it comes from SQLite. An engine outage does not prove the transfers stopped; it means the app cannot currently query them. If repeated retries do not recover, restart the app and resume the saved downloads.

## Logs

Open **Diagnostics** for engine startup, poll failures/recovery, settings changes, failed desktop actions and download state changes. Open **Download log** inside details to filter by download ID. Logs survive restarts in the `diagnostics` table of `downloads.sqlite` in Tauri's per-user application data directory. The latest 1,000 events are retained globally; each view returns the most recent 500, newest first. Repeated identical poll failures produce one event until the failure changes or the engine recovers. **Copy logs** copies the currently displayed, filtered records.

These are structured application logs. URLs, tokens, headers, filenames and raw engine stderr are excluded; arbitrary raw errors are not written. Download failures include a safe error category. The live details view and card provide the actionable error message. Startup and RPC failures include safe reason text such as timeout versus connection failure. A log-write failure appears in the engine banner.

Schema 3 adds diagnostic storage without changing existing download records. Older builds cannot open this newer database. New metadata fields are optional, so older downloads display “Not recorded” until a source check on resume.

## Comparing speed with Chrome

Eight requested connections do not guarantee eight useful connections or higher throughput. aria2 uses both the split setting and per-server limit, and this app requests a minimum split size of 1 MiB. Small files, range support and server policies affect the actual count. See the [aria2 options and RPC reference](https://aria2.github.io/manual/en/html/aria2c.html).

To make the comparison useful:

1. Use the same large direct file URL and destination disk, and download one copy at a time. Do not run Chrome and Download It concurrently for the comparison.
2. Set the total speed limit to 0 (unlimited), pause other downloads and compare sustained transfer speed after connection setup. Compare equivalent units; timing from click to completion also includes source validation and final file verification.
3. Try 1, 4 and 8 connections in Preferences. Pause/resume to apply the new limit; a fresh download is needed if the source cannot be safely resumed. Record the actual connection count, server origins and speeds from details.
4. Record repeated failures from Diagnostics. For a browser-only authenticated or expiring link, keep the transfer in Chrome rather than copying cookies into logs.

A speed difference by itself does not identify a cause. Browser caching, cookies/headers, proxy routing and protocol support can make requests behave differently. Server throttling and disk/network contention also need measurements; the app does not claim to detect them automatically.

## Local verification

Run `pnpm browser:test-fixture` and download `http://127.0.0.1:8765/file` (or use a large direct URL) through the desktop app. Confirm that details shows range support and actual connection/piece values. Open the completed download again to check its metadata and log. For outage testing, stop only the development aria2 child process in a disposable test session: the banner should change while saved downloads stay visible; Diagnostics should show the failed method and reason. Restart the app to recover and resume.

Automated coverage includes health failure/recovery with no live jobs, stale frontend readings, metadata availability during an outage, bounded persistent log retention, URL redaction, piece bitmap decoding and real aria2 connection telemetry. Run `pnpm test`, `cargo test`, and the real transfer tests documented in the README.
