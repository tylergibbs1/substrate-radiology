import { id } from './id';
import { buildViewerTools } from './webmcp/viewerTools';
import { register, type RegistrationResult } from './webmcp/spec';
import { presence } from './webmcp/presence';
import { mountAgentIsland, unmountAgentIsland } from './ui/mount';
import { runFullPrep } from './engine/prep';
import { clearProposals } from './engine/proposals';
import { clearReport } from './engine/report';
import { autonomy } from './engine/autonomy';
import getPanelModule, { AGENT_PANEL_ID, AGENT_STATUS_ID } from './getPanelModule';
import { token } from './designTokens';

/**
 * Substrate: an agent-native radiology workflow, as an OHIF extension.
 *
 * The radiologist reads. The agent does everything around the reading —
 * hanging the study, navigating, keeping measurements organized, matching
 * lesions across timepoints, assembling the report. It cannot interpret an
 * image, and that is enforced by the shape of the tool surface rather than by
 * asking it nicely: no tool returns pixel data, and no tool creates a finding
 * out of the agent's own judgment.
 *
 * The tools live on the mode, not on the app. They are registered in
 * `onModeEnter` against a single AbortController and torn down in
 * `onModeExit`, because registering a duplicate name throws InvalidStateError —
 * so there must never be two controllers alive at once.
 */

let controller: AbortController | null = null;

const substrateExtension = {
  id,

  getPanelModule,

  /**
   * Registration happens on mode enter rather than at app start, so the live
   * tool surface always matches the route the radiologist is actually on.
   */
  onModeEnter: async ({ servicesManager, commandsManager, extensionManager }): Promise<void> => {
    document.documentElement.style.setProperty('--substrate-surface-bed', token['surface/bed']);
    document.documentElement.style.setProperty('--substrate-surface-inset', token['surface/inset']);
    document.documentElement.style.setProperty(
      '--substrate-surface-raised',
      token['surface/raised']
    );
    // Abort any previous surface and let it settle before registering again.
    // Two live controllers means duplicate names, which throws.
    if (controller) {
      controller.abort();
      controller = null;
      await Promise.resolve();
    }

    // A development handle. OHIF does not expose its services on window, and
    // every probe of live viewer state needs them. Namespaced so it cannot
    // collide, and read-only in the sense that nothing in the product reads it.
    (window as unknown as { substrate?: unknown }).substrate = {
      services: servicesManager.services,
      commands: commandsManager,
    };

    controller = new AbortController();
    const tools = buildViewerTools({ servicesManager, commandsManager, extensionManager });
    const result: RegistrationResult = await register(tools, controller.signal);
    presence.setRegistration(result);
    mountAgentIsland(servicesManager.services);
    const panelService = servicesManager.services.panelService as
      | {
          PanelPosition: { Right: unknown; Bottom: unknown };
          getPanels: (position: unknown) => Array<{ id: string }>;
          addPanel: (position: unknown, panelId: string, options?: object) => void;
          activatePanel: (panelId: string, forceActive?: boolean) => void;
        }
      | undefined;
    if (panelService) {
      const position = panelService.PanelPosition.Right;
      if (!panelService.getPanels(position).some(panel => panel.id === AGENT_PANEL_ID)) {
        panelService.addPanel(position, AGENT_PANEL_ID, { rightPanelClosed: false });
      }
      const bottom = panelService.PanelPosition.Bottom;
      if (!panelService.getPanels(bottom).some(panel => panel.id === AGENT_STATUS_ID)) {
        panelService.addPanel(bottom, AGENT_STATUS_ID);
      }
      window.setTimeout(() => panelService.activatePanel(AGENT_PANEL_ID, true), 0);
    }
    void runFullPrep(tools, controller.signal);
  },

  onModeExit: (): void => {
    controller?.abort();
    controller = null;
    presence.setRegistration({ ok: true, registered: [] });
    presence.clear();
    clearProposals();
    clearReport();
    autonomy.setViewportResolver();
    document.documentElement.style.removeProperty('--substrate-surface-bed');
    document.documentElement.style.removeProperty('--substrate-surface-inset');
    document.documentElement.style.removeProperty('--substrate-surface-raised');
    unmountAgentIsland();
  },
};

export default substrateExtension;
