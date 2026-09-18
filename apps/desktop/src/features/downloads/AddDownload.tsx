import { useEffect, useRef, useState } from 'react';
import { ArrowDown, FolderOpen, Link2, X } from 'lucide-react';
import type { AddDownloadRequest } from '@dm/contracts';
import { Button } from '../../components/ui/button';
import { client, errorMessage } from '../../services/download-client';

export function AddDownload({
  directory,
  busy,
  externalError,
  onClose,
  onAdd,
}: {
  directory: string;
  busy: boolean;
  externalError: string | null;
  onClose: () => void;
  onAdd: (request: AddDownloadRequest) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState('');
  const [destination, setDestination] = useState(directory);
  const [filename, setFilename] = useState('');
  const [checksum, setChecksum] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      setError('Enter a valid HTTP or HTTPS link.');
      return;
    }
    setError(null);
    if (
      await onAdd({
        url: url.trim(),
        destination,
        filename: filename.trim() || null,
        expectedSha256: checksum.trim() || null,
      })
    )
      onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div className="dialog-icon">
            <ArrowDown size={24} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </div>
        <h2>New download</h2>
        <p className="muted">One link. All your connections working together.</p>
        <label htmlFor="download-url">File URL</label>
        <div className="input-icon">
          <Link2 size={17} />
          <input
            id="download-url"
            autoFocus
            required
            type="url"
            placeholder="https://example.com/file.zip"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <label htmlFor="download-folder">Save to</label>
        <div className="input-action">
          <input
            id="download-folder"
            required
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Choose a download folder"
          />
          <Button
            variant="outline"
            type="button"
            aria-label="Choose folder"
            onClick={async () => {
              try {
                const path = await client.chooseDirectory();
                if (path) setDestination(path);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            <FolderOpen size={17} />
          </Button>
        </div>
        <label htmlFor="download-name">
          Filename <span className="muted">(optional)</span>
        </label>
        <input
          id="download-name"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="Use the original filename"
        />
        <details>
          <summary>Verify with a checksum</summary>
          <label htmlFor="download-checksum">Expected SHA-256</label>
          <input
            id="download-checksum"
            value={checksum}
            onChange={(e) => setChecksum(e.target.value)}
            placeholder="64-character SHA-256 hash"
            pattern="[a-fA-F0-9]{64}"
          />
        </details>
        {(error || externalError) && (
          <p role="alert" className="inline-error">
            {error || externalError}
          </p>
        )}
        <div className="dialog-footer">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} type="submit">
            <ArrowDown size={16} />
            {busy ? 'Starting…' : 'Start download'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
