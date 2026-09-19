import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { DownloadDetailsModel } from '../../types/workspace';
import { Button } from '../ui/button';
import { TransferDetails } from '../downloads/TransferDetails';
import { SourceMetadata } from '../downloads/SourceMetadata';
import { SpeedHelp } from '../downloads/SpeedHelp';
import { Dialog } from './Dialog';

export function DownloadDetailsDialog({
  model,
  error,
  logsOpen,
  onLogsToggle,
  logs,
  onClose,
}: {
  model: DownloadDetailsModel | null;
  error: string | null;
  logsOpen: boolean;
  onLogsToggle: (open: boolean) => void;
  logs: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog
      className="download-details"
      label={model?.filename ?? 'Loading download…'}
      onClose={onClose}
    >
      <div className="dialog-heading">
        <div>
          <div className="eyebrow">DOWNLOAD DETAILS</div>
          <h2>{model?.filename ?? 'Loading download…'}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close download details">
          <X className="icon" />
        </Button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          Details could not refresh: {error}
        </p>
      )}
      {model && (
        <>
          <div className="details-status">
            <span className={`status status-${model.status}`}>{model.status}</span>
            <span>Updated {model.updated}</span>
          </div>
          {model.telemetryError && (
            <p className="inline-error" role="alert">
              Live connection data is unavailable. {model.telemetryError} Saved metadata remains
              available.
            </p>
          )}
          {model.error && <p className="inline-error">{model.error}</p>}
          <TransferDetails model={model.transfer} />
          <SpeedHelp />
          <SourceMetadata fields={model.fields} />
          <details
            className="download-log"
            open={logsOpen}
            onToggle={(event) => onLogsToggle(event.currentTarget.open)}
          >
            <summary>Download log</summary>
            {logs}
          </details>
        </>
      )}
    </Dialog>
  );
}
