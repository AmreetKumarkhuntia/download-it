import { useState } from 'react';
import type { AddDownloadRequest, Settings } from '@dm/contracts';
import type { DownloadAction, Filter, WorkspaceDialog } from '../../types/workspace';
import { client } from '../client/download-client';
import { desktopAvailable } from '../client/platform-client';
import { useDownloads } from './use-downloads';

export function useWorkspaceController() {
  const state = useDownloads();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<WorkspaceDialog>(null);
  const closeDialog = () => setDialog(null);
  const act = (action: DownloadAction, id: string) => {
    if (action === 'restart') {
      const job = state.jobs.find((job) => job.id === id);
      if (job) setDialog({ type: 'restart', id, filename: job.filename });
    } else {
      void state.run(() => client[action](id));
    }
  };
  return {
    ...state,
    filter,
    setFilter,
    search,
    setSearch,
    dialog,
    closeDialog,
    act,
    desktopAvailable,
    canAdd: desktopAvailable && !!state.settings,
    openAdd: () => setDialog({ type: 'add' }),
    openDetails: (id: string) => setDialog({ type: 'details', id }),
    add: (request: AddDownloadRequest) => state.run(() => client.add(request)),
    confirmRestart: async () => {
      if (dialog?.type === 'restart' && (await state.run(() => client.resume(dialog.id, true))))
        closeDialog();
    },
    saveSettings: async (settings: Settings) => {
      const ok = await state.run(() => client.saveSettings(settings));
      if (ok) state.setSettings(settings);
      return ok;
    },
  };
}
