import { describe, expect, it, vi } from 'vitest';
import type { BrowserOperation, BrowserResponse, BrowserState } from '@dm/contracts';
import { Handoff, type HandoffPorts, type Pending } from '../../apps/browser-extension/src/handoff';

function setup(overrides: Partial<HandoffPorts> = {}) {
  const records = new Map<string, Pending>();
  const state = (requestId: string, state: BrowserState): BrowserResponse => ({
    version: 1,
    requestId,
    state,
    job: null,
    error: null,
  });
  const ports: HandoffPorts = {
    call: vi.fn(async (id: string, command: BrowserOperation) =>
      state(
        id,
        (
          {
            hello: 'ready',
            prepare: 'prepared',
            commit: 'committed',
            abort: 'aborted',
            status: 'committed',
          } as const
        )[command.operation],
      ),
    ),
    save: vi.fn(async (pending: Pending) => {
      records.set(pending.id, { ...pending });
    }),
    remove: vi.fn(async (id: string) => {
      records.delete(id);
    }),
    pause: vi.fn(async () => {}),
    isPaused: vi.fn(async () => true),
    canTransfer: vi.fn(async () => true),
    resume: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    ...overrides,
  };
  return { ports, records, state, handoff: new Handoff(ports) };
}

describe('download ownership', () => {
  it('aborts if browser safety classification changes before commit', async () => {
    const s = setup({ canTransfer: vi.fn(async () => false) });
    await expect(s.handoff.submit('https://example.com/file', null, null, 1)).rejects.toThrow(
      'changed during handoff',
    );
    expect(vi.mocked(s.ports.call).mock.calls.some(([, c]) => c.operation === 'commit')).toBe(
      false,
    );
    expect(s.ports.cancel).not.toHaveBeenCalled();
  });
  it('pauses before preparation and cancels only after accepted commit', async () => {
    const { ports, records, handoff } = setup();
    await handoff.submit('https://example.com/file', null, null, 12);
    expect(ports.pause).toHaveBeenCalledWith(12);
    expect(ports.cancel).toHaveBeenCalledWith(12);
    expect(ports.resume).not.toHaveBeenCalled();
    expect(records.size).toBe(0);
    expect(vi.mocked(ports.pause).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ports.call).mock.invocationCallOrder[1],
    );
    expect(vi.mocked(ports.cancel).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(ports.call).mock.invocationCallOrder[2],
    );
  });
  it('leaves downloads untouched if the app is closed', async () => {
    const { ports, handoff } = setup({
      call: vi.fn(async () => {
        throw new Error('App closed');
      }),
    });
    await expect(handoff.submit('https://example.com/file', null, null, 1)).rejects.toThrow(
      'App closed',
    );
    expect(ports.pause).not.toHaveBeenCalled();
    expect(ports.cancel).not.toHaveBeenCalled();
  });
  it('resumes after rejected preparation', async () => {
    const s = setup();
    vi.mocked(s.ports.call).mockImplementation(async (id, command) =>
      s.state(id, command.operation === 'hello' ? 'ready' : 'error'),
    );
    await expect(s.handoff.submit('https://example.com/file', null, null, 1)).rejects.toThrow();
    expect(s.ports.resume).toHaveBeenCalledWith(1);
    expect(s.ports.cancel).not.toHaveBeenCalled();
  });
  it('resolves lost commit acknowledgments through status without a second commit', async () => {
    const s = setup();
    vi.mocked(s.ports.call).mockImplementation(async (id, command) => {
      if (command.operation === 'commit') throw new Error('Lost reply');
      return s.state(
        id,
        command.operation === 'hello'
          ? 'ready'
          : command.operation === 'prepare'
            ? 'prepared'
            : 'committed',
      );
    });
    await expect(s.handoff.submit('https://example.com/file', null, null, 1)).resolves.toBe(
      'Sent to Download It.',
    );
    expect(
      vi.mocked(s.ports.call).mock.calls.filter(([, c]) => c.operation === 'commit'),
    ).toHaveLength(1);
    expect(s.ports.resume).not.toHaveBeenCalled();
  });
  it('keeps ambiguous commits paused and durable for recovery', async () => {
    const s = setup();
    vi.mocked(s.ports.call).mockImplementation(async (id, c) => {
      if (['commit', 'status'].includes(c.operation)) throw new Error('Disconnected');
      return s.state(id, c.operation === 'hello' ? 'ready' : 'prepared');
    });
    await expect(s.handoff.submit('https://example.com/file', null, null, 1)).rejects.toThrow(
      'Handoff needs attention',
    );
    expect([...s.records.values()][0].phase).toBe('committing');
    expect(s.ports.resume).not.toHaveBeenCalled();
    expect(s.ports.cancel).not.toHaveBeenCalled();
  });
  it('returns failed enqueues to the browser', async () => {
    const s = setup();
    vi.mocked(s.ports.call).mockImplementation(async (id, c) =>
      s.state(
        id,
        c.operation === 'hello' ? 'ready' : c.operation === 'prepare' ? 'prepared' : 'failed',
      ),
    );
    await s.handoff.submit('https://example.com/file', null, null, 1);
    expect(s.ports.resume).toHaveBeenCalledWith(1);
    expect(s.ports.cancel).not.toHaveBeenCalled();
  });
  it('recovers worker restarts on either side of commit', async () => {
    const s = setup();
    await s.handoff.recover({ id: 'prepared', downloadId: 1, phase: 'preparing' });
    expect(s.ports.resume).toHaveBeenCalledWith(1);
    await s.handoff.recover({ id: 'accepted', downloadId: 2, phase: 'accepted' });
    expect(s.ports.cancel).toHaveBeenCalledWith(2);
  });
  it('retains accepted handoffs when browser cancellation fails', async () => {
    const s = setup({
      cancel: vi.fn(async () => {
        throw new Error('Browser cancellation failed');
      }),
    });
    await expect(s.handoff.submit('https://example.com/file', null, null, 1)).rejects.toThrow();
    expect([...s.records.values()][0].phase).toBe('accepted');
    expect(s.ports.resume).not.toHaveBeenCalled();
  });
});
