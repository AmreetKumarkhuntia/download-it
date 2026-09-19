import { useCallback, useEffect, useState } from 'react';
import type { EngineHealth, JobView, Settings } from '@dm/contracts';
import { client, desktopAvailable, errorMessage } from '../../services/download-client';

export function useDownloads() {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stale =
    desktopAvailable &&
    (!health?.connected ||
      !!health.error ||
      !health.lastSuccessAt ||
      now - Number(health.lastSuccessAt) * 1000 > 10000);
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
        let healthReceived = false;
        const errorOff = await client.onHealth((value) => {
          healthReceived = true;
          if (!cancelled) setHealth(value);
        });
        if (cancelled) errorOff();
        else unsubscribers.push(errorOff);
        const [initialJobs, initialSettings, initialHealth] = await Promise.all([
          client.list(),
          client.settings(),
          client.health(),
        ]);
        if (!cancelled) {
          setJobs(initialJobs);
          setSettings(initialSettings);
          if (!healthReceived) setHealth(initialHealth);
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
  return { jobs, settings, setSettings, error, setError, busy, run, health, stale };
}
