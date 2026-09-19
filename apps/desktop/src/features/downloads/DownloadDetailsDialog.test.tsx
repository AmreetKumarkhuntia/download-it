import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DownloadDetails } from '@dm/contracts';
import { DownloadDetailsDialog } from './DownloadDetailsDialog';

const client = vi.hoisted(() => ({ details: vi.fn(), diagnostics: vi.fn(), copyText: vi.fn() }));
vi.mock('../../services/download-client', () => ({
  client,
  errorMessage: (e: Error) => e.message,
}));
const data: DownloadDetails = {
  job: {
    id: 'download-id',
    filename: 'archive.zip',
    sourceHost: 'example.com',
    destination: '/tmp',
    finalPath: null,
    status: 'downloading',
    downloadedBytes: 50,
    totalBytes: 100,
    speedBytes: 10,
    etaSeconds: 5,
    connections: 2,
    createdAt: '1',
    error: null,
  },
  sourceUrl: 'https://example.com/archive.zip [query/fragment hidden]',
  effectiveUrl: 'https://cdn.example.com/archive.zip',
  contentType: 'application/zip',
  etag: '"v1"',
  lastModified: null,
  rangeSupported: true,
  expectedSha256: null,
  resumeValidator: true,
  telemetryError: null,
  sampledAt: '1',
  settings: {
    maxActiveDownloads: 3,
    connectionsPerDownload: 8,
    speedLimitBytes: 0,
    defaultDirectory: '/tmp',
  },
  transfer: {
    connections: 2,
    connectionLimit: 4,
    speedBytes: 10,
    pieceCount: 4,
    pieceBytes: 25,
    completedPieces: 2,
    pieceGroups: [100, 0, 100, 0],
    servers: [{ server: 'https://cdn.example.com', speedBytes: 10 }],
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  client.details.mockResolvedValue(data);
  client.diagnostics.mockResolvedValue([
    {
      timestamp: '1',
      level: 'error',
      event: 'download.state',
      jobId: 'download-id',
      message: 'Status: Failed; error: Network',
    },
  ]);
});
it('shows actual connection limits, piece completion, source metadata and scoped logs', async () => {
  render(<DownloadDetailsDialog id="download-id" onClose={vi.fn()} />);
  await screen.findByRole('heading', { name: 'archive.zip' });
  expect(screen.getByText('/ 4 limit')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '2 of 4 pieces complete' })).toBeInTheDocument();
  expect(screen.getByText(data.sourceUrl)).toBeInTheDocument();
  expect(screen.getByText('Supported at last source check')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Download log'));
  await waitFor(() => expect(client.diagnostics).toHaveBeenCalledWith('download-id'));
  expect(await screen.findByText('Status: Failed; error: Network')).toBeInTheDocument();
});
it('retains saved metadata when live telemetry fails', async () => {
  client.details.mockResolvedValue({
    ...data,
    transfer: null,
    telemetryError: { code: 'engine', message: 'Engine timed out' },
  });
  render(<DownloadDetailsDialog id="download-id" onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Engine timed out');
  expect(screen.getByText(data.sourceUrl)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
