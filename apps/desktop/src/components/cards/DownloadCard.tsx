import type { CSSProperties } from 'react';
import { Archive, Check, File, Film, Info, Music, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { DownloadAction, DownloadCardModel } from '../../types/workspace';
import { Button } from '../ui/button';
import { Card } from './Card';

const icons = { archive: Archive, film: Film, music: Music, file: File };
export function DownloadCard({
  model,
  busy,
  onAction,
  onDetails,
}: {
  model: DownloadCardModel;
  busy: boolean;
  onAction: (action: DownloadAction, id: string) => void;
  onDetails: (id: string) => void;
}) {
  const Icon = icons[model.icon];
  return (
    <Card as="article" className={`download-card ${model.complete ? 'is-complete' : ''}`}>
      <div className="file-icon">
        <Icon className="icon icon-lg" />
      </div>
      <div className="download-main">
        <div className="download-title">
          <h3 title={model.filename}>{model.filename}</h3>
          <span className={`status status-${model.status}`}>
            {model.complete && <Check className="icon icon-xs" />} {model.status}
          </span>
        </div>
        <p className="download-source">
          {model.sourceHost}
          <span>·</span>
          {model.size}
        </p>
        {!model.complete && (
          <div
            className={`progress-track ${model.indeterminate ? 'indeterminate' : ''}`}
            role="progressbar"
            aria-label={`${model.filename} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={model.percent ?? undefined}
          >
            <div style={{ '--progress': `${model.percent ?? 0}%` } as CSSProperties} />
          </div>
        )}
        <div className="download-meta">
          {model.complete ? (
            <span title={model.destination}>Saved to {model.destination}</span>
          ) : (
            <>
              <span>{model.downloaded}</span>
              <span>{model.speed}</span>
            </>
          )}
        </div>
        {model.error && <p className="inline-error">{model.error}</p>}
        {model.live && (
          <button
            className="connection-count connection-button"
            onClick={() => onDetails(model.id)}
          >
            {model.connections} · View details
          </button>
        )}
      </div>
      <div className="download-actions">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Details for ${model.filename}`}
          onClick={() => onDetails(model.id)}
        >
          <Info className="icon" />
        </Button>
        {model.live && (
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={`Pause ${model.filename}`}
            onClick={() => onAction('pause', model.id)}
          >
            <Pause className="icon" />
          </Button>
        )}
        {model.canResume && (
          <>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Resume ${model.filename}`}
              onClick={() => onAction('resume', model.id)}
            >
              <Play className="icon" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Restart ${model.filename}`}
              onClick={() => onAction('restart', model.id)}
            >
              <RotateCcw className="icon" />
            </Button>
          </>
        )}
        {model.live && (
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={`Cancel ${model.filename}`}
            onClick={() => onAction('cancel', model.id)}
          >
            <X className="icon" />
          </Button>
        )}
      </div>
    </Card>
  );
}
