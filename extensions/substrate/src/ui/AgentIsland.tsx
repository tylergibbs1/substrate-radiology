import React, { useEffect, useMemo, useState } from 'react';
import geistMonoUrl from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2';
import interTightUrl from '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2';

import { autonomy } from '../engine/autonomy';
import { accept, getProposal, getProposals, subscribeProposals } from '../engine/proposals';
import {
  currentVersion,
  openReplies,
  pendingRequest,
  requestSignature,
  setSentenceReview,
  subscribeReport,
} from '../engine/report';
import { sessionLabel, token, type SurfaceElevation } from '../designTokens';
import { isWriteEvent, presence } from '../webmcp/presence';
import { liveTools, type WebMcpTool } from '../webmcp/spec';
import { AgentIslandExpanded } from './AgentIslandExpanded';
import { AgentIslandRail } from './AgentIslandRail';
import {
  CONFIRMATION_LABEL,
  formatActivity,
  groupBursts,
  IN_FLIGHT,
  relative,
} from './agentIslandModel';
import { surfaceStyle } from './agentIslandStyles';

export function AgentIsland({
  services,
  placement = 'status',
  elevation = 'raised',
}: {
  services: Record<string, unknown>;
  placement?: 'status' | 'panel';
  elevation?: SurfaceElevation;
}): React.ReactElement {
  const [, tick] = useState(0);
  const inPanel = placement === 'panel';
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [instructionsText, setInstructionsText] = useState(() =>
    autonomy.getStandingInstructions().join('\n')
  );
  const [toolAudit, setToolAudit] = useState<WebMcpTool[]>([]);
  const registration = presence.getRegistration();

  useEffect(() => {
    const off = presence.subscribe(() => tick(value => value + 1));
    const offAutonomy = autonomy.subscribe(() => tick(value => value + 1));
    const offProposals = subscribeProposals(() => tick(value => value + 1));
    const offReport = subscribeReport(() => tick(value => value + 1));
    const timer = window.setInterval(() => tick(value => value + 1), 1000);
    return () => {
      off();
      offAutonomy();
      offProposals();
      offReport();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!inPanel) return;
    let current = true;
    void liveTools().then(tools => {
      if (current) setToolAudit(tools);
    });
    return () => {
      current = false;
    };
  }, [inPanel, registration]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const panelService = services.panelService as
          | { activatePanel?: (panelId: string, forceActive?: boolean) => void }
          | undefined;
        panelService?.activatePanel?.('@substrate/extension-substrate.panelModule.agent', true);
        setCommandsOpen(value => !value);
      }
      if (event.key === 'Escape') setCommandsOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [services]);

  const pending = getProposals().filter(entry => entry.state === 'proposed');
  const confirmations = autonomy.getPending();
  const replyCount = openReplies().length;
  const signatureWaiting = pendingRequest()?.status === 'pending';
  const last = presence.getLast();
  const writes = presence
    .getEvents()
    .filter(isWriteEvent)
    .filter(event => !event.running)
    .filter(
      event =>
        event.ok || Date.now() - (event.finishedAt ?? event.startedAt) >= token['motion/error-hold']
    );
  const bursts = useMemo(() => groupBursts(writes), [writes]);
  const latestPlan = useMemo(
    () => groupBursts(presence.getEvents().filter(isWriteEvent))[0] ?? [],
    [last]
  );
  const lastWrite = presence.getLastWrite();
  const failure = registration.ok === false ? registration.failure : null;
  const supported = failure === null || failure.kind !== 'unsupported';
  const waitingCount =
    pending.length + confirmations.length + replyCount + (signatureWaiting ? 1 : 0);
  const session = presence.getSessionState(waitingCount > 0);
  const topConfirmation = confirmations[0];
  const topProposal = pending[0];
  const runningPlan = latestPlan.filter(event => event.running);

  let state = 'No agent in this browser';
  if (failure) {
    state = failure.kind === 'unsupported' ? 'No agent in this browser' : failure.message;
  } else if (session === 'error') {
    state = `${sessionLabel(session)} · ${last?.resultSummary || 'the last change did not go through'}`;
  } else if (session === 'working' && last) {
    state = `${sessionLabel(session)} · ${last.activity ? formatActivity(last.activity) : (IN_FLIGHT.get(last.tool) ?? 'updating the viewer')}`;
  } else if (session === 'waiting-for-you') {
    state = `${sessionLabel(session)} · ${waitingCount} ${waitingCount === 1 ? 'decision' : 'decisions'}`;
  } else if (session === 'done') {
    state = sessionLabel(session);
  } else if (lastWrite) {
    state = `${sessionLabel(session)} · last action ${relative(Date.now() - lastWrite.startedAt)}`;
  } else if (supported) {
    state = `${sessionLabel(session)} · no actions yet`;
  }

  const railVerb = failure
    ? failure.kind === 'unsupported'
      ? 'No agent'
      : 'Blocked'
    : sessionLabel(session);
  const railObject = topConfirmation
    ? `${CONFIRMATION_LABEL.get(topConfirmation.tool) ?? 'Change the viewer'}${
        topConfirmation.summary ? ` · ${topConfirmation.summary}` : ''
      }`
    : topProposal
      ? 'Suggested measurement'
      : signatureWaiting
        ? 'Report ready for signature'
        : replyCount > 0
          ? 'Report reply waiting'
          : session === 'working' && last
            ? last.activity
              ? formatActivity(last.activity)
              : (IN_FLIGHT.get(last.tool) ?? 'updating the viewer')
            : lastWrite
              ? `Last action ${relative(Date.now() - lastWrite.startedAt)}`
              : failure?.kind === 'unsupported'
                ? 'in this browser'
                : 'for this study';

  const repaint = () => {
    const viewportService = services.cornerstoneViewportService as
      | { getRenderingEngine?: () => { render?: () => void } | undefined }
      | undefined;
    viewportService?.getRenderingEngine?.()?.render?.();
  };

  const confirmProposal = (annotationUID: string) => {
    const proposal = getProposal(annotationUID);
    const tracking = services.trackedMeasurementsService as
      | { addTrackedSeries?: (seriesInstanceUID: string) => void }
      | undefined;
    if (proposal) tracking?.addTrackedSeries?.(proposal.targetSeriesUID);
    accept(annotationUID);
    repaint();
  };

  const showProposal = (annotationUID: string) => {
    const grid = services.viewportGridService as
      | { getState?: () => { activeViewportId: string } }
      | undefined;
    const measurementService = services.measurementService as
      | { jumpToMeasurement?: (viewportId: string, uid: string) => void }
      | undefined;
    const viewportId = grid?.getState?.().activeViewportId;
    if (viewportId) measurementService?.jumpToMeasurement?.(viewportId, annotationUID);
  };

  const nextSentence = currentVersion()?.sentences.find(
    sentence => (sentence.review ?? 'unreviewed') === 'unreviewed'
  );
  const commands = [
    {
      label: 'Accept next suggested measurement',
      disabled: pending.length === 0,
      run: () => {
        const proposal = pending[0];
        if (proposal) confirmProposal(proposal.annotationUID);
      },
    },
    {
      label: 'Adjust next suggested measurement',
      disabled: pending.length === 0,
      run: () => pending[0] && showProposal(pending[0].annotationUID),
    },
    {
      label: 'Accept next report sentence',
      disabled: !nextSentence,
      run: () => nextSentence && void setSentenceReview(nextSentence.sentenceId, 'accepted'),
    },
    {
      label: 'Reply to next report sentence',
      disabled: !nextSentence,
      run: () => {
        if (!nextSentence) return;
        window.dispatchEvent(
          new CustomEvent('substrate:reply', { detail: { sentenceId: nextSentence.sentenceId } })
        );
      },
    },
    {
      label: 'Jump to next cited measurement',
      disabled: !nextSentence?.provenance[0],
      run: () =>
        nextSentence?.provenance[0] && showProposal(nextSentence.provenance[0].measurementId),
    },
    {
      label: 'Review and sign report',
      disabled: !currentVersion(),
      run: () => requestSignature('Review the current report and its cited measurements.'),
    },
  ];

  const sharedStyles = (
    <style>{`
      @font-face { font-family: 'Inter Tight'; src: url('${interTightUrl}') format('woff2'); font-style: normal; font-weight: 100 900; font-display: swap; }
      @font-face { font-family: 'Geist Mono'; src: url('${geistMonoUrl}') format('woff2'); font-style: normal; font-weight: 100 900; font-display: swap; }
      .substrate-island, .substrate-island * { box-sizing: border-box; font-weight: 400; }
      .substrate-island { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
      .substrate-island h1, .substrate-island h2, .substrate-island h3 { text-wrap: ${token['wrap/heading']}; }
      .substrate-island p { text-wrap: ${token['wrap/body']}; }
      .substrate-island button, .substrate-island input, .substrate-island textarea, .substrate-island select { font-weight: 400; }
      .substrate-thinking-label { color: ${token['ink/low']}; background: linear-gradient(90deg, ${token['ink/low']} 20%, ${token['ink/high']} 50%, ${token['ink/low']} 80%); background-size: 200% 100%; background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: substrate-thinking-shimmer ${token['motion/shimmer']}ms linear infinite; }
      .substrate-state-copy { animation: substrate-state-copy-in ${token['motion/state-copy']}ms ease-out both; }
      .substrate-autonomy-pill { min-height: 30px; padding: 4px 9px; color: ${token['ink/low']}; background: transparent; border: 1px solid ${token['on/disabled']}; border-radius: ${token['radius/full']}; font: ${token['text/ui']}; white-space: nowrap; cursor: pointer; }
      .substrate-autonomy-pill[aria-pressed='true'] { color: ${token['on/signal']}; background: ${token['agent/mark']}; border-color: ${token['agent/mark']}; }
      .substrate-island button:focus-visible, .substrate-island input:focus-visible, .substrate-island textarea:focus-visible, .substrate-island select:focus-visible, .substrate-island summary:focus-visible { outline: 1px solid ${token['ink/low']}; outline-offset: 2px; }
      .substrate-control { transition: border-color ${token['motion/enter']}ms ease-out, color ${token['motion/enter']}ms ease-out, background-color ${token['motion/enter']}ms ease-out, transform ${token['motion/exit']}ms ease-out; }
      .substrate-control:hover { border-color: ${token['ink/low']} !important; }
      .substrate-control:active { transform: scale(.96); }
      .substrate-touch-hitbox { position: relative; }
      .substrate-touch-hitbox::after { position: absolute; top: 50%; left: 50%; width: ${token['hit/target']}; height: ${token['hit/target']}; content: ''; transform: translate(-50%, -50%); }
      .substrate-history-undo { opacity: 0; transition: color ${token['motion/enter']}ms ease-out, opacity ${token['motion/enter']}ms ease-out; }
      .substrate-history-row:hover .substrate-history-undo, .substrate-history-undo:focus-visible { opacity: 1; }
      .substrate-disclosure { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; width: 100%; min-height: ${token['hit/target']}; padding: 0; color: ${token['ink/low']}; font: ${token['text/ui']}; list-style: none; cursor: pointer; transition: color ${token['motion/enter']}ms ease-out; }
      .substrate-disclosure::-webkit-details-marker { display: none; }
      .substrate-disclosure::marker { content: ''; }
      .substrate-disclosure::after { width: ${token['icon/disclosure-size']}; height: ${token['icon/disclosure-size']}; margin-right: ${token['space/xs']}; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; content: ''; transform: rotate(-45deg); transition: transform ${token['motion/enter']}ms ease-out; }
      details[open] > .substrate-disclosure::after { transform: rotate(45deg); }
      .substrate-disclosure:hover { color: ${token['ink/high']}; }
      .substrate-rail-button { min-height: ${token['hit/target']}; padding: 7px ${token['space/md']}; border: 1px solid ${token['border/hairline']}; border-radius: ${token['radius/inner']}; background: transparent; color: ${token['ink/high']}; font: ${token['text/ui']}; cursor: pointer; transition: border-color ${token['motion/enter']}ms ease-out, color ${token['motion/enter']}ms ease-out, background-color ${token['motion/enter']}ms ease-out, transform ${token['motion/exit']}ms ease-out; }
      .substrate-rail-button:hover { border-color: ${token['ink/low']}; }
      .substrate-rail-button:active { transform: scale(.96); }
      .substrate-rail-button--primary { padding-inline: ${token['space/lg']}; border-color: ${token['action/primary']}; background: ${token['action/primary']}; color: ${token['on/primary']}; }
      .substrate-rail-button--primary:hover { border-color: ${token['action/primary-hover']}; background: ${token['action/primary-hover']}; color: ${token['on/primary']}; }
      .substrate-rail-button--primary:active { background: ${token['action/primary-press']}; }
      @keyframes substrate-thinking-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
      @keyframes substrate-state-copy-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) { .substrate-island * { animation: none !important; transition: none !important; } }
      @media (hover: none) { .substrate-history-undo { opacity: 1; } }
    `}</style>
  );

  if (inPanel) {
    return (
      <section
        className="substrate-island"
        aria-label="Agent work"
        data-substrate-system={token['system/bench']}
        style={{
          ...surfaceStyle(elevation),
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {sharedStyles}
        <AgentIslandExpanded
          services={services}
          commandsOpen={commandsOpen}
          commands={commands}
          closeCommands={() => setCommandsOpen(false)}
          instructionsText={instructionsText}
          setInstructionsText={setInstructionsText}
          confirmations={confirmations}
          runningPlan={runningPlan}
          pending={pending}
          confirmProposal={confirmProposal}
          showProposal={showProposal}
          repaint={repaint}
          bursts={bursts}
          toolAudit={toolAudit}
          registration={registration}
          session={session}
          railVerb={railVerb}
          railObject={railObject}
        />
      </section>
    );
  }

  const openPanel = () => {
    const panelService = services.panelService as
      | { activatePanel?: (panelId: string, forceActive?: boolean) => void }
      | undefined;
    panelService?.activatePanel?.('@substrate/extension-substrate.panelModule.agent', true);
  };

  return (
    <section
      className="substrate-island"
      aria-label="Agent activity"
      data-substrate-system={token['system/bench']}
      style={{
        ...surfaceStyle(elevation),
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {sharedStyles}
      <AgentIslandRail
        state={state}
        session={session}
        railVerb={railVerb}
        railObject={railObject}
        last={last}
        topConfirmation={topConfirmation}
        setOpen={open => open && openPanel()}
        decideConfirmation={(id, decision) => {
          autonomy.decide(id, decision);
        }}
      />
    </section>
  );
}
