import type { BrowserFileEvidence, BrowserOperation, BrowserResponse } from '@dm/contracts';

export interface Pending {
  id: string;
  downloadId?: number;
  phase: 'preparing' | 'committing' | 'accepted';
}
export interface HandoffPorts {
  call(id: string, command: BrowserOperation): Promise<BrowserResponse>;
  save(pending: Pending): Promise<void>;
  remove(id: string): Promise<void>;
  pause(id: number): Promise<void>;
  isPaused(id: number): Promise<boolean>;
  canTransfer(id: number): Promise<boolean>;
  resume(id: number): Promise<void>;
  cancel(id: number): Promise<void>;
}
const uncertain =
  'Handoff needs attention. Open Download It, then click Check pending handoffs. The browser download remains paused until ownership is confirmed.';

export class Handoff {
  constructor(private ports: HandoffPorts) {}

  async submit(
    url: string,
    filename: string | null,
    evidence: BrowserFileEvidence | null,
    downloadId?: number,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const hello = await this.ports.call(id, { operation: 'hello' });
    if (hello.state !== 'ready')
      throw new Error(hello.error?.message ?? 'Download It is not ready.');
    const pending: Pending = { id, downloadId, phase: 'preparing' };
    await this.ports.save(pending);
    try {
      if (downloadId !== undefined) {
        await this.ports.pause(downloadId);
        if (!(await this.ports.isPaused(downloadId)))
          throw new Error('The browser download is no longer eligible.');
      }
      const prepared = await this.ports.call(id, { operation: 'prepare', url, filename, evidence });
      if (prepared.state !== 'prepared')
        throw new Error(prepared.error?.message ?? 'Download It could not prepare this file.');
      if (
        downloadId !== undefined &&
        (!(await this.ports.isPaused(downloadId)) || !(await this.ports.canTransfer(downloadId)))
      )
        throw new Error('The browser download changed during handoff.');
      // Write before sending: a worker can stop immediately after desktop acceptance.
      pending.phase = 'committing';
      await this.ports.save(pending);
      const committed = await this.ports.call(id, { operation: 'commit' });
      return await this.resolve(pending, committed);
    } catch (error) {
      if (pending.phase === 'preparing') {
        // No commit was sent, so the browser still owns the transfer.
        await this.ports.call(id, { operation: 'abort' }).catch(() => undefined);
        await this.fallback(pending);
        throw error;
      }
      return this.recover(pending);
    }
  }

  async recover(pending: Pending): Promise<string> {
    if (pending.phase === 'accepted') return this.finish(pending);
    if (pending.phase === 'preparing') {
      await this.ports.call(pending.id, { operation: 'abort' }).catch(() => undefined);
      await this.fallback(pending);
      return pending.downloadId === undefined
        ? 'The interrupted submission was discarded. You can submit the link again.'
        : 'The download was kept in your browser.';
    }
    try {
      let response = await this.ports.call(pending.id, { operation: 'status' });
      if (response.state === 'prepared')
        response = await this.ports.call(pending.id, { operation: 'abort' });
      return await this.resolve(pending, response);
    } catch {
      throw new Error(uncertain);
    }
  }

  private async resolve(pending: Pending, response: BrowserResponse): Promise<string> {
    if (response.state === 'committed') {
      pending.phase = 'accepted';
      await this.ports.save(pending);
      return this.finish(pending);
    }
    if (['failed', 'aborted', 'not_found'].includes(response.state)) {
      await this.fallback(pending);
      return (
        response.job?.error?.message ??
        (pending.downloadId === undefined
          ? 'Download It did not accept the file. You can submit the link again.'
          : 'Download It did not accept the file. The browser download was kept.')
      );
    }
    throw new Error(uncertain);
  }

  private async finish(pending: Pending): Promise<string> {
    if (pending.downloadId !== undefined) await this.ports.cancel(pending.downloadId);
    await this.ports.remove(pending.id);
    return 'Sent to Download It.';
  }
  private async fallback(pending: Pending): Promise<void> {
    if (pending.downloadId !== undefined && (await this.ports.isPaused(pending.downloadId)))
      await this.ports.resume(pending.downloadId);
    await this.ports.remove(pending.id);
  }
}
