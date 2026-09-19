import { ArrowDown, FolderOpen, Link2, X } from 'lucide-react';
import type { DownloadDraft } from '../../types/workspace';
import { Button } from '../ui/button';
import { Dialog } from '../dialogs/Dialog';

export function AddDownloadForm({
  value,
  busy,
  error,
  onChange,
  onSubmit,
  onChooseDirectory,
  onClose,
}: {
  value: DownloadDraft;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<DownloadDraft>) => void;
  onSubmit: () => void;
  onChooseDirectory: () => void;
  onClose: () => void;
}) {
  const { url, destination, filename, checksum } = value;
  return (
    <Dialog label="New download" busy={busy} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="dialog-heading">
          <div className="dialog-icon">
            <ArrowDown className="icon icon-xl" />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X className="icon icon-nav" />
          </Button>
        </div>
        <h2>New download</h2>
        <p className="muted">One link. All your connections working together.</p>
        <label htmlFor="download-url">File URL</label>
        <div className="input-icon">
          <Link2 className="icon icon-base" />
          <input
            id="download-url"
            autoFocus
            required
            type="url"
            placeholder="https://example.com/file.zip"
            value={url}
            onChange={(e) => onChange({ url: e.target.value })}
          />
        </div>
        <label htmlFor="download-folder">Save to</label>
        <div className="input-action">
          <input
            id="download-folder"
            required
            value={destination}
            onChange={(e) => onChange({ destination: e.target.value })}
            placeholder="Choose a download folder"
          />
          <Button
            variant="outline"
            type="button"
            aria-label="Choose folder"
            onClick={onChooseDirectory}
          >
            <FolderOpen className="icon icon-base" />
          </Button>
        </div>
        <label htmlFor="download-name">
          Filename <span className="muted">(optional)</span>
        </label>
        <input
          id="download-name"
          value={filename}
          onChange={(e) => onChange({ filename: e.target.value })}
          placeholder="Use the original filename"
        />
        <details>
          <summary>Verify with a checksum</summary>
          <label htmlFor="download-checksum">Expected SHA-256</label>
          <input
            id="download-checksum"
            value={checksum}
            onChange={(e) => onChange({ checksum: e.target.value })}
            placeholder="64-character SHA-256 hash"
            pattern="[a-fA-F0-9]{64}"
          />
        </details>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} type="submit">
            <ArrowDown className="icon icon-md" />
            {busy ? 'Starting…' : 'Start download'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
