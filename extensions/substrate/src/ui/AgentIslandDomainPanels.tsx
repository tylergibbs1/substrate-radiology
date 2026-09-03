import React from 'react';

import { autonomy } from '../engine/autonomy';
import { reject, type Proposal } from '../engine/proposals';
import { token } from '../designTokens';
import type { ToolCallEvent } from '../webmcp/presence';
import { AgentMark } from './ThinkingIndicator';
import {
  chronologicalHistory,
  CONFIRMATION_LABEL,
  finishedPhrase,
  formatActivity,
  IN_FLIGHT,
  recentWorkWindow,
  relative,
} from './agentIslandModel';
import {
  listResetStyle,
  panelHeadingStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from './agentIslandStyles';

const sectionStyle: React.CSSProperties = {
  display: 'grid',
  gap: token['space/md'],
  paddingTop: token['space/md'],
  borderTop: `1px solid ${token['border/hairline']}`,
};

export function PendingConfirmations({
  confirmations,
}: {
  confirmations: ReturnType<typeof autonomy.getPending>;
}): React.ReactElement | null {
  if (confirmations.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <h2 style={panelHeadingStyle}>Waiting for you</h2>
      <ul style={{ ...listResetStyle, display: 'grid' }}>
        {confirmations.map(request => (
          <li
            key={request.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) auto auto',
              alignItems: 'center',
              gap: token['space/sm'],
              padding: `${token['space/sm']} 0`,
              borderBottom: `1px solid ${token['border/hairline']}`,
            }}
          >
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {CONFIRMATION_LABEL.get(request.tool) ?? 'Change the viewer'}
              {request.summary ? ` · ${request.summary}` : ''}
            </span>
            <button
              className="substrate-control"
              type="button"
              onClick={() => autonomy.decide(request.id, 'skip')}
              style={secondaryButtonStyle}
            >
              Skip
            </button>
            <button
              className="substrate-control"
              type="button"
              onClick={() => autonomy.decide(request.id, 'apply')}
              style={primaryButtonStyle}
            >
              Apply
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RunningPlan({ events }: { events: ToolCallEvent[] }): React.ReactElement | null {
  if (events.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <h2 style={panelHeadingStyle}>Plan</h2>
      <ol style={{ ...listResetStyle, display: 'grid' }}>
        {events
          .filter(
            (event, index, allEvents) =>
              allEvents.findIndex(
                candidate =>
                  candidate.tool === event.tool && candidate.argsSummary === event.argsSummary
              ) === index
          )
          .reverse()
          .map(event => (
            <li
              key={event.callId}
              style={{
                display: 'grid',
                gridTemplateColumns: `${token['agent/lamp-size']} minmax(0, 1fr)`,
                alignItems: 'center',
                gap: token['space/md'],
                minHeight: token['hit/target'],
                padding: `${token['space/sm']} 0`,
                color: event.running ? token['ink/high'] : token['ink/low'],
                borderBottom: `1px solid ${token['border/hairline']}`,
              }}
            >
              {event.running ? <AgentMark /> : <span />}
              <span>
                {event.running
                  ? event.activity
                    ? formatActivity(event.activity)
                    : (IN_FLIGHT.get(event.tool) ?? 'updating the viewer')
                  : finishedPhrase(event)}
              </span>
            </li>
          ))}
      </ol>
    </section>
  );
}

type SuggestedMeasurementsProps = {
  proposals: Proposal[];
  confirmProposal: (annotationUID: string) => void;
  showProposal: (annotationUID: string) => void;
  repaint: () => void;
};

export function SuggestedMeasurements({
  proposals,
  confirmProposal,
  showProposal,
  repaint,
}: SuggestedMeasurementsProps): React.ReactElement | null {
  if (proposals.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <h2 style={panelHeadingStyle}>Suggested measurements</h2>
      <p style={{ margin: 0, color: token['ink/low'] }}>
        Nothing enters the report until you accept it.
      </p>
      <ul
        style={{
          ...listResetStyle,
          display: 'grid',
          gap: token['space/xs'],
          padding: '8px 10px',
          background: token['surface/inset'],
          borderRadius: token['radius/inner'],
        }}
      >
        {proposals.map(proposal => (
          <li
            key={proposal.annotationUID}
            style={{
              display: 'grid',
              gridTemplateColumns: `${token['agent/lamp-size']} minmax(0,1fr) auto`,
              alignItems: 'center',
              gap: token['space/sm'],
              padding: `${token['space/sm']} 0`,
            }}
          >
            <AgentMark />
            <button
              className="substrate-control"
              type="button"
              onClick={() => showProposal(proposal.annotationUID)}
              style={{
                minHeight: token['hit/target'],
                minWidth: 0,
                padding: 0,
                overflow: 'hidden',
                color: token['ink/low'],
                background: 'transparent',
                border: 0,
                font: token['text/ui'],
                textAlign: 'left',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: token['ink/high'] }}>{proposal.label}</span>
              <span style={{ color: token['ink/low'], font: token['text/measure'] }}>
                {' · '}
                {proposal.aligned ? 'matched' : `${proposal.offsetMm} mm offset`}
              </span>
            </button>
            <button
              className="substrate-control"
              type="button"
              onClick={() => confirmProposal(proposal.annotationUID)}
              style={primaryButtonStyle}
            >
              Accept
            </button>
            <span
              style={{
                gridColumn: '2 / -1',
                display: 'flex',
                gap: token['space/base'],
              }}
            >
              <button
                className="substrate-control substrate-touch-hitbox"
                type="button"
                onClick={() => showProposal(proposal.annotationUID)}
                style={{
                  position: 'relative',
                  padding: 0,
                  color: token['ink/low'],
                  background: 'transparent',
                  border: 0,
                  font: token['text/ui'],
                  cursor: 'pointer',
                }}
              >
                Adjust
              </button>
              <button
                className="substrate-control substrate-touch-hitbox"
                type="button"
                onClick={() => {
                  reject(proposal.annotationUID);
                  repaint();
                }}
                style={{
                  position: 'relative',
                  padding: 0,
                  color: token['ink/low'],
                  background: 'transparent',
                  border: 0,
                  font: token['text/ui'],
                  cursor: 'pointer',
                }}
              >
                Discard
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type HistoryRowsProps = {
  animateWindow?: boolean;
  events: ToolCallEvent[];
  fadeOverflow?: boolean;
};

function HistoryRows({
  animateWindow = false,
  events,
  fadeOverflow = false,
}: HistoryRowsProps): React.ReactElement {
  const listRef = React.useRef<HTMLOListElement>(null);
  const previousPositions = React.useRef(new Map<number, number>());
  const hasPreviousWindow = previousPositions.current.size > 0;

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const rows = list.querySelectorAll<HTMLElement>('[data-history-call-id]');
    const nextPositions = new Map<number, number>();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    rows.forEach(row => {
      const callId = Number(row.dataset.historyCallId);
      const top = row.offsetTop;
      const previousTop = previousPositions.current.get(callId);
      nextPositions.set(callId, top);

      if (
        animateWindow &&
        !reduceMotion &&
        previousTop !== undefined &&
        previousTop !== top &&
        typeof row.animate === 'function'
      ) {
        row.getAnimations().forEach(animation => animation.cancel());
        row.animate(
          [{ transform: `translateY(${previousTop - top}px)` }, { transform: 'translateY(0)' }],
          {
            duration: token['motion/history-slide'],
            easing: token['motion/ease-in-out'],
          }
        );
      }
    });

    previousPositions.current = nextPositions;
  }, [animateWindow, events]);

  return (
    <ol
      ref={listRef}
      className={animateWindow ? 'substrate-history-window' : undefined}
      style={{ ...listResetStyle, display: 'grid' }}
    >
      {events.map((event, index) => {
        const undo = event.undo;
        const opacity =
          !fadeOverflow || !event.ok
            ? 1
            : index === 0
              ? token['history/fade-oldest']
              : index === 1
                ? token['history/fade-next']
                : 1;

        return (
          <li
            className={`substrate-history-row${
              animateWindow && hasPreviousWindow && index === events.length - 1
                ? 'substrate-history-row--newest'
                : ''
            }`}
            data-history-call-id={event.callId}
            data-history-faded={opacity < 1 ? 'true' : undefined}
            key={event.callId}
            style={{
              display: 'grid',
              gridTemplateColumns: `${token['agent/lamp-size']} minmax(0,1fr) auto ${token['lane/history-time']}`,
              alignItems: 'baseline',
              columnGap: token['space/md'],
              minHeight: token['history/row-height'],
              padding: `${token['space/xs']} 0`,
              opacity,
              borderBottom: `1px solid ${token['border/hairline']}`,
            }}
          >
            <span
              style={{
                display: 'flex',
                minHeight: '19px',
                alignSelf: 'center',
                alignItems: 'center',
              }}
            >
              <AgentMark error={!event.ok} />
            </span>
            <p
              style={{
                minWidth: 0,
                margin: 0,
                overflow: 'hidden',
                color: event.ok ? token['ink/high'] : token['status/error'],
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {finishedPhrase(event)}
            </p>
            {undo ? (
              <button
                className="substrate-control substrate-touch-hitbox substrate-history-undo"
                type="button"
                onClick={undo}
                style={{
                  position: 'relative',
                  minHeight: 20,
                  padding: 0,
                  color: token['ink/low'],
                  background: 'transparent',
                  border: 0,
                  font: token['text/ui'],
                  cursor: 'pointer',
                }}
              >
                Undo
              </button>
            ) : (
              <span />
            )}
            <time
              aria-label={new Date(event.startedAt).toLocaleString()}
              style={{
                width: token['lane/history-time'],
                color: token['ink/low'],
                font: token['text/measure'],
                fontFeatureSettings: token['feature/tabular'],
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: token['tracking/data'],
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}
            >
              {relative(Date.now() - event.startedAt)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityHistory({
  bursts,
}: {
  bursts: ToolCallEvent[][];
}): React.ReactElement | null {
  const events = chronologicalHistory(bursts.flat());
  if (events.length === 0) return null;
  return <HistoryRows events={events} />;
}

export function RecentWork({
  bursts,
  onViewAll,
}: {
  bursts: ToolCallEvent[][];
  onViewAll: () => void;
}): React.ReactElement | null {
  const [open, setOpen] = React.useState<boolean>(token['history/default-open']);
  const allEvents = bursts.flat();
  if (allEvents.length === 0) return null;
  const { events, hasOverflow, total } = recentWorkWindow(allEvents, token['history/max-rows']);
  const actionLabel = `${total} recent ${total === 1 ? 'action' : 'actions'}`;
  return (
    <section style={sectionStyle}>
      <details
        open={open}
        onToggle={event => setOpen(event.currentTarget.open)}
      >
        <summary
          className="substrate-disclosure"
          aria-label={`${actionLabel}. Show completed work`}
        >
          {actionLabel}
        </summary>
        {open ? (
          <>
            <HistoryRows
              animateWindow
              events={events}
              fadeOverflow={hasOverflow}
            />
            {hasOverflow ? (
              <button
                className="substrate-control substrate-touch-hitbox"
                type="button"
                onClick={onViewAll}
                style={{
                  position: 'relative',
                  width: '100%',
                  minHeight: token['hit/target'],
                  padding: 0,
                  color: token['ink/low'],
                  background: 'transparent',
                  border: 0,
                  font: token['text/ui'],
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                View all activity
              </button>
            ) : null}
          </>
        ) : null}
      </details>
    </section>
  );
}
