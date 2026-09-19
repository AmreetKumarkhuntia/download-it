import { Button } from '../ui/button';
import { Dialog } from './Dialog';
export function RestartDialog({
  filename,
  busy,
  onClose,
  onConfirm,
}: {
  filename: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog label="Restart this download?" busy={busy} onClose={onClose}>
      <h2>Restart this download?</h2>
      <p className="muted">
        The incomplete data for {filename} will be discarded and downloaded again. Existing
        completed files are kept.
      </p>
      <div className="dialog-footer">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Keep progress
        </Button>
        <Button variant="danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Restarting…' : 'Restart download'}
        </Button>
      </div>
    </Dialog>
  );
}
