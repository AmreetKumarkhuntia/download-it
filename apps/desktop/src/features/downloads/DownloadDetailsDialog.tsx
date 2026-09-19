import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { client } from '../../services/download-client';
import { bytes } from './format';
import { DiagnosticsPanel, dateTime } from './DiagnosticsPanel';
import { usePolling } from './use-polling';

export function DownloadDetailsDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(() => client.details(id), [id]);
  const { data, error } = usePolling(load);
  const [logsOpen, setLogsOpen] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const transfer = data?.transfer;
  const stale = !!error || !!data?.telemetryError;
  const fields = data
    ? [
        ['Source URL', data.sourceUrl],
        ['Resolved URL at last source check', data.effectiveUrl ?? 'Not recorded'],
        ['Destination', data.job.finalPath ?? data.job.destination],
        ['File type', data.contentType ?? 'Not supplied'],
        [
          'Total size',
          data.job.totalBytes === null
            ? 'Unknown'
            : `${bytes(data.job.totalBytes)} (${data.job.totalBytes.toLocaleString()} bytes)`,
        ],
        ['Downloaded', bytes(data.job.downloadedBytes)],
        [
          'Byte ranges',
          data.rangeSupported === null
            ? 'Not recorded'
            : data.rangeSupported
              ? 'Supported at last source check'
              : 'Server did not honor the range request',
        ],
        [
          'Resume validation',
          data.resumeValidator
            ? 'Validator available; checked again on resume'
            : 'No reliable validator; partial downloads may require Restart',
        ],
        ['ETag', data.etag ?? 'Not supplied'],
        ['Last modified', data.lastModified ?? 'Not supplied'],
        ['Expected SHA-256', data.expectedSha256 ?? 'Not set'],
        ['Added', dateTime(data.job.createdAt)],
        ['Download ID', data.job.id],
      ]
    : [];
  return (
    <dialog
      ref={dialog}
      className="dialog download-details"
      aria-labelledby="details-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <div className="eyebrow">DOWNLOAD DETAILS</div>
          <h2 id="details-title">{data?.job.filename ?? 'Loading download…'}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close download details">
          <X size={19} />
        </Button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          Details could not refresh: {error}
        </p>
      )}
      {data && (
        <>
          <div className="details-status">
            <span className={`status status-${data.job.status}`}>{data.job.status}</span>
            <span>Updated {dateTime(data.sampledAt)}</span>
          </div>
          {data.telemetryError && (
            <p className="inline-error" role="alert">
              Live connection data is unavailable. {data.telemetryError.message} Saved metadata
              remains available.
            </p>
          )}
          {data.job.error && (
            <p className="inline-error">
              {data.job.error.code}: {data.job.error.message}
            </p>
          )}
          <section className="parallel-section" aria-labelledby="parallel-title">
            <h3 id="parallel-title">
              <Activity size={17} /> Parallel connections
            </h3>
            <div className="transfer-stats">
              <div>
                <span>Active connections</span>
                <strong>
                  {stale || !transfer ? '—' : transfer.connections}
                  <small>{transfer ? ` / ${transfer.connectionLimit} limit` : ''}</small>
                </strong>
              </div>
              <div>
                <span>Current speed</span>
                <strong>{stale || !transfer ? '—' : `${bytes(transfer.speedBytes)}/s`}</strong>
              </div>
              <div>
                <span>Total speed cap</span>
                <strong>
                  {data.settings.speedLimitBytes
                    ? `${bytes(data.settings.speedLimitBytes)}/s`
                    : 'Unlimited'}
                </strong>
              </div>
            </div>
            <p className="muted">
              {transfer
                ? `This transfer is configured for up to ${transfer.connectionLimit} connections.`
                : `New or resumed transfers use up to ${data.settings.connectionsPerDownload} connections.`}{' '}
              Up to {data.settings.maxActiveDownloads} downloads can run at once. Small files and
              servers without range support may use fewer connections.
            </p>
            {!transfer && !stale && (
              <p className="muted">
                No live engine record for this download. Saved progress and source information are
                shown below.
              </p>
            )}
            {transfer && transfer.pieceCount > 0 && !stale && (
              <div className="piece-section">
                <div className="piece-heading">
                  <strong>
                    {transfer.completedPieces.toLocaleString()} /{' '}
                    {transfer.pieceCount.toLocaleString()} pieces complete
                  </strong>
                  <span>{bytes(transfer.pieceBytes)} per piece</span>
                </div>
                <div
                  className="piece-map"
                  role="img"
                  aria-label={`${transfer.completedPieces} of ${transfer.pieceCount} pieces complete`}
                >
                  {transfer.pieceGroups.map((percent, index) => (
                    <span
                      key={index}
                      title={`Piece group ${index + 1}: ${percent}% complete`}
                      style={{
                        background: `linear-gradient(to right, #2b936a ${percent}%, #e5ece8 ${percent}%)`,
                      }}
                    />
                  ))}
                </div>
                <p className="muted">
                  Green marks completed pieces. Each cell groups a consecutive part of the file; it
                  does not represent a connection.
                </p>
              </div>
            )}
            {!!transfer?.servers.length && !stale && (
              <div className="connection-table-wrap">
                <table className="connection-table">
                  <caption>Connected servers · current snapshot</caption>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Server</th>
                      <th>Speed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfer.servers.map((server, index) => (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{server.server}</td>
                        <td>{bytes(server.speedBytes)}/s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <details className="speed-help">
            <summary>Why might Chrome be faster?</summary>
            <p>
              More connections do not always improve speed. A server may limit parallel requests or
              total bandwidth; other active downloads share your connection and the total speed cap.
              Browser caching, cookies, request headers and network protocols can also change the
              result.
            </p>
            <p>
              Compare the same direct URL, one download at a time, with the speed cap set to
              unlimited. Try 1, 4 and 8 connections in Preferences, then pause and resume to apply
              each change. Compare sustained speeds after the initial connection setup. These
              measurements do not identify server throttling on their own.
            </p>
          </details>
          <section className="source-section">
            <h3>Source & file</h3>
            <p className="muted">
              URL query strings and fragments are hidden because they may contain access tokens.
            </p>
            <dl className="metadata-grid">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <details
            className="download-log"
            onToggle={(event) => setLogsOpen(event.currentTarget.open)}
          >
            <summary>Download log</summary>
            {logsOpen && <DiagnosticsPanel jobId={id} />}
          </details>
        </>
      )}
    </dialog>
  );
}
