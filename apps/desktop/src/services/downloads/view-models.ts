import type { DownloadDetails, JobView } from '@dm/contracts';
import type { DownloadCardModel, DownloadDetailsModel, Filter } from '../../types/workspace';
import { bytes, dateTime, eta } from '../shared/format';
import { fileExtensions } from '../shared/constants';

export function downloadCard(job: JobView, stale = false): DownloadCardModel {
  const live = ['downloading', 'queued'].includes(job.status);
  const complete = job.status === 'completed';
  const percent = job.totalBytes
    ? Math.min(100, (job.downloadedBytes / job.totalBytes) * 100)
    : complete
      ? 100
      : job.totalBytes === null
        ? null
        : 0;
  const extension = job.filename.split('.').pop()?.toLowerCase() ?? '';
  const icon = Object.entries(fileExtensions).find(([, extensions]) =>
    (extensions as readonly string[]).includes(extension),
  )?.[0] as DownloadCardModel['icon'] | undefined;
  return {
    id: job.id,
    filename: job.filename,
    status: job.status,
    sourceHost: job.sourceHost,
    size: bytes(job.totalBytes),
    icon: icon ?? 'file',
    complete,
    live,
    canResume: !live && !complete && job.status !== 'verifying',
    indeterminate: job.totalBytes === null && live,
    percent,
    downloaded: `${bytes(job.downloadedBytes)} downloaded${job.totalBytes !== null ? ` · ${(percent ?? 0).toFixed(0)}%` : ''}`,
    speed: live
      ? stale
        ? 'Waiting for live status…'
        : `${bytes(job.speedBytes)}/s · ${eta(job.etaSeconds)}`
      : job.status === 'verifying'
        ? 'Verifying file…'
        : 'Progress saved',
    destination: job.finalPath ?? job.destination,
    error: job.error?.message ?? null,
    connections: stale ? 'Last known progress' : `${job.connections} active connections`,
  };
}

export function selectDownloads(jobs: JobView[], history: boolean, filter: Filter, search: string) {
  return jobs.filter((job) => {
    if (history && !['completed', 'cancelled'].includes(job.status)) return false;
    if (
      !history &&
      filter === 'active' &&
      !['downloading', 'queued', 'verifying'].includes(job.status)
    )
      return false;
    if (!history && filter === 'paused' && job.status !== 'paused') return false;
    if (!history && filter === 'completed' && job.status !== 'completed') return false;
    return `${job.filename} ${job.sourceHost}`.toLowerCase().includes(search.toLowerCase());
  });
}

export function downloadStatistics(jobs: JobView[], stale: boolean) {
  const active = jobs.filter((j) => ['downloading', 'queued', 'verifying'].includes(j.status));
  return {
    active: active.length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    speed: stale ? '—' : bytes(active.reduce((sum, j) => sum + j.speedBytes, 0)),
    speedUnit: stale ? 'awaiting live status' : '/ second',
    footer: stale
      ? 'Waiting for live status'
      : active.length
        ? 'Downloads in progress'
        : 'Ready when you are',
  };
}

export function downloadDetails(
  data: DownloadDetails,
  refreshError: string | null,
): DownloadDetailsModel {
  const transfer = data.transfer;
  const stale = !!refreshError || !!data.telemetryError;
  return {
    filename: data.job.filename,
    status: data.job.status,
    updated: dateTime(data.sampledAt),
    error: data.job.error ? `${data.job.error.code}: ${data.job.error.message}` : null,
    telemetryError: data.telemetryError?.message ?? null,
    transfer: {
      connections: stale || !transfer ? '—' : String(transfer.connections),
      limit: transfer ? ` / ${transfer.connectionLimit} limit` : null,
      speed: stale || !transfer ? '—' : `${bytes(transfer.speedBytes)}/s`,
      speedCap: data.settings.speedLimitBytes
        ? `${bytes(data.settings.speedLimitBytes)}/s`
        : 'Unlimited',
      description: `${transfer ? `This transfer is configured for up to ${transfer.connectionLimit} connections.` : `New or resumed transfers use up to ${data.settings.connectionsPerDownload} connections.`} Up to ${data.settings.maxActiveDownloads} downloads can run at once. Small files and servers without range support may use fewer connections.`,
      noRecord: !transfer && !stale,
      pieces:
        transfer && transfer.pieceCount > 0 && !stale
          ? {
              label: `${transfer.completedPieces.toLocaleString()} / ${transfer.pieceCount.toLocaleString()} pieces complete`,
              ariaLabel: `${transfer.completedPieces} of ${transfer.pieceCount} pieces complete`,
              size: `${bytes(transfer.pieceBytes)} per piece`,
              groups: transfer.pieceGroups,
            }
          : null,
      servers:
        transfer && !stale
          ? transfer.servers.map((s) => ({ origin: s.server, speed: `${bytes(s.speedBytes)}/s` }))
          : [],
    },
    fields: [
      ['Source URL', data.sourceUrl],
      ['Resolved URL at last source check', data.effectiveUrl ?? 'Not recorded'],
      ['Destination', data.job.finalPath ?? data.job.destination],
      ['File type', data.contentType ?? 'Not supplied'],
      [
        'Total size',
        data.job.totalBytes === null
          ? 'Unknown'
          : `${bytes(data.job.totalBytes)} (${data.job.totalBytes.toLocaleString()} bytes)`,
      ],
      ['Downloaded', bytes(data.job.downloadedBytes)],
      [
        'Byte ranges',
        data.rangeSupported === null
          ? 'Not recorded'
          : data.rangeSupported
            ? 'Supported at last source check'
            : 'Server did not honor the range request',
      ],
      [
        'Resume validation',
        data.resumeValidator
          ? 'Validator available; checked again on resume'
          : 'No reliable validator; partial downloads may require Restart',
      ],
      ['ETag', data.etag ?? 'Not supplied'],
      ['Last modified', data.lastModified ?? 'Not supplied'],
      ['Expected SHA-256', data.expectedSha256 ?? 'Not set'],
      ['Added', dateTime(data.job.createdAt)],
      ['Download ID', data.job.id],
    ],
  };
}
