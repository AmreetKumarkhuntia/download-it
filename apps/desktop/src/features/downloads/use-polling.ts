import { useEffect, useState } from 'react';
import { errorMessage } from '../../services/download-client';

// Schedule after completion so slow requests cannot overlap or arrive out of order.
export function usePolling<T>(load: () => Promise<T>, interval = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setData(null);
    setError(null);
    async function update() {
      try {
        const value = await load();
        if (!cancelled) {
          setData(value);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
      if (!cancelled) timer = setTimeout(() => void update(), interval);
    }
    void update();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, interval]);
  return { data, error };
}
