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
import type { ViewerDependencies } from './webmcp/viewerContext';

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
 * `onModeEnter` and torn down in `onModeExit`. WebMCP registration has a
 * separate AbortController from viewer work: a blocked or partially registered
 * tool surface must never cancel the comparison hang or disturb OHIF.
 */

type ModeDependencies = Omit<ViewerDependencies, 'sessionSignal'>;

type ModeSession = {
  activationTimer: number | null;
  controller: AbortController;
  generation: number;
  presenceSessionId: number;
  registrationController: AbortController;
  services: Record<string, unknown>;
};

let activeSession: ModeSession | null = null;
let nextGeneration = 1;
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
  .substrate-mode .substrate-host-panel-shell {
    overflow: hidden;
    background: ${token['surface/panel']} !important;
  }
  .substrate-mode .substrate-host-panel-shell [data-side-panel-header] {
    height: ${token['layout/panel-shell-header-height']} !important;
    padding: 0 ${token['space/sm']} !important;
    border-bottom: 1px solid ${token['border/strong']};
    border-radius: ${token['radius/none']} !important;
    background: ${token['surface/panel']} !important;
  }
  .substrate-mode .substrate-host-panel-shell [data-side-panel-separator],
  .substrate-mode .substrate-host-panel-shell [data-side-panel-tab-spacer] {
    display: none;
  }
  .substrate-mode .substrate-host-panel-shell [data-side-panel-toggle='open'],
  .substrate-mode .substrate-host-panel-shell [data-side-panel-tab] {
    width: ${token['layout/panel-tab-target']} !important;
    height: ${token['layout/panel-tab-target']} !important;
    margin: 0 !important;
    border-radius: ${token['radius/none']} !important;
    background: transparent !important;
  }
  .substrate-mode .substrate-host-panel-shell [data-side-panel-tab-mark] {
    width: ${token['layout/panel-tab-mark']} !important;
    height: ${token['layout/panel-tab-mark']} !important;
    margin: auto;
    border-radius: ${token['radius/inner']} !important;
    background: transparent !important;
  }
  .substrate-mode .substrate-host-panel-shell [data-side-panel-tab][data-active='true'] [data-side-panel-tab-mark] {
    background: ${token['surface/inset']} !important;
  }
  .substrate-mode .substrate-host-panel-content {
    background: ${token['surface/panel']};
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

function applyHostTheme(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.add('substrate-mode');
  const hostTheme = document.getElementById(HOST_THEME_ID) ?? document.createElement('style');
  hostTheme.id = HOST_THEME_ID;
  hostTheme.textContent = HOST_THEME;
  if (!hostTheme.isConnected) document.head.append(hostTheme);
  document.documentElement.style.setProperty('--substrate-surface-bed', token['surface/bed']);
  document.documentElement.style.setProperty('--substrate-surface-inset', token['surface/inset']);
  document.documentElement.style.setProperty('--substrate-surface-raised', token['surface/raised']);
}

function removeHostTheme(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.removeProperty('--substrate-surface-bed');
  document.documentElement.style.removeProperty('--substrate-surface-inset');
  document.documentElement.style.removeProperty('--substrate-surface-raised');
  document.documentElement.classList.remove('substrate-mode');
  document.getElementById(HOST_THEME_ID)?.remove();
}

function removeDiagnosticHandle(): void {
  if (typeof window === 'undefined') return;
  delete (window as unknown as { substrate?: unknown }).substrate;
}

function panelServiceOf(services: Record<string, unknown>) {
  return services.panelService as
    | {
        PanelPosition: { Right: unknown; Bottom: unknown };
        getPanels: (position: unknown) => Array<{ id: string }>;
        addPanel: (position: unknown, panelId: string, options?: object) => void;
        activatePanel: (panelId: string, forceActive?: boolean) => void;
        reset?: () => void;
      }
    | undefined;
}

function addSubstratePanels(session: ModeSession): void {
  const panelService = panelServiceOf(session.services);
  if (!panelService) return;
  const position = panelService.PanelPosition.Right;
  if (!panelService.getPanels(position).some(panel => panel.id === AGENT_PANEL_ID)) {
    panelService.addPanel(position, AGENT_PANEL_ID, { rightPanelClosed: false });
  }
  const bottom = panelService.PanelPosition.Bottom;
  if (!panelService.getPanels(bottom).some(panel => panel.id === AGENT_STATUS_ID)) {
    panelService.addPanel(bottom, AGENT_STATUS_ID);
  }
  session.activationTimer = window.setTimeout(() => {
    if (activeSession !== session) return;
    panelService.activatePanel(AGENT_PANEL_ID, true);
    session.activationTimer = null;
  }, 0);
}

function showRegistrationState(session: ModeSession, result: RegistrationResult): void {
  presence.setRegistration(result, session.presenceSessionId);
  mountAgentIsland(session.services, session.generation);
  addSubstratePanels(session);
}

async function bootstrapSubstrateMode(session: ModeSession, deps: ModeDependencies): Promise<void> {
  const signal = session.controller.signal;
  const tools = buildViewerTools({ ...deps, sessionSignal: signal });
  // Preparation is a viewer concern. Start it without waiting for WebMCP so a
  // blocked connection can change status, but can never hold the images hostage.
  if (token['prep/agent-independent']) void runFullPrep(tools, signal);

  const result: RegistrationResult = await register(tools, session.registrationController.signal);
  if (activeSession !== session || signal.aborted) return;

  showRegistrationState(session, result);
  if (!result.ok) {
    // Registration is transactional from the mode's perspective. Its own
    // signal cleans up tools without aborting Full prep or viewer tool calls.
    session.registrationController.abort();
    return;
  }
  if (result.registered.length !== tools.length) {
    session.registrationController.abort();
    return;
  }
}

function reportBootstrapFailure(session: ModeSession, error: unknown): void {
  if (activeSession !== session || session.controller.signal.aborted) return;
  const message = error instanceof Error ? error.message : 'Substrate could not start.';
  showRegistrationState(session, {
    ok: false,
    registered: [],
    failure: { kind: 'unknown', message },
  });
  session.registrationController.abort();
}

/** Add the Substrate WebMCP surface to the active OHIF viewer lifecycle. */
export function enterSubstrateMode(deps: ModeDependencies): void {
  if (activeSession) exitSubstrateMode();
  removeDiagnosticHandle();
  applyHostTheme();

  const session: ModeSession = {
    activationTimer: null,
    controller: new AbortController(),
    generation: nextGeneration++,
    presenceSessionId: presence.beginSession(),
    registrationController: new AbortController(),
    services: deps.servicesManager.services,
  };
  activeSession = session;
  void bootstrapSubstrateMode(session, deps).catch(error => reportBootstrapFailure(session, error));
}

/** Stop all Substrate work before OHIF resets its mode-scoped services. */
export function exitSubstrateMode(): void {
  const session = activeSession;
  activeSession = null;
  nextGeneration += 1;
  if (session) {
    session.controller.abort();
    session.registrationController.abort();
    if (session.activationTimer !== null) window.clearTimeout(session.activationTimer);
    panelServiceOf(session.services)?.reset?.();
    presence.endSession(session.presenceSessionId);
    unmountAgentIsland(session.generation);
  }
  for (const request of autonomy.getPending()) autonomy.decide(request.id, 'skip');
  clearProposals();
  clearReport();
  autonomy.setViewportResolver();
  removeHostTheme();
  removeDiagnosticHandle();
}

const substrateExtension = {
  id,
  getPanelModule,
  enterSubstrateMode,
  exitSubstrateMode,
};

export default substrateExtension;
