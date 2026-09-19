import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DiagnosticsWidget } from '../../../apps/desktop/src/widgets/diagnostics/DiagnosticsWidget';

const client = vi.hoisted(() => ({ diagnostics: vi.fn() }));
const platform = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock('../../../apps/desktop/src/services/client/download-client', () => ({ client }));
vi.mock('../../../apps/desktop/src/services/client/platform-client', () => ({
  desktopAvailable: true,
  platform,
}));
beforeEach(() => {
  vi.resetAllMocks();
  client.diagnostics.mockResolvedValue([
    { timestamp: '1', level: 'info', event: 'engine.connected', jobId: null, message: 'Connected' },
    {
      timestamp: '2',
      level: 'error',
      event: 'download.failed',
      jobId: 'job-id',
      message: 'Source expired',
    },
  ]);
});
it('copies the filtered log and keeps failures visible when the clipboard is unavailable', async () => {
  render(<DiagnosticsWidget />);
  await screen.findByText('Connected');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Errors only' }));
  expect(screen.queryByText('Connected')).not.toBeInTheDocument();
  expect(screen.getByText('Source expired')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Copy logs' }));
  await waitFor(() =>
    expect(platform.copyText).toHaveBeenCalledWith(
      '1970-01-01T00:00:02.000Z [error] download.failed (job-id): Source expired',
    ),
  );
  expect(await screen.findByText('Copied logs')).toBeInTheDocument();
  platform.copyText.mockRejectedValueOnce(new Error('Clipboard unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy logs' }));
  expect(await screen.findByText('Clipboard unavailable')).toBeInTheDocument();
  expect(screen.getByText('Source expired')).toBeInTheDocument();
});
