import { HardDrive, X } from 'lucide-react';
import { Button } from '../ui/button';

export function PreviewNotice() {
  return (
    <div className="preview-note">
      <HardDrive className="icon" />
      <span>
        You’re viewing the web preview. Open the desktop app to download files to your device.
      </span>
    </div>
  );
}
export function ActionError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <Button variant="ghost" size="icon" aria-label="Dismiss error" onClick={onDismiss}>
        <X className="icon" />
      </Button>
    </div>
  );
}
export function EngineStatus({
  stale,
  title,
  message,
  suggestRestart,
  logError,
  onLogs,
}: {
  stale: boolean;
  title: string;
  message: string;
  suggestRestart: boolean;
  logError: string | null;
  onLogs: () => void;
}) {
  return (
    <div className={`engine-status ${stale ? 'is-stale' : ''}`} role="status">
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {suggestRestart && (
          <p>
            If the connection does not recover, restart the app, then resume your saved downloads.
          </p>
        )}
        {logError && <p className="inline-error">Diagnostic logs could not be saved: {logError}</p>}
      </div>
      <Button variant="ghost" onClick={onLogs}>
        View logs
      </Button>
    </div>
  );
}
