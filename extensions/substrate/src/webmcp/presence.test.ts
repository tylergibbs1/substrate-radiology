import { presence } from './presence';

function finish(callId: number, tool: string, startedAt: number): void {
  presence.finish(callId, {
    tool,
    argsSummary: '',
    resultSummary: 'done',
    entities: [],
    ok: true,
    startedAt,
  });
}

describe('presence sessions', () => {
  it('discards completions from a mode session that has ended', () => {
    const session = presence.beginSession();
    const callId = presence.begin('navigate', 'slice 2', 1);

    presence.endSession(session);
    finish(callId, 'navigate', 1);

    expect(presence.getEvents()).toEqual([]);
  });

  it('keeps working while any write is running concurrently', () => {
    const session = presence.beginSession();
    const write = presence.begin('hang_layout', '2 series', 1);
    const read = presence.begin('get_context', '', 2);
    finish(read, 'get_context', 2);

    expect(presence.getSessionState()).toBe('working');

    finish(write, 'hang_layout', 1);
    expect(presence.getSessionState(false, 3_000)).toBe('idle');
    presence.endSession(session);
  });

  it('ignores a stale registration result', () => {
    const staleSession = presence.beginSession();
    const currentSession = presence.beginSession();

    presence.setRegistration(
      { ok: false, registered: [], failure: { kind: 'unknown', message: 'stale' } },
      staleSession
    );

    expect(presence.getRegistration()).toEqual({ ok: true, registered: [] });
    presence.endSession(currentSession);
  });
});
