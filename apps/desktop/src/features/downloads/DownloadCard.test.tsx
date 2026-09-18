import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JobView } from '@dm/contracts';
import { DownloadCard } from './DownloadCard';
const job: JobView = {
  id: '1',
  filename: 'archive.zip',
  sourceHost: 'example.com',
  destination: '/tmp',
  finalPath: null,
  status: 'downloading',
  downloadedBytes: 50,
  totalBytes: 100,
  speedBytes: 10,
  etaSeconds: 5,
  connections: 4,
  createdAt: '0',
  error: null,
};
describe('download controls', () => {
  it('shows accurate progress and pauses the selected job', () => {
    const action = vi.fn();
    render(<DownloadCard job={job} busy={false} onAction={action} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(screen.getByRole('button', { name: 'Pause archive.zip' }));
    expect(action).toHaveBeenCalledWith('pause', job);
  });
  it('does not offer cancel/restart for completed files', () => {
    render(
      <DownloadCard
        job={{ ...job, status: 'completed', finalPath: '/tmp/archive.zip' }}
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Saved to /tmp/archive.zip')).toBeInTheDocument();
  });
  it('does not invent a percentage when size is unknown', () => {
    render(<DownloadCard job={{ ...job, totalBytes: null }} busy={false} onAction={vi.fn()} />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });
});
