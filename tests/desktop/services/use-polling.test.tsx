import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePolling } from '../../../apps/desktop/src/services/shared/use-polling';

afterEach(() => vi.useRealTimers());
it('does not overlap requests and clears scheduled refreshes when unmounted', async () => {
  vi.useFakeTimers();
  let resolve!: (value: string) => void;
  const load = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const { result, unmount } = renderHook(() => usePolling(load, 100));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => resolve('first'));
  expect(result.current.data).toBe('first');
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => resolve('second'));
  unmount();
  await vi.advanceTimersByTimeAsync(500);
  expect(load).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
it('ignores an old in-flight request after switching downloads or unmounting', async () => {
  vi.useFakeTimers();
  let resolve!: (value: string) => void;
  const oldLoad = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const nextLoad = vi.fn(async () => 'new download');
  const { result, rerender, unmount } = renderHook(({ load }) => usePolling(load, 100), {
    initialProps: { load: oldLoad as () => Promise<string> },
  });
  rerender({ load: nextLoad });
  await act(async () => {});
  await act(async () => resolve('old download'));
  expect(result.current.data).toBe('new download');
  unmount();
  await vi.advanceTimersByTimeAsync(500);
  expect(oldLoad).toHaveBeenCalledTimes(1);
  expect(nextLoad).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
