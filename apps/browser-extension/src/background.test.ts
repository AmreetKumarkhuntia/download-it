import { afterEach, expect, it, vi } from 'vitest';
import type { BrowserRequest, BrowserState } from '@dm/contracts';

function event() {
  const listeners: ((...args: any[]) => unknown)[] = [];
  return {
    addListener: vi.fn((listener) => listeners.push(listener)),
    emit: (...args: any[]) => listeners.forEach((listener) => listener(...args)),
  };
}

async function environment(closed = false) {
  vi.resetModules();
  const stored: Record<string, unknown> = { automatic: true, excludedDomains: [] };
  let release!: (value: Record<string, unknown>) => void;
  const initial = new Promise<Record<string, unknown>>((resolve) => {
    release = resolve;
  });
  const item = {
    id: 1,
    url: 'https://example.com/file',
    finalUrl: 'https://example.com/file',
    filename: '',
    startTime: new Date().toISOString(),
    state: 'in_progress',
    paused: false,
    danger: 'safe',
    incognito: false,
  };
  const api = {
    storage: {
      local: {
        get: vi.fn(async () => ({ ...stored })).mockImplementationOnce(() => initial),
        set: vi.fn(async (values) => {
          Object.assign(stored, values);
        }),
        remove: vi.fn(async (key: string) => {
          delete stored[key];
        }),
      },
      onChanged: event(),
    },
    runtime: {
      id: 'extension',
      getURL: (path: string) => `chrome-extension://extension/${path}`,
      onInstalled: event(),
      onStartup: event(),
      onMessage: event(),
      sendNativeMessage: vi.fn(async (_host: string, request: BrowserRequest) => ({
        version: 1,
        requestId: request.requestId,
        state: (closed
          ? 'error'
          : (
              {
                hello: 'ready',
                prepare: 'prepared',
                commit: 'committed',
                abort: 'aborted',
                status: 'committed',
              } as const
            )[request.command.operation]) as BrowserState,
        job: null,
        error: closed
          ? {
              code: 'not_found',
              message: 'Download It is not running. Open it to capture downloads.',
            }
          : null,
      })),
    },
    downloads: {
      onCreated: event(),
      search: vi.fn(async () => [item]),
      pause: vi.fn(async () => {
        item.paused = true;
      }),
      resume: vi.fn(async () => {
        item.paused = false;
      }),
      cancel: vi.fn(async () => {
        item.state = 'interrupted';
      }),
    },
    webRequest: { onBeforeRequest: event(), onHeadersReceived: event() },
    permissions: { onAdded: event(), onRemoved: event(), contains: vi.fn(async () => true) },
    alarms: { onAlarm: event(), create: vi.fn() },
    contextMenus: { onClicked: event(), removeAll: vi.fn(), create: vi.fn() },
    notifications: { create: vi.fn(async () => 'notice') },
    action: { setBadgeText: vi.fn(async () => {}) },
  };
  vi.stubGlobal('chrome', api);
  await import('./background');
  const before = (method: string) =>
    api.webRequest.onBeforeRequest.emit({ requestId: 'network-1', method, timeStamp: Date.now() });
  const headers = () =>
    api.webRequest.onHeadersReceived.emit({
      requestId: 'network-1',
      url: item.finalUrl,
      method: 'GET',
      statusCode: 200,
      timeStamp: Date.now(),
      responseHeaders: [
        { name: 'Content-Length', value: '10' },
        { name: 'Content-Type', value: 'application/octet-stream' },
        { name: 'ETag', value: '"v1"' },
      ],
    });
  return { api, item, stored, before, headers, ready: () => release({ automatic: true }) };
}
afterEach(() => vi.unstubAllGlobals());

it('captures the first file after worker startup even while settings are loading', async () => {
  const f = await environment();
  f.before('GET');
  f.headers();
  f.api.downloads.onCreated.emit(f.item);
  f.ready();
  await vi.waitFor(() => expect(f.api.downloads.cancel).toHaveBeenCalledWith(1));
  expect(f.api.downloads.pause).toHaveBeenCalledWith(1);
  expect(
    f.api.runtime.sendNativeMessage.mock.calls.map(([, request]) => request.command.operation),
  ).toEqual(['hello', 'prepare', 'commit']);
  expect(Object.keys(f.stored).some((key) => key.startsWith('handoff:'))).toBe(false);
});

it('does not capture a POST redirected to a GET file', async () => {
  const f = await environment();
  f.before('POST');
  f.before('GET');
  f.headers();
  f.api.downloads.onCreated.emit(f.item);
  f.ready();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(f.api.runtime.sendNativeMessage).not.toHaveBeenCalled();
  expect(f.api.downloads.pause).not.toHaveBeenCalled();
});

it('reports the closed app and leaves the browser transfer running', async () => {
  const f = await environment(true);
  f.before('GET');
  f.headers();
  f.api.downloads.onCreated.emit(f.item);
  f.ready();
  await vi.waitFor(() => expect(f.api.notifications.create).toHaveBeenCalled());
  expect(f.stored.lastResult).toContain('Download It is not running');
  expect(f.api.downloads.pause).not.toHaveBeenCalled();
  expect(f.api.downloads.cancel).not.toHaveBeenCalled();
});

it('retains recovery state when cancel resolves but the browser completed the file', async () => {
  const f = await environment();
  f.api.downloads.cancel.mockImplementation(async () => {
    f.item.state = 'complete';
  });
  f.before('GET');
  f.headers();
  f.api.downloads.onCreated.emit(f.item);
  f.ready();
  await vi.waitFor(() => expect(f.api.notifications.create).toHaveBeenCalled());
  expect(f.stored.lastResult).toContain('browser finished');
  expect(Object.entries(f.stored).filter(([key]) => key.startsWith('handoff:'))).toHaveLength(1);
  expect(f.api.downloads.resume).not.toHaveBeenCalled();
});
