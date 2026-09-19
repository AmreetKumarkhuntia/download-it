import type { BrowserFileEvidence } from '@dm/contracts';

export interface Observation {
  requestId: string;
  url: string;
  method: string;
  at: number;
  evidence?: BrowserFileEvidence;
}

export function directUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      raw.length <= 16_384
    )
      return url;
  } catch {
    /* Invalid links stay in the browser. */
  }
}

export function excluded(url: string, domains: string[]): boolean {
  const host = directUrl(url)?.hostname.toLowerCase();
  return !host || domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function parseDomains(text: string): string[] {
  const domains = [
    ...new Set(
      text
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean),
    ),
  ];
  if (
    domains.some(
      (d) => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(d),
    )
  )
    throw new Error('Enter domain names such as example.com, without URLs or paths.');
  return domains;
}

export function evidenceFromHeaders(
  method: string,
  status: number,
  headers: { name: string; value?: string }[],
): BrowserFileEvidence | undefined {
  const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name)?.value;
  const encoding = get('content-encoding');
  const contentType = get('content-type')?.split(';')[0].trim().toLowerCase();
  const length = get('content-length');
  const totalBytes = length && /^\d+$/.test(length) ? Number(length) : NaN;
  const etag = get('etag') ?? null;
  const lastModified = get('last-modified') ?? null;
  if (
    method !== 'GET' ||
    status !== 200 ||
    (encoding && encoding !== 'identity') ||
    !Number.isSafeInteger(totalBytes) ||
    !contentType ||
    ['text/html', 'application/xhtml+xml'].includes(contentType) ||
    (!etag?.startsWith('"') && !lastModified)
  )
    return;
  return { method, totalBytes, contentType, etag, lastModified };
}

export function matchObservation(
  item: { url: string; finalUrl: string; startTime: string },
  observations: Observation[],
  now: number,
): BrowserFileEvidence | undefined {
  const candidates = observations.filter(
    (o) =>
      o.url === item.finalUrl &&
      Math.abs(o.at - Date.parse(item.startTime)) < 10_000 &&
      now - o.at < 30_000,
  );
  // DownloadItem has no network request ID. Never guess between concurrent requests.
  return candidates.length === 1 && candidates[0].method === 'GET'
    ? candidates[0].evidence
    : undefined;
}
