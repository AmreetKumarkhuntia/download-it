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
    render(<DownloadCard job={job} busy={false} onAction={action} onDetails={vi.fn()} />);
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
        onDetails={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Cancel|Restart|Pause|Resume/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details for archive.zip' })).toBeInTheDocument();
    expect(screen.getByText('Saved to /tmp/archive.zip')).toBeInTheDocument();
  });
  it('does not invent a percentage when size is unknown', () => {
    render(
      <DownloadCard
        job={{ ...job, totalBytes: null }}
        busy={false}
        onAction={vi.fn()}
        onDetails={vi.fn()}
      />,
    );
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });
  it('opens details and avoids presenting stale speed as live', () => {
    const details = vi.fn();
    render(<DownloadCard job={job} busy={false} onAction={vi.fn()} onDetails={details} stale />);
    fireEvent.click(screen.getByRole('button', { name: 'Details for archive.zip' }));
    expect(details).toHaveBeenCalledWith(job);
    expect(screen.getByText('Waiting for live status…')).toBeInTheDocument();
    expect(screen.queryByText('4 active connections')).not.toBeInTheDocument();
  });
});
