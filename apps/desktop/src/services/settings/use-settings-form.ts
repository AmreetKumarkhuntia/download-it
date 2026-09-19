import { useState } from 'react';
import type { Settings } from '@dm/contracts';
import type { SettingsDraft } from '../../types/workspace';
import { platform } from '../client/platform-client';
import { errorMessage } from '../shared/errors';
import { bytesPerKib, settingsLimits } from '../shared/constants';

export function useSettingsForm(
  settings: Settings,
  save: (settings: Settings) => Promise<boolean>,
) {
  const [value, setValue] = useState<SettingsDraft>({
    maxActiveDownloads: settings.maxActiveDownloads,
    connectionsPerDownload: settings.connectionsPerDownload,
    speedLimitKib: Math.round(settings.speedLimitBytes / bytesPerKib),
    defaultDirectory: settings.defaultDirectory,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<SettingsDraft>) => {
    setSaved(false);
    setValue((old) => ({ ...old, ...patch }));
  };
  return {
    value,
    saved,
    error,
    update,
    limits: settingsLimits,
    submit: async () =>
      setSaved(
        await save({
          maxActiveDownloads: value.maxActiveDownloads,
          connectionsPerDownload: value.connectionsPerDownload,
          speedLimitBytes: value.speedLimitKib * bytesPerKib,
          defaultDirectory: value.defaultDirectory,
        }),
      ),
    chooseDirectory: async () => {
      try {
        const path = await platform.chooseDirectory();
        if (path) update({ defaultDirectory: path });
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  };
}
