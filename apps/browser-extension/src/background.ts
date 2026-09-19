import type { BrowserOperation, BrowserRequest, BrowserResponse } from '@dm/contracts';
import {
  directUrl,
  evidenceFromHeaders,
  excluded,
  matchObservation,
  type Observation,
} from './capture';
import { Handoff, type Pending } from './handoff';

const host = 'io.github.amreetkumarkhuntia.downloadit.browser.dev';
const observations = new Map<string, Observation>();
const active = new Set<number>();
let working = 0;
let recovering = false;
let listenersInstalled = false;
let lastNotice = 0;
let captureEnabled = false;
const requests = new Map<string, { method: string; at: number }>();
const settingsReady = chrome.storage.local.get('automatic').then((settings) => {
  captureEnabled = Boolean(settings.automatic);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.automatic) {
    captureEnabled = Boolean(changes.automatic.newValue);
    if (!captureEnabled) {
      observations.clear();
      requests.clear();
    }
  }
});
const key = (id: string) => `handoff:${id}`;

async function call(requestId: string, command: BrowserOperation): Promise<BrowserResponse> {
  const request: BrowserRequest = { version: 1, requestId, command };
  let response: BrowserResponse;
  try {
    response = await chrome.runtime.sendNativeMessage(host, request);
  } catch {
    throw new Error('Native bridge unavailable. Run browser:register and open Download It.');
  }
  if (!response || response.version !== 1 || response.requestId !== requestId)
    throw new Error('Browser protocol mismatch. Rebuild the extension and desktop app together.');
  return response;
}

const handoff = new Handoff({
  call,
  save: (pending) => chrome.storage.local.set({ [key(pending.id)]: pending }),
  remove: (id) => chrome.storage.local.remove(key(id)),
  pause: (id) => chrome.downloads.pause(id),
  isPaused: async (id) => {
    const [item] = await chrome.downloads.search({ id });
    return Boolean(item && item.state === 'in_progress' && item.paused);
  },
  canTransfer: async (id) => {
    const [item] = await chrome.downloads.search({ id });
    return Boolean(
      item &&
      item.state === 'in_progress' &&
      item.paused &&
      item.danger === 'safe' &&
      !item.incognito,
    );
  },
  resume: (id) => chrome.downloads.resume(id),
  cancel: async (id) => {
    const [item] = await chrome.downloads.search({ id });
    if (item?.state === 'complete')
      throw new Error(
        'The browser finished this file during handoff. Check both downloads before retrying.',
      );
    if (item?.state === 'in_progress') {
      await chrome.downloads.cancel(id);
      const [after] = await chrome.downloads.search({ id });
      if (after?.state === 'complete')
        throw new Error(
          'The browser also completed this file. Check both downloads before clearing its browser history entry and checking pending handoffs again.',
        );
      if (after?.state === 'in_progress')
        throw new Error('The browser transfer could not be stopped. Check pending handoffs again.');
    }
  },
});

async function report(message: string, attention = false) {
  await chrome.storage.local.set({ lastResult: message });
  await chrome.action.setBadgeText({ text: attention ? '!' : '' });
  if (attention && Date.now() - lastNotice > 30_000) {
    lastNotice = Date.now();
    await chrome.notifications.create('download-it-status', {
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Download It',
      message,
    });
  }
}

async function pendingRecords(): Promise<Pending[]> {
  const stored = await chrome.storage.local.get(null);
  return Object.entries(stored)
    .filter(([name]) => name.startsWith('handoff:'))
    .map(([, value]) => value as Pending);
}

async function recover() {
  if (working) return;
  working++;
  recovering = true;
  try {
    for (const record of await pendingRecords()) {
      try {
        await report(await handoff.recover(record));
      } catch (error) {
        await report((error as Error).message, true);
      }
    }
  } finally {
    recovering = false;
    working--;
  }
}

async function capture(item: chrome.downloads.DownloadItem) {
  await settingsReady;
  const settings = await chrome.storage.local.get<{
    automatic?: boolean;
    excludedDomains?: string[];
  }>(['automatic', 'excludedDomains']);
  if (
    recovering ||
    !settings.automatic ||
    active.has(item.id) ||
    item.incognito ||
    item.danger !== 'safe' ||
    item.state !== 'in_progress' ||
    item.paused ||
    item.byExtensionId ||
    excluded(item.url, settings.excludedDomains ?? []) ||
    excluded(item.finalUrl, settings.excludedDomains ?? [])
  )
    return;
  const evidence = matchObservation(item, [...observations.values()], Date.now());
  if (!evidence || (await pendingRecords()).some((p) => p.downloadId === item.id)) return;
  active.add(item.id);
  working++;
  try {
    const filename = item.filename.split(/[\\/]/).pop() || null;
    await report(await handoff.submit(item.finalUrl, filename, evidence, item.id));
  } catch (error) {
    await report((error as Error).message, true);
  } finally {
    active.delete(item.id);
    working--;
  }
}

function installCaptureListeners() {
  if (listenersInstalled || !chrome.downloads || !chrome.webRequest) return;
  try {
    chrome.downloads.onCreated.addListener((item) => {
      void capture(item).catch(() => report('Capture failed. Check pending handoffs.', true));
    });
    chrome.webRequest.onBeforeRequest.addListener(
      (details): undefined => {
        void settingsReady.then(() => {
          if (!captureEnabled) return;
          for (const [id, value] of requests)
            if (Date.now() - value.at > 30_000) requests.delete(id);
          if (requests.size >= 512) requests.delete(requests.keys().next().value!);
          const previous = requests.get(details.requestId);
          requests.set(details.requestId, {
            method: previous && previous.method !== 'GET' ? previous.method : details.method,
            at: details.timeStamp,
          });
        });
      },
      { urls: ['http://*/*', 'https://*/*'] },
    );
    chrome.webRequest.onHeadersReceived.addListener(
      (details): undefined => {
        void settingsReady.then(() => {
          if (!captureEnabled) return;
          for (const [id, value] of observations)
            if (Date.now() - value.at > 30_000) observations.delete(id);
          if (observations.size >= 512) observations.delete(observations.keys().next().value!);
          const method = requests.get(details.requestId)?.method ?? 'UNKNOWN';
          observations.set(details.requestId, {
            requestId: details.requestId,
            url: details.url,
            method,
            at: details.timeStamp,
            evidence: evidenceFromHeaders(
              method,
              details.statusCode,
              details.responseHeaders ?? [],
            ),
          });
        });
      },
      { urls: ['http://*/*', 'https://*/*'] },
      ['responseHeaders'],
    );
    listenersInstalled = true;
  } catch {
    /* Optional permissions may not have been granted yet. */
  }
}
installCaptureListeners();
chrome.permissions.onAdded.addListener(installCaptureListeners);
chrome.permissions.onRemoved.addListener(() => {
  void chrome.permissions
    .contains({ permissions: ['downloads', 'webRequest'], origins: ['http://*/*', 'https://*/*'] })
    .then((allowed) => {
      if (!allowed) return chrome.storage.local.set({ automatic: false });
    });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: 'send',
      title: 'Download with Download It',
      contexts: ['link'],
      targetUrlPatterns: ['http://*/*', 'https://*/*'],
    }),
  );
  void chrome.alarms.create('recover', { periodInMinutes: 0.5 });
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create('recover', { periodInMinutes: 0.5 });
  void recover();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'recover') void recover();
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'send' || !info.linkUrl || tab?.incognito) return;
  if (recovering) {
    void report('Checking pending handoffs. Try this link again in a moment.');
    return;
  }
  working++;
  void handoff
    .submit(info.linkUrl, null, null)
    .then((message) => report(message))
    .catch((e: Error) => report(e.message, true))
    .finally(() => {
      working--;
    });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  const handle = async () => {
    if (message.action === 'hello') return call(crypto.randomUUID(), { operation: 'hello' });
    if (message.action === 'recover') {
      await recover();
      return { ok: true };
    }
    if (message.action === 'submit' && typeof message.url === 'string' && directUrl(message.url)) {
      if (recovering)
        throw new Error('Checking pending handoffs. Try this link again in a moment.');
      working++;
      try {
        const result = await handoff.submit(message.url, null, null);
        await report(result);
        return { ok: true, message: result };
      } finally {
        working--;
      }
    }
    throw new Error('Enter a valid HTTP or HTTPS file URL.');
  };
  void handle()
    .then(respond)
    .catch((e: Error) => respond({ error: { message: e.message } }));
  return true;
});
