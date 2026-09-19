import { Archive, Check, File, Film, Info, Music, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { JobView } from '@dm/contracts';
import { Button } from '../../components/ui/button';
import { bytes, eta } from './format';

export function DownloadCard({
  job,
  busy,
  onAction,
  onDetails,
  stale = false,
}: {
  job: JobView;
  busy: boolean;
  onAction: (action: 'pause' | 'resume' | 'restart' | 'cancel', job: JobView) => void;
  onDetails: (job: JobView) => void;
  stale?: boolean;
}) {
  const live = ['downloading', 'queued'].includes(job.status);
  const complete = job.status === 'completed';
  const percent = job.totalBytes
    ? Math.min(100, (job.downloadedBytes / job.totalBytes) * 100)
    : complete
      ? 100
      : 0;
  const extension = job.filename.split('.').pop()?.toLowerCase() ?? '';
  const Icon = ['zip', 'gz', '7z', 'rar', 'iso'].includes(extension)
    ? Archive
    : ['mp4', 'mkv', 'mov'].includes(extension)
      ? Film
      : ['mp3', 'wav', 'flac'].includes(extension)
        ? Music
        : File;
  return (
    <article className={`download-card ${complete ? 'is-complete' : ''}`}>
      <div className="file-icon">
        <Icon size={22} />
      </div>
      <div className="download-main">
        <div className="download-title">
          <h3 title={job.filename}>{job.filename}</h3>
          <span className={`status status-${job.status}`}>
            {complete && <Check size={12} />} {job.status}
          </span>
        </div>
        <p className="download-source">
          {job.sourceHost}
          <span>·</span>
          {bytes(job.totalBytes)}
        </p>
        {!complete && (
          <div
            className={`progress-track ${job.totalBytes === null && live ? 'indeterminate' : ''}`}
            role="progressbar"
            aria-label={`${job.filename} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.totalBytes === null ? undefined : Math.round(percent)}
          >
            <div style={{ width: `${percent}%` }} />
          </div>
        )}
        <div className="download-meta">
          {complete ? (
            <span title={job.finalPath ?? job.destination}>
              Saved to {job.finalPath ?? job.destination}
            </span>
          ) : (
            <>
              <span>
                {bytes(job.downloadedBytes)} downloaded
                {job.totalBytes !== null && ` · ${percent.toFixed(0)}%`}
              </span>
              <span>
                {live && stale
                  ? 'Waiting for live status…'
                  : live
                    ? `${bytes(job.speedBytes)}/s · ${eta(job.etaSeconds)}`
                    : job.status === 'verifying'
                      ? 'Verifying file…'
                      : 'Progress saved'}
              </span>
            </>
          )}
        </div>
        {job.error && <p className="inline-error">{job.error.message}</p>}
        {live && (
          <button className="connection-count connection-button" onClick={() => onDetails(job)}>
            {stale ? 'Last known progress' : `${job.connections} active connections`} · View details
          </button>
        )}
      </div>
      <div className="download-actions">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Details for ${job.filename}`}
          onClick={() => onDetails(job)}
        >
          <Info size={17} />
        </Button>
        {live ? (
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={`Pause ${job.filename}`}
            onClick={() => onAction('pause', job)}
          >
            <Pause size={17} />
          </Button>
        ) : (
          !complete &&
          job.status !== 'verifying' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`Resume ${job.filename}`}
                onClick={() => onAction('resume', job)}
              >
                <Play size={17} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`Restart ${job.filename}`}
                onClick={() => onAction('restart', job)}
              >
                <RotateCcw size={16} />
              </Button>
            </>
          )
        )}
        {live && (
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={`Cancel ${job.filename}`}
            onClick={() => onAction('cancel', job)}
          >
            <X size={17} />
          </Button>
        )}
      </div>
    </article>
  );
}
