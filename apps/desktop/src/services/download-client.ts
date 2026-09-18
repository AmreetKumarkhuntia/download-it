import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { AddDownloadRequest, AppError, JobView, Settings } from '@dm/contracts';

export const desktopAvailable = isTauri();
export const client = {
  list: () => invoke<JobView[]>('list_downloads'),
  add: (request: AddDownloadRequest) => invoke<JobView>('add_download', { request }),
  pause: (id: string) => invoke<void>('pause_download', { id }),
  resume: (id: string, restart = false) => invoke<void>('resume_download', { id, restart }),
  cancel: (id: string) => invoke<void>('cancel_download', { id }),
  settings: () => invoke<Settings>('get_settings'),
  saveSettings: (settings: Settings) => invoke<void>('update_settings', { settings }),
  chooseDirectory: () =>
    open({ directory: true, multiple: false, title: 'Choose download folder' }),
  onJobs: (callback: (jobs: JobView[]) => void) =>
    listen<JobView[]>('downloads-changed', (event) => callback(event.payload)),
  onError: (callback: (error: AppError) => void) =>
    listen<AppError>('engine-error', (event) => callback(event.payload)),
};
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return typeof error === 'string' ? error : 'Something went wrong. Please try again.';
}
