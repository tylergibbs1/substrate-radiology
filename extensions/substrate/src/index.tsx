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
const HOST_THEME_ID = 'substrate-host-theme';
// Neutral host chrome keeps the agent mark as the only hue in Substrate mode.
const HOST_THEME = `
  :root.substrate-mode {
    --highlight: 0 0% 85%;
    --neutral: 0 0% 49%;
    --neutral-light: 0 0% 85%;
    --neutral-dark: 0 0% 11%;
    --background: 0 0% 2%;
    --foreground: 0 0% 100%;
    --card: 0 0% 11%;
    --card-foreground: 0 0% 100%;
    --popover: 0 0% 11%;
    --popover-foreground: 0 0% 100%;
    --primary: 0 0% 85%;
    --primary-foreground: 0 0% 11%;
    --secondary: 0 0% 17%;
    --secondary-foreground: 0 0% 85%;
    --muted: 0 0% 11%;
    --muted-foreground: 0 0% 85%;
    --accent: 0 0% 17%;
    --accent-foreground: 0 0% 100%;
    --border: 0 0% 17%;
    --input: 0 0% 22%;
    --ring: 0 0% 27%;
  }
  .substrate-mode [data-active='true'] button { background: ${token['surface/inset']} !important; color: ${token['ink/high']} !important; }
  .substrate-mode #viewerLayoutResizableRightPanel { min-width: ${token['layout/panel-width']} !important; }
  .substrate-mode #viewerLayoutResizableRightPanel[data-panel-size='0.0'] {
    min-width: 0 !important;
    max-width: 0 !important;
  }
  .substrate-mode .border-highlight { border-color: ${token['border/strong']} !important; }
  .substrate-mode .text-primary,
  .substrate-mode .text-primary-light,
  .substrate-mode .text-primary-active,
  .substrate-mode .text-highlight,
  .substrate-mode .text-actions-primary { color: ${token['ink/low']} !important; }
  .substrate-mode .bg-primary,
  .substrate-mode .bg-primary-main,
  .substrate-mode .bg-primary-active,
  .substrate-mode .bg-primary-light,
  .substrate-mode .bg-primary-dark,
  .substrate-mode .bg-secondary-dark,
  .substrate-mode .bg-secondary-main,
  .substrate-mode .bg-secondary-light,
  .substrate-mode .bg-highlight,
  .substrate-mode .bg-customblue-40,
  .substrate-mode .bg-bkg-med { background-color: ${token['surface/inset']} !important; }
  .substrate-mode .bg-bkg-low { background-color: ${token['surface/room']} !important; }
  .substrate-mode .border-primary,
  .substrate-mode .border-primary-dark,
  .substrate-mode .border-secondary-light { border-color: ${token['border/strong']} !important; }
  .substrate-mode [data-radix-popper-content-wrapper] .text-primary-foreground {
    color: ${token['host/tooltip-ink']} !important;
  }
`;

const substrateExtension = {
  id,

  getPanelModule,

  /**
   * Registration happens on mode enter rather than at app start, so the live
   * tool surface always matches the route the radiologist is actually on.
   */
  onModeEnter: async ({ servicesManager, commandsManager, extensionManager }): Promise<void> => {
    document.documentElement.classList.add('substrate-mode');
    const hostTheme = document.getElementById(HOST_THEME_ID) ?? document.createElement('style');
    hostTheme.id = HOST_THEME_ID;
    hostTheme.textContent = HOST_THEME;
    if (!hostTheme.isConnected) document.head.append(hostTheme);
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
    document.documentElement.classList.remove('substrate-mode');
    document.getElementById(HOST_THEME_ID)?.remove();
    unmountAgentIsland();
  },
};

export default substrateExtension;
