import { id } from './id';
import { buildViewerTools } from './webmcp/viewerTools';
import { register, type RegistrationResult } from './webmcp/spec';
import { presence } from './webmcp/presence';
import { mountAgentIsland, unmountAgentIsland } from './ui/mount';
import { clearProposals } from './engine/proposals';
import { clearReport } from './engine/report';
import { autonomy } from './engine/autonomy';
import getPanelModule, { AGENT_PANEL_ID, AGENT_STATUS_ID } from './getPanelModule';
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

  const result: RegistrationResult = await register(tools, session.registrationController.signal);
  if (activeSession !== session || signal.aborted) return;

  showRegistrationState(session, result);
  if (!result.ok) {
    // Registration is transactional from the mode's perspective. Its own
    // signal cleans up tools without aborting viewer tool calls.
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
  removeDiagnosticHandle();
}

const substrateExtension = {
  id,
  getPanelModule,
  enterSubstrateMode,
  exitSubstrateMode,
};

export default substrateExtension;
