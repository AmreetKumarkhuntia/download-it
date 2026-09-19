import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineHealth, JobView } from '@dm/contracts';
import { useDownloads } from './use-downloads';

const client = vi.hoisted(() => ({
  list: vi.fn(),
  settings: vi.fn(),
  health: vi.fn(),
  onHealth: vi.fn(),
  onJobs: vi.fn(),
}));
vi.mock('../../services/download-client', () => ({
  client,
  desktopAvailable: true,
  errorMessage: (e: Error) => e.message,
}));
const healthy = (): EngineHealth => ({
  connected: true,
  checkedAt: String(Math.floor(Date.now() / 1000)),
  lastSuccessAt: String(Math.floor(Date.now() / 1000)),
  consecutiveFailures: 0,
  error: null,
  logError: null,
});

describe('engine status recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    client.list.mockResolvedValue([]);
    client.settings.mockResolvedValue({});
    client.health.mockResolvedValue(healthy());
    client.onHealth.mockResolvedValue(vi.fn());
    client.onJobs.mockResolvedValue(vi.fn());
  });
  it('keeps database updates separate from engine health and clears a recovered warning', async () => {
    const { result } = renderHook(useDownloads);
    await waitFor(() => expect(result.current.health?.connected).toBe(true));
    const onHealth = client.onHealth.mock.calls[0][0] as (h: EngineHealth) => void;
    const onJobs = client.onJobs.mock.calls[0][0] as (jobs: JobView[]) => void;
    act(() =>
      onHealth({
        ...healthy(),
        connected: false,
        consecutiveFailures: 1,
        error: { code: 'engine', message: 'Engine timed out' },
      }),
    );
    act(() => onJobs([]));
    expect(result.current.stale).toBe(true);
    expect(result.current.health?.error?.message).toBe('Engine timed out');
    act(() => onHealth(healthy()));
    expect(result.current.stale).toBe(false);
    expect(result.current.health?.error).toBeNull();
  });
  it('does not erase an action failure when an engine health event arrives', async () => {
    const { result } = renderHook(useDownloads);
    await waitFor(() => expect(result.current.health?.connected).toBe(true));
    await act(async () => {
      await result.current.run(async () => {
        throw new Error('Cannot write destination');
      });
    });
    act(() => client.onHealth.mock.calls[0][0](healthy()));
    expect(result.current.error).toBe('Cannot write destination');
  });
});
