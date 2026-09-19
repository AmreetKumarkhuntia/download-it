import { describe, expect, it } from 'vitest';
import {
  directUrl,
  evidenceFromHeaders,
  excluded,
  matchObservation,
  parseDomains,
  type Observation,
} from '../../apps/browser-extension/src/capture';

describe('capture eligibility', () => {
  const headers = [
    { name: 'Content-Length', value: '100' },
    { name: 'Content-Type', value: 'application/zip' },
    { name: 'ETag', value: '"v1"' },
  ];
  it('requires a verifiable plain GET response', () => {
    expect(evidenceFromHeaders('GET', 200, headers)?.totalBytes).toBe(100);
    expect(evidenceFromHeaders('POST', 200, headers)).toBeUndefined();
    expect(evidenceFromHeaders('GET', 403, headers)).toBeUndefined();
    expect(evidenceFromHeaders('GET', 200, headers.slice(0, 2))).toBeUndefined();
    expect(
      evidenceFromHeaders('GET', 200, [...headers, { name: 'Content-Encoding', value: 'gzip' }]),
    ).toBeUndefined();
  });
  it('rejects login pages, unknown lengths, and unsafe numeric lengths', () => {
    for (const value of ['text/html', 'application/xhtml+xml'])
      expect(
        evidenceFromHeaders('GET', 200, [{ name: 'Content-Type', value }, headers[0], headers[2]]),
      ).toBeUndefined();
    expect(
      evidenceFromHeaders('GET', 200, [
        { name: 'Content-Length', value: '9007199254740992' },
        ...headers.slice(1),
      ]),
    ).toBeUndefined();
  });
  it('does not guess between concurrent or stale network requests', () => {
    const at = Date.now();
    const url = 'https://example.com/file';
    const item = { url, finalUrl: url, startTime: new Date(at).toISOString() };
    const observation: Observation = {
      requestId: '1',
      url,
      at,
      method: 'GET',
      evidence: evidenceFromHeaders('GET', 200, headers),
    };
    expect(matchObservation(item, [observation], at)).toBeDefined();
    expect(
      matchObservation(item, [observation, { ...observation, requestId: '2' }], at),
    ).toBeUndefined();
    expect(matchObservation(item, [observation], at + 31_000)).toBeUndefined();
  });
  it('matches excluded domains without matching unrelated suffixes', () => {
    const domains = parseDomains('EXAMPLE.com, example.com localhost');
    expect(domains).toEqual(['example.com', 'localhost']);
    expect(excluded('https://files.example.com/a', domains)).toBe(true);
    expect(excluded('https://notexample.com/a', domains)).toBe(false);
    expect(() => parseDomains('https://example.com/')).toThrow();
    for (const url of [
      'blob:https://example.com/a',
      'file:///tmp/test',
      'https://user:pass@example.com/a',
    ])
      expect(directUrl(url)).toBeUndefined();
  });
});
