import type { EngineHealth } from '@dm/contracts';
import { dateTime } from '../shared/format';

export function engineStatus(health: EngineHealth | null, stale: boolean) {
  return {
    title: !health?.checkedAt
      ? 'Checking download engine…'
      : !health.connected
        ? 'Engine connection interrupted'
        : stale
          ? 'Waiting for a fresh status update'
          : 'Engine connected',
    message:
      (health?.error?.message ??
        (stale
          ? 'Showing saved progress. Live updates retry automatically.'
          : 'Live download status is updating.')) +
      (health?.lastSuccessAt && stale
        ? ` Last successful update: ${dateTime(health.lastSuccessAt)}.`
        : ''),
    suggestRestart: !!health && health.consecutiveFailures >= 3 && !health.connected,
    logError: health?.logError?.message ?? null,
  };
}
