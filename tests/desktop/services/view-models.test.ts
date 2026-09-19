import { expect, it } from 'vitest';
import {
  downloadCard,
  downloadStatistics,
  selectDownloads,
} from '../../../apps/desktop/src/services/downloads/view-models';
import { job } from '../fixtures';

it('keeps unknown sizes indeterminate and hides stale telemetry', () => {
  const model = downloadCard({ ...job, totalBytes: null }, true);
  expect(model.percent).toBeNull();
  expect(model.indeterminate).toBe(true);
  expect(model.speed).toBe('Waiting for live status…');
  expect(model.connections).toBe('Last known progress');
  expect(downloadStatistics([job], true).speed).toBe('—');
  expect(downloadCard({ ...job, downloadedBytes: 110 }).percent).toBe(100);
  expect(downloadCard({ ...job, totalBytes: 0, downloadedBytes: 0 }).percent).toBe(0);
});
it('history applies search without consuming the downloads page filter', () => {
  const completed = { ...job, id: 'completed', status: 'completed' as const };
  const jobs = [job, completed, { ...job, id: 'paused', status: 'paused' as const }];
  expect(selectDownloads(jobs, false, 'active', 'EXAMPLE')).toEqual([job]);
  expect(selectDownloads(jobs, true, 'active', 'ARCHIVE')).toEqual([completed]);
  expect(selectDownloads(jobs, true, 'all', 'missing')).toEqual([]);
});
