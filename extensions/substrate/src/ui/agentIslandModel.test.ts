import type { ToolCallEvent } from '../webmcp/presence';
import { chronologicalHistory, finishedPhrase, recentWorkWindow } from './agentIslandModel';

function event(callId: number, ok = true): ToolCallEvent {
  return {
    callId,
    owner: 'active-reader',
    delegate: 'substrate',
    tool: 'set_display',
    argsSummary: `preset ${callId}`,
    resultSummary: '',
    entities: [],
    ok,
    startedAt: callId,
  };
}

describe('recent work window', () => {
  it('keeps the latest 6 actions and orders them oldest to newest', () => {
    const newestFirst = Array.from({ length: 8 }, (_, index) => event(8 - index));

    expect(recentWorkWindow(newestFirst, 6)).toMatchObject({
      events: [
        { callId: 3 },
        { callId: 4 },
        { callId: 5 },
        { callId: 6 },
        { callId: 7 },
        { callId: 8 },
      ],
      hasOverflow: true,
      total: 8,
    });
  });

  it('does not mark a full but untrimmed window as overflowed', () => {
    const newestFirst = Array.from({ length: 6 }, (_, index) => event(6 - index));

    expect(recentWorkWindow(newestFirst, 6)).toMatchObject({
      events: [
        { callId: 1 },
        { callId: 2 },
        { callId: 3 },
        { callId: 4 },
        { callId: 5 },
        { callId: 6 },
      ],
      hasOverflow: false,
      total: 6,
    });
  });
});

describe('activity history order', () => {
  it('puts the earliest retained action first without mutating presence order', () => {
    const newestFirst = [event(3), event(2), event(1)];

    expect(chronologicalHistory(newestFirst).map(item => item.callId)).toEqual([1, 2, 3]);
    expect(newestFirst.map(item => item.callId)).toEqual([3, 2, 1]);
  });
});

describe('failed activity copy', () => {
  it('shows the returned reason instead of repeating the input summary', () => {
    const failed = event(1, false);
    failed.resultSummary = 'The prior series was still loading.';
    failed.activity = {
      action: 'Could not complete',
      parameter: '2 across, 1 row, 2 series',
    };

    expect(finishedPhrase(failed)).toBe(
      'Could not complete · The prior series was still loading.'
    );
  });
});
