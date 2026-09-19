import { useCallback, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { client, errorMessage } from '../../services/download-client';
import { usePolling } from './use-polling';

export function dateTime(value: string | null) {
  return value ? new Date(Number(value) * 1000).toLocaleString() : 'Not yet checked';
}

export function DiagnosticsPanel({ jobId = null }: { jobId?: string | null }) {
  const load = useCallback(() => client.diagnostics(jobId), [jobId]);
  const { data, error } = usePolling(load, 3000);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const events = data?.filter((e) => !errorsOnly || e.level === 'error') ?? [];
  return (
    <section className="diagnostics-panel" aria-label="Diagnostic logs">
      <div className="diagnostic-toolbar">
        <label>
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
          />{' '}
          Errors only
        </label>
        <Button
          variant="outline"
          disabled={!events.length}
          onClick={async () => {
            try {
              await client.copyText(
                events
                  .map(
                    (e) =>
                      `${new Date(Number(e.timestamp) * 1000).toISOString()} [${e.level}] ${e.event}${e.jobId ? ` (${e.jobId})` : ''}: ${e.message}`,
                  )
                  .join('\n'),
              );
              setCopyStatus('Copied logs');
            } catch (e) {
              setCopyStatus(errorMessage(e));
            }
          }}
        >
          <Copy size={14} /> Copy logs
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
      {!data && !error && <p className="muted">Loading logs…</p>}
      {data && !events.length && (
        <p className="muted">
          No {errorsOnly ? 'error ' : ''}events recorded{jobId ? ' for this download' : ''} yet.
        </p>
      )}
      <ol className="diagnostic-list">
        {events.map((event, index) => (
          <li key={`${event.timestamp}-${index}`} className={`log-${event.level}`}>
            <div>
              <time dateTime={new Date(Number(event.timestamp) * 1000).toISOString()}>
                {dateTime(event.timestamp)}
              </time>
              <span className="log-level">{event.level}</span>
              <strong>{event.event}</strong>
            </div>
            <p>{event.message}</p>
            {event.jobId && !jobId && <code>Download {event.jobId}</code>}
          </li>
        ))}
      </ol>
    </section>
  );
}
