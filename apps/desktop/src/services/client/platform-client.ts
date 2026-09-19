import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export const desktopAvailable = isTauri();
export const platform = {
  chooseDirectory: () =>
    open({ directory: true, multiple: false, title: 'Choose download folder' }),
  copyText: (text: string) => navigator.clipboard.writeText(text),
};
