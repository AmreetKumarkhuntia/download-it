import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DownloadCardModel } from '../../../apps/desktop/src/types/workspace';
import { DownloadCard } from '../../../apps/desktop/src/components/cards/DownloadCard';
const model: DownloadCardModel = {
  id: '1',
  filename: 'archive.zip',
  sourceHost: 'example.com',
  destination: '/tmp',
  status: 'downloading',
  size: '100 B',
  icon: 'archive',
  complete: false,
  live: true,
  canResume: false,
  indeterminate: false,
  percent: 50,
  downloaded: '50 B downloaded · 50%',
  speed: '10 B/s · 5s left',
  error: null,
  connections: '4 active connections',
};
describe('download controls', () => {
  it('shows accurate progress and pauses the selected job', () => {
    const action = vi.fn();
    render(<DownloadCard model={model} busy={false} onAction={action} onDetails={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(screen.getByRole('button', { name: 'Pause archive.zip' }));
    expect(action).toHaveBeenCalledWith('pause', model.id);
  });
  it('does not offer cancel/restart for completed files', () => {
    render(
      <DownloadCard
        model={{
          ...model,
          status: 'completed',
          complete: true,
          live: false,
          destination: '/tmp/archive.zip',
        }}
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
        model={{ ...model, indeterminate: true, percent: null }}
        busy={false}
        onAction={vi.fn()}
        onDetails={vi.fn()}
      />,
    );
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });
  it('opens details and avoids presenting stale speed as live', () => {
    const details = vi.fn();
    render(
      <DownloadCard
        model={{ ...model, speed: 'Waiting for live status…', connections: 'Last known progress' }}
        busy={false}
        onAction={vi.fn()}
        onDetails={details}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Details for archive.zip' }));
    expect(details).toHaveBeenCalledWith(model.id);
    expect(screen.getByText('Waiting for live status…')).toBeInTheDocument();
    expect(screen.queryByText('4 active connections')).not.toBeInTheDocument();
  });
});
