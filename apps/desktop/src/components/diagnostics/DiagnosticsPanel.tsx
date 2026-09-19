import { Copy } from 'lucide-react';
import type { DiagnosticRow } from '../../types/workspace';
import { Button } from '../ui/button';

export function DiagnosticsPanel({
  rows,
  error,
  loading,
  loaded,
  scoped,
  errorsOnly,
  copyStatus,
  onErrorsOnly,
  onCopy,
}: {
  rows: DiagnosticRow[];
  error: string | null;
  loading: boolean;
  loaded: boolean;
  scoped: boolean;
  errorsOnly: boolean;
  copyStatus: string;
  onErrorsOnly: (value: boolean) => void;
  onCopy: () => void;
}) {
  return (
    <section className="diagnostics-panel" aria-label="Diagnostic logs">
      <div className="diagnostic-toolbar">
        <label>
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(event) => onErrorsOnly(event.target.checked)}
          />{' '}
          Errors only
        </label>
        <Button variant="outline" disabled={!rows.length} onClick={onCopy}>
          <Copy className="icon icon-sm" /> Copy logs
        </Button>
      </div>
      <p className="muted diagnostic-note">
        Saved locally across restarts. Showing up to 500 recent events; the latest 1,000 are
        retained. URLs and request headers are excluded.
      </p>
      {copyStatus && (
        <p role="status" className="muted">
          {copyStatus}
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          Cannot refresh logs: {error}
        </p>
      )}
      {loading && <p className="muted">Loading logs…</p>}
      {loaded && !rows.length && (
        <p className="muted">
          No {errorsOnly ? 'error ' : ''}events recorded{scoped ? ' for this download' : ''} yet.
        </p>
      )}
      <ol className="diagnostic-list">
        {rows.map((row) => (
          <li key={row.key} className={`log-${row.level}`}>
            <div>
              <time dateTime={row.isoTime}>{row.time}</time>
              <span className="log-level">{row.level}</span>
              <strong>{row.event}</strong>
            </div>
            <p>{row.message}</p>
            {row.jobId && <code>Download {row.jobId}</code>}
          </li>
        ))}
      </ol>
    </section>
  );
}
