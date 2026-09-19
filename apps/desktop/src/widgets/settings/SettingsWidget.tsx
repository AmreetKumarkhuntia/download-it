import type { Settings } from '@dm/contracts';
import { Settings2 } from 'lucide-react';
import { useWorkspace } from '../../services/workspace/context';
import { useSettingsForm } from '../../services/settings/use-settings-form';
import { SettingsForm } from '../../components/forms/SettingsForm';
import { Card } from '../../components/cards/Card';

export function SettingsWidget() {
  const { settings } = useWorkspace();
  return settings ? (
    <SettingsFormWidget settings={settings} />
  ) : (
    <Card className="empty-state">
      <Settings2 className="icon" />
      <h2>Preferences live in the desktop app</h2>
      <p>Launch Download It to choose your download folder and connection limits.</p>
    </Card>
  );
}
function SettingsFormWidget({ settings }: { settings: Settings }) {
  const { saveSettings, busy } = useWorkspace();
  const form = useSettingsForm(settings, saveSettings);
  return (
    <SettingsForm
      value={form.value}
      busy={busy}
      saved={form.saved}
      error={form.error}
      limits={form.limits}
      onChange={form.update}
      onSubmit={() => void form.submit()}
      onChooseDirectory={() => void form.chooseDirectory()}
    />
  );
}
