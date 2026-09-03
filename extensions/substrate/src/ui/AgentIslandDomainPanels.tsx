import React from 'react';

import { autonomy } from '../engine/autonomy';
import { reject, type Proposal } from '../engine/proposals';
import { token } from '../designTokens';
import type { ToolCallEvent } from '../webmcp/presence';
import { AgentMark } from './ThinkingIndicator';
import {
  CONFIRMATION_LABEL,
  finishedPhrase,
  formatActivity,
  IN_FLIGHT,
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
  if (confirmations.length <= 1) return null;
  return (
    <section style={sectionStyle}>
      <h2 style={panelHeadingStyle}>Waiting for you</h2>
      <ul style={{ ...listResetStyle, display: 'grid' }}>
        {confirmations.slice(1).map(request => (
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

export function RecentWork({ bursts }: { bursts: ToolCallEvent[][] }): React.ReactElement | null {
  if (bursts.length === 0) return null;
  const events = bursts
    .flat()
    .slice(0, 8)
    .reverse()
    .filter(
      (event, index, ordered) =>
        index === 0 || finishedPhrase(event) !== finishedPhrase(ordered[index - 1])
    )
    .slice(-4);
  return (
    <section style={sectionStyle}>
      <h2 style={panelHeadingStyle}>Recent work</h2>
      <ol style={{ ...listResetStyle, display: 'grid' }}>
        {events.map(event => {
          const undo = event.undo;
          return (
            <li
              className="substrate-history-row"
              key={event.callId}
              style={{
                display: 'grid',
                gridTemplateColumns: `${token['agent/lamp-size']} minmax(0,1fr) auto ${token['lane/history-time']}`,
                alignItems: 'baseline',
                columnGap: token['space/md'],
                minHeight: token['hit/target'],
                padding: `${token['space/sm']} 0`,
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
                <span
                  className="substrate-state-copy"
                  key={relative(Date.now() - event.startedAt)}
                >
                  {relative(Date.now() - event.startedAt)}
                </span>
              </time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
