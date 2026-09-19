import { useCallback, useState } from 'react';
import { client } from '../client/download-client';
import { usePolling } from '../shared/use-polling';
import { downloadDetails } from './view-models';

export function useDownloadDetails(id: string) {
  const load = useCallback(() => client.details(id), [id]);
  const { data, error } = usePolling(load);
  const [logsOpen, setLogsOpen] = useState(false);
  return { model: data ? downloadDetails(data, error) : null, error, logsOpen, setLogsOpen };
}
