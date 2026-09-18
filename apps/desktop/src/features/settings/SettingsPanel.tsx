import { useState } from 'react';
import type { Settings } from '@dm/contracts';
import { Button } from '../../components/ui/button';
import { client, errorMessage } from '../../services/download-client';

export function SettingsPanel({
  settings,
  busy,
  save,
}: {
  settings: Settings;
  busy: boolean;
  save: (settings: Settings) => Promise<boolean>;
}) {
  const [value, setValue] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<Settings>) => {
    setSaved(false);
    setValue((old) => ({ ...old, ...patch }));
  };
  return (
    <form
      className="settings-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(await save(value));
      }}
    >
      <h2>Make it your own</h2>
      <p className="muted">Changes to connections apply to new or resumed downloads.</p>
      <label htmlFor="max-active">Simultaneous downloads</label>
      <input
        id="max-active"
        type="number"
        min={1}
        max={10}
        required
        value={value.maxActiveDownloads}
        onChange={(e) => update({ maxActiveDownloads: Number(e.target.value) })}
      />
      <label htmlFor="connections">Connections per download</label>
      <input
        id="connections"
        type="number"
        min={1}
        max={16}
        required
        value={value.connectionsPerDownload}
        onChange={(e) => update({ connectionsPerDownload: Number(e.target.value) })}
      />
      <label htmlFor="speed-limit">Total speed limit (KB/s)</label>
      <input
        id="speed-limit"
        type="number"
        min={0}
        required
        value={Math.round(value.speedLimitBytes / 1024)}
        onChange={(e) => update({ speedLimitBytes: Number(e.target.value) * 1024 })}
      />
      <p className="field-help">Set to 0 for unlimited speed.</p>
      <label htmlFor="default-folder">Default download folder</label>
      <div className="input-action">
        <input
          id="default-folder"
          value={value.defaultDirectory}
          onChange={(e) => update({ defaultDirectory: e.target.value })}
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              const path = await client.chooseDirectory();
              if (path) update({ defaultDirectory: path });
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Browse
        </Button>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="settings-footer">
        <Button disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Save preferences'}
        </Button>
        {saved && <span role="status">Preferences saved</span>}
      </div>
      <div className="settings-note">
        Your downloads and settings stay on this device. Closing the app saves progress and pauses
        downloads.
      </div>
    </form>
  );
}
