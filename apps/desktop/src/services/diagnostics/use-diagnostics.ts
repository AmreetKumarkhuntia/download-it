import { useCallback, useState } from 'react';
import { client } from '../client/download-client';
import { platform } from '../client/platform-client';
import { errorMessage } from '../shared/errors';
import { dateTime } from '../shared/format';
import { timing } from '../shared/constants';
import { usePolling } from '../shared/use-polling';
import type { DiagnosticRow } from '../../types/workspace';

export function useDiagnostics(jobId: string | null) {
  const load = useCallback(() => client.diagnostics(jobId), [jobId]);
  const { data, error } = usePolling(load, timing.diagnostics);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const events = data?.filter((e) => !errorsOnly || e.level === 'error') ?? [];
  const rows: DiagnosticRow[] = events.map((e, index) => ({
    key: `${e.timestamp}-${index}`,
    isoTime: new Date(Number(e.timestamp) * 1000).toISOString(),
    time: dateTime(e.timestamp),
    level: e.level,
    event: e.event,
    message: e.message,
    jobId: jobId ? null : e.jobId,
  }));
  return {
    rows,
    error,
    loading: !data && !error,
    loaded: !!data,
    scoped: !!jobId,
    errorsOnly,
    setErrorsOnly,
    copyStatus,
    copy: async () => {
      try {
        await platform.copyText(
          events
            .map(
              (e) =>
                `${new Date(Number(e.timestamp) * 1000).toISOString()} [${e.level}] ${e.event}${e.jobId ? ` (${e.jobId})` : ''}: ${e.message}`,
            )
            .join('\n'),
        );
        setCopyStatus('Copied logs');
      } catch (e) {
        setCopyStatus(errorMessage(e));
      }
    },
  };
}
