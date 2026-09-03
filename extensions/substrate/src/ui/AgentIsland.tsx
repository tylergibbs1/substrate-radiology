import React, { useEffect, useMemo, useState } from 'react';

import { autonomy } from '../engine/autonomy';
import { accept, getProposal, getProposals, reject, subscribeProposals } from '../engine/proposals';
import { isWriteEvent, presence, type ToolCallEvent } from '../webmcp/presence';
import { autonomyLabel, sessionLabel, token, type AutonomyLevel } from '../designTokens';
import { AgentMark, ThinkingIndicator } from './ThinkingIndicator';
import { ReviewThread } from './ReviewThread';
import { TimingComparison } from './TimingComparison';
import {
  currentVersion,
  openReplies,
  pendingRequest,
  requestSignature,
  setSentenceReview,
  subscribeReport,
} from '../engine/report';
import { liveTools, type WebMcpTool } from '../webmcp/spec';

const BURST_GAP_MS = 3500;

const IN_FLIGHT = new Map<string, string>([
  ['navigate', 'moving through the study'],
  ['set_display', 'adjusting the display'],
  ['hang_layout', 'hanging the study'],
  ['propose_measurement', 'proposing a measurement'],
  ['draft_report', 'drafting the report'],
  ['request_signature', 'preparing signature review'],
]);

const CONFIRMATION_LABEL = new Map<string, string>([
  ['navigate', 'Move through the study'],
  ['set_display', 'Adjust the display'],
  ['hang_layout', 'Hang the study'],
  ['propose_measurement', 'Suggest a measurement'],
  ['draft_report', 'Draft the report'],
]);

const AUTONOMY_LEVELS: AutonomyLevel[] = ['assist', 'auto-prep', 'full-prep'];

function relative(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 1) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function finishedPhrase(event: ToolCallEvent): string {
  if (!event.ok) return event.resultSummary || 'The change did not go through';
  switch (event.tool) {
    case 'hang_layout':
      return 'Hung the study';
    case 'set_display':
      return event.argsSummary ? `Applied ${event.argsSummary}` : 'Adjusted the display';
    case 'navigate':
      return event.argsSummary ? `Moved to ${event.argsSummary}` : 'Moved through the study';
    case 'propose_measurement':
      return 'Proposed a measurement on the prior';
    case 'draft_report':
      return 'Drafted the report from cited measurements';
    case 'request_signature':
      return 'Sent the report for signature review';
    default:
      return 'Updated the viewer';
  }
}

function groupBursts(events: ToolCallEvent[]): ToolCallEvent[][] {
  const groups: ToolCallEvent[][] = [];
  for (const event of events) {
    const group = groups[groups.length - 1];
    if (!group || Math.abs(group[group.length - 1].startedAt - event.startedAt) > BURST_GAP_MS) {
      groups.push([event]);
    } else {
      group.push(event);
    }
  }
  return groups;
}

function summarizeBurst(events: ToolCallEvent[]): string {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const event of events) {
    const key = `${event.tool}:${event.argsSummary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(finishedPhrase(event));
  }
  return phrases.join('. ');
}

export function AgentIsland({
  services,
}: {
  services: Record<string, unknown>;
}): React.ReactElement {
  const [, tick] = useState(0);
  const [open, setOpen] = useState(false);
  const [instructionsText, setInstructionsText] = useState(() =>
    autonomy.getStandingInstructions().join('\n')
  );
  const [toolAudit, setToolAudit] = useState<WebMcpTool[]>([]);
  const [commandsOpen, setCommandsOpen] = useState(false);
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
    if (!open) return;
    let current = true;
    void liveTools().then(tools => {
      if (current) setToolAudit(tools);
    });
    return () => {
      current = false;
    };
  }, [open, registration]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        setCommandsOpen(value => !value);
      }
      if (event.key === 'Escape') setCommandsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pending = getProposals().filter(entry => entry.state === 'proposed');
  const confirmations = autonomy.getPending();
  const replyCount = openReplies().length;
  const signatureWaiting = pendingRequest()?.status === 'pending';
  const last = presence.getLast();
  const writes = presence
    .getEvents()
    .filter(isWriteEvent)
    .filter(event => !event.running);
  const bursts = useMemo(() => groupBursts(writes), [writes]);
  const latestPlan = useMemo(
    () => groupBursts(presence.getEvents().filter(isWriteEvent))[0] ?? [],
    [last]
  );
  const lastWrite = presence.getLastWrite();
  const failure = registration.ok ? null : registration.failure;
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
    state = `${sessionLabel(session)} · ${IN_FLIGHT.get(last.tool) ?? 'updating the viewer'}`;
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
    : session === 'waiting-for-you'
      ? `${waitingCount} ${waitingCount === 1 ? 'decision' : 'decisions'}`
      : session === 'error'
        ? 'Failed'
        : 'Ready';
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
            ? (IN_FLIGHT.get(last.tool) ?? 'updating the viewer')
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

  const show = (annotationUID: string) => {
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
        if (proposal) {
          confirmProposal(proposal.annotationUID);
        }
      },
    },
    {
      label: 'Adjust next suggested measurement',
      disabled: pending.length === 0,
      run: () => pending[0] && show(pending[0].annotationUID),
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
      run: () => nextSentence?.provenance[0] && show(nextSentence.provenance[0].measurementId),
    },
    {
      label: 'Review and sign report',
      disabled: !currentVersion(),
      run: () => requestSignature('Review the current report and its cited measurements.'),
    },
  ];

  const surface: React.CSSProperties = {
    background: token['surface/panel'],
    border: `1px solid ${token['border/hairline']}`,
    color: '#d0d6e0',
    fontSize: token['text/ui'],
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontFeatureSettings: '"cv01" 1, "ss03" 1, "zero" 1',
  };

  return (
    <div
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <section
        aria-label="Agent activity"
        style={{
          ...surface,
          width: '100%',
          borderRadius: 0,
          overflow: 'hidden',
          pointerEvents: 'auto',
          boxShadow: '0 -6px 20px rgba(0,0,0,.28)',
        }}
      >
        <style>{`
          .substrate-rail-button { min-height: 40px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: ${token['ink/low']}; font: inherit; font-size: 11.5px; cursor: pointer; transition: background-color 100ms ease, color 100ms ease, transform 100ms ease; }
          .substrate-rail-button:hover { background: ${token['surface/room']}; color: ${token['ink/high']}; }
          .substrate-rail-button:active { transform: scale(.96); }
          .substrate-rail-button:focus-visible { outline: none; box-shadow: 0 0 0 1px ${token['surface/panel']}, 0 0 0 3px ${token['action/primary']}; }
          .substrate-rail-button--primary { background: ${token['action/primary']}; color: ${token['on/primary']}; }
          .substrate-rail-button--primary:hover { background: ${token['action/primary-hover']}; color: ${token['on/primary']}; }
          .substrate-rail-button--primary:active { background: ${token['action/primary-press']}; }
          @media (prefers-reduced-motion: reduce) { .substrate-rail-button { transition: none; } }
        `}</style>
        {open ? (
          <div
            style={{
              maxHeight: 'min(46vh, 390px)',
              overflowY: 'auto',
              borderBottom: `1px solid ${token['border/hairline']}`,
            }}
          >
            {commandsOpen ? (
              <section
                aria-label="Substrate commands"
                style={{
                  padding: '10px 14px',
                  borderBottom: `1px solid ${token['border/hairline']}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <h2 style={{ margin: 0, color: '#e5e5e6', fontSize: 12, fontWeight: 510 }}>
                    Commands
                  </h2>
                  <span style={{ color: '#62666d', fontSize: 10.5 }}>⌘K</span>
                </div>
                <div style={{ display: 'grid', marginTop: 6 }}>
                  {commands.map(command => (
                    <button
                      key={command.label}
                      type="button"
                      disabled={command.disabled}
                      onClick={() => {
                        command.run();
                        setCommandsOpen(false);
                      }}
                      style={{
                        padding: '5px 0',
                        color: command.disabled ? '#45484e' : '#d0d6e0',
                        background: 'transparent',
                        border: 0,
                        font: 'inherit',
                        fontSize: 11.5,
                        textAlign: 'left',
                        cursor: command.disabled ? 'default' : 'pointer',
                      }}
                    >
                      {command.label}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <details
              aria-label="Autonomy"
              style={{
                borderBottom: `1px solid ${token['border/hairline']}`,
              }}
            >
              <summary
                style={{
                  minHeight: 40,
                  padding: '0 14px',
                  display: 'flex',
                  alignItems: 'center',
                  color: token['ink/low'],
                  cursor: 'pointer',
                  fontSize: 11.5,
                }}
              >
                Workflow · {autonomyLabel(autonomy.getLevel())}
              </summary>
              <div style={{ display: 'grid', gap: 12, padding: '0 14px 12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div
                    role="group"
                    aria-label="Autonomy level"
                    style={{
                      display: 'inline-flex',
                      padding: 2,
                      background: token['surface/room'],
                      border: `1px solid ${token['border/hairline']}`,
                      borderRadius: 6,
                    }}
                  >
                    {AUTONOMY_LEVELS.map(level => {
                      const selected = autonomy.getLevel() === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => autonomy.setLevel(level)}
                          style={{
                            padding: '4px 7px',
                            color: selected ? '#e5e5e6' : '#62666d',
                            background: selected ? '#23252a' : 'transparent',
                            border: 0,
                            borderRadius: 4,
                            font: 'inherit',
                            fontSize: 10.5,
                            cursor: 'pointer',
                          }}
                        >
                          {autonomyLabel(level)}
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ color: '#62666d', fontSize: 10.5, textAlign: 'right' }}>
                    Workflow only · you confirm findings and sign
                  </span>
                </div>
                <textarea
                  aria-label="Standing instructions"
                  rows={1}
                  value={instructionsText}
                  onChange={event => setInstructionsText(event.target.value)}
                  onBlur={() => autonomy.setStandingInstructions(instructionsText.split('\n'))}
                  placeholder="Standing instructions…"
                  style={{
                    boxSizing: 'border-box',
                    width: '100%',
                    minHeight: 30,
                    padding: '6px 8px',
                    resize: 'vertical',
                    color: '#d0d6e0',
                    background: token['surface/room'],
                    border: `1px solid ${token['border/hairline']}`,
                    borderRadius: 5,
                    outline: 0,
                    font: 'inherit',
                    fontSize: 11,
                    lineHeight: 1.45,
                  }}
                />
              </div>
            </details>

            {confirmations.length > 1 ? (
              <section style={{ padding: '12px 14px' }}>
                <h2 style={{ margin: 0, color: '#e5e5e6', fontSize: 12, fontWeight: 510 }}>
                  Waiting for you
                </h2>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                  {confirmations.slice(1).map(request => (
                    <li
                      key={request.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0,1fr) auto auto',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 0',
                        borderTop: `1px solid ${token['border/hairline']}`,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          color: '#d0d6e0',
                          fontSize: 11.5,
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {CONFIRMATION_LABEL.get(request.tool) ?? 'Change the viewer'}
                        {request.summary ? ` · ${request.summary}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => autonomy.decide(request.id, 'skip')}
                        style={{
                          padding: '5px 8px',
                          color: '#8a8f98',
                          background: 'transparent',
                          border: `1px solid ${token['border/hairline']}`,
                          borderRadius: 6,
                          font: 'inherit',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => autonomy.decide(request.id, 'apply')}
                        style={{
                          padding: '5px 9px',
                          color: '#08090a',
                          background: token['state/confirmed'],
                          border: 0,
                          borderRadius: 6,
                          font: 'inherit',
                          fontSize: 11,
                          fontWeight: 510,
                          cursor: 'pointer',
                        }}
                      >
                        Apply
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {runningPlan.length > 0 ? (
              <section style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: token['agent/accent'], display: 'flex' }}>
                    <AgentMark size={11} />
                  </span>
                  <h2 style={{ margin: 0, color: '#e5e5e6', fontSize: 12, fontWeight: 510 }}>
                    Plan
                  </h2>
                </div>
                <ol style={{ listStyle: 'none', margin: '7px 0 0', padding: 0 }}>
                  {runningPlan
                    .filter(
                      (event, index, events) =>
                        events.findIndex(
                          candidate =>
                            candidate.tool === event.tool &&
                            candidate.argsSummary === event.argsSummary
                        ) === index
                    )
                    .reverse()
                    .map(event => (
                      <li
                        key={event.callId}
                        style={{ display: 'flex', gap: 7, color: '#8a8f98', fontSize: 11.5 }}
                      >
                        <span aria-hidden>{event.running ? '○' : event.ok ? '✓' : '—'}</span>
                        <span>
                          {event.running
                            ? (IN_FLIGHT.get(event.tool) ?? 'updating the viewer')
                            : finishedPhrase(event)}
                        </span>
                      </li>
                    ))}
                </ol>
              </section>
            ) : null}

            {pending.length > 1 ? (
              <section style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <h2 style={{ margin: 0, color: '#e5e5e6', fontSize: 12, fontWeight: 510 }}>
                      Suggested measurements
                    </h2>
                    <p
                      style={{
                        margin: '4px 0 0',
                        color: '#8a8f98',
                        fontSize: 11,
                        lineHeight: 1.45,
                      }}
                    >
                      Nothing enters the report until you accept it.
                    </p>
                  </div>
                  <span style={{ color: token['ink/low'], fontSize: 11 }}>
                    {pending.length - 1}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                  {pending.slice(1).map(proposal => (
                    <li
                      key={proposal.annotationUID}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0,1fr) auto auto',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 0',
                        borderTop: `1px solid ${token['border/hairline']}`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => show(proposal.annotationUID)}
                        style={{
                          minWidth: 0,
                          padding: 0,
                          overflow: 'hidden',
                          color: proposal.aligned
                            ? token['state/proposed']
                            : token['state/unaligned'],
                          background: 'transparent',
                          border: 0,
                          font: 'inherit',
                          fontSize: 11.5,
                          textAlign: 'left',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                      >
                        {proposal.aligned
                          ? 'Matching slice'
                          : `Nearest slice · ${proposal.offsetMm} mm offset`}
                      </button>
                      <button
                        type="button"
                        onClick={() => show(proposal.annotationUID)}
                        style={{
                          padding: '5px 8px',
                          color: '#8a8f98',
                          background: 'transparent',
                          border: `1px solid ${token['border/hairline']}`,
                          borderRadius: 6,
                          font: 'inherit',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Adjust
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          confirmProposal(proposal.annotationUID);
                        }}
                        style={{
                          padding: '5px 9px',
                          color: '#08090a',
                          background: '#e4f222',
                          border: 0,
                          borderRadius: 6,
                          font: 'inherit',
                          fontSize: 11,
                          fontWeight: 510,
                          cursor: 'pointer',
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          reject(proposal.annotationUID);
                          repaint();
                        }}
                        style={{
                          gridColumn: '1 / -1',
                          justifySelf: 'start',
                          padding: 0,
                          color: '#62666d',
                          background: 'transparent',
                          border: 0,
                          font: 'inherit',
                          fontSize: 10.5,
                          cursor: 'pointer',
                        }}
                      >
                        Discard suggestion
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <ReviewThread services={services} />

            {bursts.length > 0 ? (
              <section style={{ padding: '12px 14px' }}>
                <h2 style={{ margin: 0, color: '#e5e5e6', fontSize: 12, fontWeight: 510 }}>
                  Recent work
                </h2>
                <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                  {bursts.slice(0, 3).map(burst => {
                    const newest = burst[0];
                    const undo = burst.find(event => event.undo)?.undo;
                    return (
                      <li
                        key={newest.callId}
                        title={new Date(newest.startedAt).toLocaleString()}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '9px 0',
                          borderTop: `1px solid ${token['border/hairline']}`,
                        }}
                      >
                        <p
                          style={{
                            flex: 1,
                            margin: 0,
                            color: newest.ok ? '#d0d6e0' : '#eb8a8a',
                            fontSize: 11.5,
                            lineHeight: 1.45,
                          }}
                        >
                          {summarizeBurst(burst)}
                        </p>
                        {undo ? (
                          <button
                            type="button"
                            onClick={undo}
                            style={{
                              padding: 0,
                              color: '#8a8f98',
                              background: 'transparent',
                              border: 0,
                              font: 'inherit',
                              fontSize: 10.5,
                              cursor: 'pointer',
                            }}
                          >
                            Undo
                          </button>
                        ) : null}
                        <time
                          style={{
                            color: '#62666d',
                            font: token['text/measure'],
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {relative(Date.now() - newest.startedAt)}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}
            <details style={{ borderTop: `1px solid ${token['border/hairline']}` }}>
              <summary
                style={{
                  minHeight: 40,
                  padding: '0 14px',
                  display: 'flex',
                  alignItems: 'center',
                  color: token['ink/low'],
                  cursor: 'pointer',
                  fontSize: 11.5,
                }}
              >
                Timing
              </summary>
              <TimingComparison />
            </details>
            <details
              style={{
                padding: '8px 14px',
                borderTop: `1px solid ${token['border/hairline']}`,
                color: '#62666d',
                fontSize: 10.5,
              }}
            >
              <summary style={{ cursor: 'pointer' }}>
                Tool self-test · {toolAudit.length}/
                {registration.ok ? registration.registered.length : 10}
              </summary>
              <p style={{ margin: '6px 0 0' }}>A connected agent can see this page.</p>
              <ul style={{ listStyle: 'none', margin: '7px 0 0', padding: 0 }}>
                {toolAudit.map(tool => (
                  <li
                    key={tool.name}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                  >
                    <span>{tool.title}</span>
                    <span>
                      {tool.annotations?.readOnlyHint ? 'Read' : 'Write'}
                      {tool.annotations?.untrustedContentHint ? ' · untrusted' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}

        <div
          role="status"
          aria-live="polite"
          aria-label={`Agent activity: ${state}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto auto minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            minHeight: 48,
            padding: '4px 8px',
            color: 'inherit',
            background: 'transparent',
          }}
        >
          <span
            style={{
              minWidth: 62,
              padding: '3px 8px',
              borderRadius: 999,
              color: session === 'error' ? token['review/rejected'] : token['ink/low'],
              background: token['surface/room'],
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '.06em',
              textAlign: 'center',
              textTransform: 'uppercase',
            }}
          >
            {session === 'working' ? (
              <ThinkingIndicator
                size="compact"
                showIcon
              />
            ) : (
              sessionLabel(session)
            )}
          </span>
          <strong style={{ color: token['ink/high'], fontSize: 12, fontWeight: 510 }}>
            {railVerb}
          </strong>
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              color: token['ink/low'],
              fontSize: 11.5,
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {railObject}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {session === 'working' && last?.stop ? (
              <button
                className="substrate-rail-button"
                type="button"
                onClick={last.stop}
              >
                Stop
              </button>
            ) : topConfirmation ? (
              <>
                <button
                  className="substrate-rail-button"
                  type="button"
                  onClick={() => autonomy.decide(topConfirmation.id, 'skip')}
                >
                  Skip
                </button>
                <button
                  className="substrate-rail-button substrate-rail-button--primary"
                  type="button"
                  onClick={() => autonomy.decide(topConfirmation.id, 'apply')}
                >
                  Apply
                </button>
              </>
            ) : topProposal ? (
              <>
                <button
                  className="substrate-rail-button"
                  type="button"
                  onClick={() => {
                    show(topProposal.annotationUID);
                    setOpen(true);
                  }}
                >
                  Adjust
                </button>
                <button
                  className="substrate-rail-button substrate-rail-button--primary"
                  type="button"
                  onClick={() => confirmProposal(topProposal.annotationUID)}
                >
                  Accept
                </button>
              </>
            ) : null}
            <button
              className="substrate-rail-button"
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(value => !value)}
            >
              {open
                ? 'Close'
                : bursts.length > 0
                  ? `${bursts.length} ${bursts.length === 1 ? 'step' : 'steps'}`
                  : 'History'}
            </button>
            <abbr
              title="Research use only. Not for diagnostic use."
              style={{
                color: token['ink/dim'],
                font: token['text/measure'],
                textDecoration: 'none',
              }}
            >
              RUO
            </abbr>
          </span>
        </div>
      </section>
    </div>
  );
}
