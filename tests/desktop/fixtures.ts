import type { EngineHealth, JobView, Settings } from '@dm/contracts';

export const settings: Settings = {
  maxActiveDownloads: 3,
  connectionsPerDownload: 8,
  speedLimitBytes: 0,
  defaultDirectory: '/downloads',
};
export const job: JobView = {
  id: 'active-job',
  filename: 'archive.zip',
  sourceHost: 'example.com',
  destination: '/downloads',
  finalPath: null,
  status: 'downloading',
  downloadedBytes: 50,
  totalBytes: 100,
  speedBytes: 10,
  etaSeconds: 5,
  connections: 4,
  createdAt: '1',
  error: null,
};
export const healthy = (): EngineHealth => ({
  connected: true,
  checkedAt: String(Math.floor(Date.now() / 1000)),
  lastSuccessAt: String(Math.floor(Date.now() / 1000)),
  consecutiveFailures: 0,
  error: null,
  logError: null,
});
