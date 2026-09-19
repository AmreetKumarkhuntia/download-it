import { useState } from 'react';
import type { AddDownloadRequest } from '@dm/contracts';
import type { DownloadDraft } from '../../types/workspace';
import { platform } from '../client/platform-client';
import { errorMessage } from '../shared/errors';

export function downloadRequest(draft: DownloadDraft): AddDownloadRequest {
  try {
    const parsed = new URL(draft.url.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error('Enter a valid HTTP or HTTPS link.');
  }
  return {
    url: draft.url.trim(),
    destination: draft.destination,
    filename: draft.filename.trim() || null,
    expectedSha256: draft.checksum.trim() || null,
  };
}

export function useAddDownload(
  directory: string,
  add: (request: AddDownloadRequest) => Promise<boolean>,
  close: () => void,
) {
  const [value, setValue] = useState<DownloadDraft>({
    url: '',
    destination: directory,
    filename: '',
    checksum: '',
  });
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<DownloadDraft>) => setValue((old) => ({ ...old, ...patch }));
  return {
    value,
    error,
    update,
    submit: async () => {
      try {
        const request = downloadRequest(value);
        setError(null);
        if (await add(request)) close();
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    chooseDirectory: async () => {
      try {
        const path = await platform.chooseDirectory();
        if (path) update({ destination: path });
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  };
}
