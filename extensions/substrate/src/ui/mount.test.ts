const roots: Array<{ render: jest.Mock; unmount: jest.Mock }> = [];

jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => {
    const root = { render: jest.fn(), unmount: jest.fn() };
    roots.push(root);
    return root;
  }),
}));
jest.mock('./AgentViewportSignature', () => ({ AgentViewportSignature: () => null }));
jest.mock('./SignatureModal', () => ({ SignatureModal: () => null }));

import { mountAgentIsland, unmountAgentIsland } from './mount';

describe('agent island lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    roots.length = 0;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    unmountAgentIsland();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('does not let deferred teardown remove a newer session', () => {
    mountAgentIsland({}, 1);
    const oldContainer = document.getElementById('substrate-agent-island');
    unmountAgentIsland(1);
    mountAgentIsland({}, 2);
    const currentContainer = document.getElementById('substrate-agent-island');

    expect(currentContainer).not.toBe(oldContainer);
    jest.runOnlyPendingTimers();

    expect(roots[0].unmount).toHaveBeenCalledTimes(1);
    expect(roots[1].unmount).not.toHaveBeenCalled();
    expect(document.getElementById('substrate-agent-island')).toBe(currentContainer);
  });

  it('ignores teardown requested for an older generation', () => {
    mountAgentIsland({}, 3);
    const currentContainer = document.getElementById('substrate-agent-island');

    unmountAgentIsland(2);
    jest.runOnlyPendingTimers();

    expect(roots[0].unmount).not.toHaveBeenCalled();
    expect(document.getElementById('substrate-agent-island')).toBe(currentContainer);
  });
});
