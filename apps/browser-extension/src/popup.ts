import { parseDomains } from './capture';
import './popup.css';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const result = element('result');
const automatic = element<HTMLInputElement>('automatic');
const exclusions = element<HTMLTextAreaElement>('excluded');
const show = (error: unknown) => {
  result.textContent = error instanceof Error ? error.message : String(error);
};

void chrome.storage.local
  .get<{ automatic?: boolean; excludedDomains?: string[]; lastResult?: string }>([
    'automatic',
    'excludedDomains',
    'lastResult',
  ])
  .then((settings) => {
    automatic.checked = Boolean(settings.automatic);
    exclusions.value = (settings.excludedDomains ?? []).join(', ');
    result.textContent = settings.lastResult ?? '';
  });
void chrome.runtime
  .sendMessage({ action: 'hello' })
  .then((response) => {
    element('connection').textContent =
      response?.state === 'ready'
        ? 'Desktop app connected'
        : (response?.error?.message ?? 'Desktop app unavailable');
  })
  .catch(() => {
    element('connection').textContent = 'Bridge unavailable. Rebuild and reload the extension.';
  });

automatic.addEventListener('change', () => {
  const enabled = automatic.checked;
  // permissions.request must be invoked directly in this user gesture.
  const permission = enabled
    ? chrome.permissions.request({
        permissions: ['downloads', 'webRequest'],
        origins: ['http://*/*', 'https://*/*'],
      })
    : Promise.resolve(true);
  void permission
    .then(async (allowed) => {
      automatic.checked = enabled && allowed;
      await chrome.storage.local.set({ automatic: automatic.checked });
      result.textContent = automatic.checked
        ? 'Automatic capture enabled for future downloads.'
        : 'Automatic capture is off.';
    })
    .catch((error) => {
      automatic.checked = false;
      show(error);
    });
});
element('save').addEventListener('click', () => {
  try {
    const domains = parseDomains(exclusions.value);
    void chrome.storage.local.set({ excludedDomains: domains }).then(() => {
      result.textContent = 'Exclusions saved.';
    });
  } catch (error) {
    show(error);
  }
});
element('submit').addEventListener('submit', (event) => {
  event.preventDefault();
  const button = element<HTMLButtonElement>('send');
  button.disabled = true;
  result.textContent = 'Sending…';
  void chrome.runtime
    .sendMessage({ action: 'submit', url: element<HTMLInputElement>('url').value.trim() })
    .then((response) => {
      result.textContent = response.error?.message ?? response.message;
    })
    .catch(show)
    .finally(() => {
      button.disabled = false;
    });
});
element('recover').addEventListener('click', () => {
  void chrome.runtime
    .sendMessage({ action: 'recover' })
    .then(async () => {
      result.textContent =
        (await chrome.storage.local.get<{ lastResult?: string }>('lastResult')).lastResult ??
        'No pending handoffs.';
    })
    .catch(show);
});
