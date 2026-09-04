jest.mock('./webmcp/viewerTools', () => ({ buildViewerTools: jest.fn() }));
jest.mock('./webmcp/spec', () => ({ register: jest.fn() }));
jest.mock('./ui/mount', () => ({
  mountAgentIsland: jest.fn(),
  unmountAgentIsland: jest.fn(),
}));
jest.mock('./engine/prep', () => ({ runFullPrep: jest.fn() }));
jest.mock('./engine/proposals', () => ({ clearProposals: jest.fn() }));
jest.mock('./engine/report', () => ({ clearReport: jest.fn() }));
jest.mock('./engine/autonomy', () => ({
  autonomy: {
    decide: jest.fn(),
    getPending: jest.fn(() => []),
    setViewportResolver: jest.fn(),
  },
}));
jest.mock('./getPanelModule', () => ({
  __esModule: true,
  default: jest.fn(() => []),
  AGENT_PANEL_ID: '@substrate/extension-substrate.panelModule.agent',
  AGENT_STATUS_ID: '@substrate/extension-substrate.panelModule.agentStatus',
}));

import substrateExtension, { enterSubstrateMode, exitSubstrateMode } from './index';
import { buildViewerTools } from './webmcp/viewerTools';
import { register } from './webmcp/spec';
import { mountAgentIsland } from './ui/mount';
import { runFullPrep } from './engine/prep';
import { autonomy } from './engine/autonomy';

const tool = {
  name: 'get_context',
  title: 'Context',
  description: 'Context',
  execute: jest.fn(),
};

function dependencies() {
  const panelService = {
    PanelPosition: { Right: 'right', Bottom: 'bottom' },
    getPanels: jest.fn(() => []),
    addPanel: jest.fn(),
    activatePanel: jest.fn(),
    reset: jest.fn(),
  };
  return {
    deps: {
      servicesManager: { services: { panelService } },
      commandsManager: { runCommand: jest.fn() },
      extensionManager: {},
    },
    panelService,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Substrate mode lifecycle', () => {
  beforeEach(() => {
    exitSubstrateMode();
    jest.clearAllMocks();
    (buildViewerTools as jest.Mock).mockReturnValue([tool]);
  });

  afterEach(() => {
    exitSubstrateMode();
  });

  it('does not expose global OHIF lifecycle hooks', () => {
    expect(substrateExtension).not.toHaveProperty('onModeEnter');
    expect(substrateExtension).not.toHaveProperty('onModeExit');
    expect(substrateExtension.enterSubstrateMode).toBe(enterSubstrateMode);
    expect(substrateExtension.exitSubstrateMode).toBe(exitSubstrateMode);
  });

  it('keeps prep running when WebMCP is unsupported', async () => {
    (register as jest.Mock).mockResolvedValue({
      ok: false,
      registered: [],
      failure: { kind: 'unsupported' },
    });
    const { deps } = dependencies();

    enterSubstrateMode(deps);
    await settle();

    expect(buildViewerTools).toHaveBeenCalledWith(
      expect.objectContaining({ sessionSignal: expect.any(AbortSignal) })
    );
    expect(mountAgentIsland).toHaveBeenCalledTimes(1);
    const sessionSignal = (buildViewerTools as jest.Mock).mock.calls[0][0].sessionSignal;
    expect(runFullPrep).toHaveBeenCalledWith([tool], sessionSignal);
    expect(sessionSignal.aborted).toBe(false);
  });

  it('discards registration completion after mode exit', async () => {
    let finishRegistration: (value: unknown) => void = () => undefined;
    (register as jest.Mock).mockReturnValue(
      new Promise(resolve => {
        finishRegistration = resolve;
      })
    );
    const { deps, panelService } = dependencies();

    enterSubstrateMode(deps);
    exitSubstrateMode();
    finishRegistration({ ok: true, registered: ['get_context'] });
    await settle();

    expect(mountAgentIsland).not.toHaveBeenCalled();
    expect(panelService.addPanel).not.toHaveBeenCalled();
    expect(runFullPrep).toHaveBeenCalledTimes(1);
    const prepSignal = (runFullPrep as jest.Mock).mock.calls[0][1] as AbortSignal;
    expect(prepSignal.aborted).toBe(true);
  });

  it('keeps a rapid re-entry isolated from the previous registration', async () => {
    let finishFirstRegistration: (value: unknown) => void = () => undefined;
    (register as jest.Mock)
      .mockReturnValueOnce(
        new Promise(resolve => {
          finishFirstRegistration = resolve;
        })
      )
      .mockResolvedValueOnce({ ok: true, registered: ['get_context'] });
    const first = dependencies();
    const second = dependencies();

    enterSubstrateMode(first.deps);
    const firstSignal = (register as jest.Mock).mock.calls[0][1] as AbortSignal;
    enterSubstrateMode(second.deps);
    await settle();
    finishFirstRegistration({ ok: true, registered: ['get_context'] });
    await settle();

    expect(firstSignal.aborted).toBe(true);
    expect(mountAgentIsland).toHaveBeenCalledTimes(1);
    expect(mountAgentIsland).toHaveBeenCalledWith(
      second.deps.servicesManager.services,
      expect.any(Number)
    );
    expect(runFullPrep).toHaveBeenCalledTimes(2);
    const firstPrepSignal = (runFullPrep as jest.Mock).mock.calls[0][1] as AbortSignal;
    const secondPrepSignal = (runFullPrep as jest.Mock).mock.calls[1][1] as AbortSignal;
    expect(firstPrepSignal.aborted).toBe(true);
    expect(secondPrepSignal.aborted).toBe(false);
  });

  it('cancels panel activation and pending autonomy decisions on exit', async () => {
    jest.useFakeTimers();
    (register as jest.Mock).mockResolvedValue({ ok: true, registered: ['get_context'] });
    (autonomy.getPending as jest.Mock).mockReturnValueOnce([{ id: 'confirmation-1' }]);
    const { deps, panelService } = dependencies();

    enterSubstrateMode(deps);
    await settle();
    exitSubstrateMode();
    jest.runOnlyPendingTimers();

    expect(autonomy.decide).toHaveBeenCalledWith('confirmation-1', 'skip');
    expect(panelService.activatePanel).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('starts prep before WebMCP registration settles', async () => {
    (register as jest.Mock).mockReturnValue(new Promise(() => undefined));
    const { deps } = dependencies();

    enterSubstrateMode(deps);
    await settle();

    const sessionSignal = (buildViewerTools as jest.Mock).mock.calls[0][0].sessionSignal;
    expect(runFullPrep).toHaveBeenCalledWith([tool], sessionSignal);
    expect(mountAgentIsland).not.toHaveBeenCalled();
  });
});
