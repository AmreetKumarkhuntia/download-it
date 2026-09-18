import { useCallback, useEffect, useState } from 'react';
import type { JobView, Settings } from '@dm/contracts';
import { client, desktopAvailable, errorMessage } from '../../services/download-client';

export function useDownloads() {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setJobs(await client.list());
  }, []);
  useEffect(() => {
    if (!desktopAvailable) return;
    let cancelled = false;
    const unsubscribers: (() => void)[] = [];
    const register = async () => {
      try {
        const jobsOff = await client.onJobs((value) => {
          if (!cancelled) setJobs(value);
        });
        if (cancelled) jobsOff();
        else unsubscribers.push(jobsOff);
        const errorOff = await client.onError((value) => {
          if (!cancelled) setError(value.message);
        });
        if (cancelled) errorOff();
        else unsubscribers.push(errorOff);
        const [initialJobs, initialSettings] = await Promise.all([
          client.list(),
          client.settings(),
        ]);
        if (!cancelled) {
          setJobs(initialJobs);
          setSettings(initialSettings);
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    };
    void register();
    return () => {
      cancelled = true;
      unsubscribers.forEach((fn) => fn());
    };
  }, []);
  const run = useCallback(
    async (operation: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await operation();
        await refresh();
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  return { jobs, settings, setSettings, error, setError, busy, run };
}
