import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../../apps/desktop/src/App';
import { healthy, job, settings } from '../fixtures';

const client = vi.hoisted(() => ({
  list: vi.fn(),
  settings: vi.fn(),
  health: vi.fn(),
  onJobs: vi.fn(),
  onHealth: vi.fn(),
  add: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  saveSettings: vi.fn(),
}));
const platform = vi.hoisted(() => ({ chooseDirectory: vi.fn() }));
vi.mock('../../../apps/desktop/src/services/client/download-client', () => ({ client }));
vi.mock('../../../apps/desktop/src/services/client/platform-client', () => ({
  desktopAvailable: true,
  platform,
}));

beforeEach(() => {
  vi.resetAllMocks();
  client.list.mockResolvedValue([
    job,
    { ...job, id: 'paused-job', filename: 'paused.zip', status: 'paused' },
    { ...job, id: 'completed-job', filename: 'completed.zip', status: 'completed' },
  ]);
  client.settings.mockResolvedValue(settings);
  client.health.mockResolvedValue(healthy());
  client.onJobs.mockResolvedValue(vi.fn());
  client.onHealth.mockResolvedValue(vi.fn());
});

it('shares one subscription across widgets and preserves filters and search across pages', async () => {
  const offJobs = vi.fn();
  const offHealth = vi.fn();
  client.onJobs.mockResolvedValue(offJobs);
  client.onHealth.mockResolvedValue(offHealth);
  const { unmount } = render(<App />);
  await screen.findByText(job.filename);
  fireEvent.click(screen.getByRole('button', { name: 'Active' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search downloads' }), {
    target: { value: 'EXAMPLE' },
  });
  const nav = within(screen.getByRole('navigation'));
  fireEvent.click(nav.getByRole('button', { name: 'History' }));
  expect(screen.getByText('completed.zip')).toBeInTheDocument();
  expect(screen.queryByText(job.filename)).not.toBeInTheDocument();
  fireEvent.click(nav.getByRole('button', { name: /Downloads/ }));
  expect(screen.getByText(job.filename)).toBeInTheDocument();
  expect(screen.queryByText('completed.zip')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Search downloads' })).toHaveValue('EXAMPLE');
  expect(client.onJobs).toHaveBeenCalledTimes(1);
  expect(client.onHealth).toHaveBeenCalledTimes(1);
  unmount();
  expect(offJobs).toHaveBeenCalledTimes(1);
  expect(offHealth).toHaveBeenCalledTimes(1);
});

it('validates a new download, handles directory selection and submits through the widget', async () => {
  render(<App />);
  await screen.findByText(job.filename);
  fireEvent.click(screen.getByRole('button', { name: 'New download' }));
  const dialog = within(screen.getByRole('dialog', { name: 'New download' }));
  const url = dialog.getByLabelText('File URL');
  fireEvent.change(url, { target: { value: 'ftp://example.com/file.zip' } });
  fireEvent.submit(url.closest('form')!);
  expect(await dialog.findByRole('alert')).toHaveTextContent('Enter a valid HTTP or HTTPS link.');
  expect(client.add).not.toHaveBeenCalled();
  platform.chooseDirectory.mockRejectedValueOnce(new Error('Picker unavailable'));
  fireEvent.click(dialog.getByRole('button', { name: 'Choose folder' }));
  expect(await dialog.findByText('Picker unavailable')).toBeInTheDocument();
  platform.chooseDirectory.mockResolvedValueOnce('/chosen');
  fireEvent.click(dialog.getByRole('button', { name: 'Choose folder' }));
  await waitFor(() => expect(dialog.getByLabelText('Save to')).toHaveValue('/chosen'));
  fireEvent.change(url, { target: { value: 'https://example.com/file.zip' } });
  fireEvent.submit(url.closest('form')!);
  await waitFor(() =>
    expect(client.add).toHaveBeenCalledWith({
      url: 'https://example.com/file.zip',
      destination: '/chosen',
      filename: null,
      expectedSha256: null,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('saves settings in bytes per second and requires confirmation before restarting', async () => {
  render(<App />);
  await screen.findByText(job.filename);
  fireEvent.click(
    within(screen.getByRole('navigation')).getByRole('button', { name: 'Preferences' }),
  );
  const limit = screen.getByLabelText('Total speed limit (KB/s)');
  fireEvent.change(limit, { target: { value: '128' } });
  fireEvent.submit(limit.closest('form')!);
  await waitFor(() =>
    expect(client.saveSettings).toHaveBeenCalledWith({ ...settings, speedLimitBytes: 131072 }),
  );
  expect(await screen.findByText('Preferences saved')).toHaveAttribute('role', 'status');
  fireEvent.click(
    within(screen.getByRole('navigation')).getByRole('button', { name: /Downloads/ }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Restart paused.zip' }));
  expect(client.resume).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep progress' }),
  );
  expect(client.resume).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Restart paused.zip' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Restart download' }),
  );
  await waitFor(() => expect(client.resume).toHaveBeenCalledWith('paused-job', true));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('unsubscribes when listener registration finishes after the workspace unmounts', async () => {
  let finish!: (off: () => void) => void;
  const offJobs = vi.fn();
  const offHealth = vi.fn();
  client.onJobs.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  client.onHealth.mockResolvedValue(offHealth);
  const { unmount } = render(<App />);
  unmount();
  await act(async () => finish(offJobs));
  expect(offJobs).toHaveBeenCalledTimes(1);
  expect(offHealth).toHaveBeenCalledTimes(1);
});
