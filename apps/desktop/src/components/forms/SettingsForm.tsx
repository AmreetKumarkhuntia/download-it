import type { SettingsDraft } from '../../types/workspace';
import { Button } from '../ui/button';
import { Card } from '../cards/Card';

export function SettingsForm({
  value,
  busy,
  saved,
  error,
  limits,
  onChange,
  onSubmit,
  onChooseDirectory,
}: {
  value: SettingsDraft;
  busy: boolean;
  saved: boolean;
  error: string | null;
  limits: { active: { min: number; max: number }; connections: { min: number; max: number } };
  onChange: (patch: Partial<SettingsDraft>) => void;
  onSubmit: () => void;
  onChooseDirectory: () => void;
}) {
  return (
    <Card
      as="form"
      className="settings-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h2>Make it your own</h2>
      <p className="muted">Changes to connections apply to new or resumed downloads.</p>
      <label htmlFor="max-active">Simultaneous downloads</label>
      <input
        id="max-active"
        type="number"
        min={limits.active.min}
        max={limits.active.max}
        required
        value={value.maxActiveDownloads}
        onChange={(e) => onChange({ maxActiveDownloads: Number(e.target.value) })}
      />
      <label htmlFor="connections">Connections per download</label>
      <input
        id="connections"
        type="number"
        min={limits.connections.min}
        max={limits.connections.max}
        required
        value={value.connectionsPerDownload}
        onChange={(e) => onChange({ connectionsPerDownload: Number(e.target.value) })}
      />
      <p className="field-help">
        More connections can be slower on servers that limit parallel requests. Compare 1, 4 and 8
        connections, then pause and resume to apply each change.
      </p>
      <label htmlFor="speed-limit">Total speed limit (KB/s)</label>
      <input
        id="speed-limit"
        type="number"
        min={0}
        required
        value={value.speedLimitKib}
        onChange={(e) => onChange({ speedLimitKib: Number(e.target.value) })}
      />
      <p className="field-help">Set to 0 for unlimited speed.</p>
      <label htmlFor="default-folder">Default download folder</label>
      <div className="input-action">
        <input
          id="default-folder"
          value={value.defaultDirectory}
          onChange={(e) => onChange({ defaultDirectory: e.target.value })}
        />
        <Button type="button" variant="outline" onClick={onChooseDirectory}>
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
    </Card>
  );
}
