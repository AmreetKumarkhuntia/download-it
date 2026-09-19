import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  AddDownloadRequest,
  DiagnosticEvent,
  DownloadDetails,
  EngineHealth,
  JobView,
  Settings,
} from '@dm/contracts';

export const client = {
  list: () => invoke<JobView[]>('list_downloads'),
  details: (id: string) => invoke<DownloadDetails>('get_download_details', { id }),
  health: () => invoke<EngineHealth>('get_engine_health'),
  diagnostics: (jobId: string | null = null) =>
    invoke<DiagnosticEvent[]>('get_diagnostics', { jobId }),
  add: (request: AddDownloadRequest) => invoke<JobView>('add_download', { request }),
  pause: (id: string) => invoke<void>('pause_download', { id }),
  resume: (id: string, restart = false) => invoke<void>('resume_download', { id, restart }),
  cancel: (id: string) => invoke<void>('cancel_download', { id }),
  settings: () => invoke<Settings>('get_settings'),
  saveSettings: (settings: Settings) => invoke<void>('update_settings', { settings }),
  onJobs: (callback: (jobs: JobView[]) => void) =>
    listen<JobView[]>('downloads-changed', (event) => callback(event.payload)),
  onHealth: (callback: (health: EngineHealth) => void) =>
    listen<EngineHealth>('engine-health', (event) => callback(event.payload)),
};

export type DownloadClient = typeof client;
