import React from 'react';

import { autonomy } from '../engine/autonomy';
import { token, type SessionState } from '../designTokens';
import type { ToolCallEvent } from '../webmcp/presence';
import { AgentMark, ThinkingIndicator } from './ThinkingIndicator';

type Props = {
  state: string;
  session: SessionState;
  railVerb: string;
  railObject: string;
  last: ToolCallEvent | null;
  topConfirmation?: ReturnType<typeof autonomy.getPending>[number];
  setOpen: (open: boolean) => void;
  decideConfirmation: (id: string, decision: 'apply' | 'skip') => void;
};

export function AgentIslandRail({
  state,
  session,
  railVerb,
  railObject,
  last,
  topConfirmation,
  setOpen,
  decideConfirmation,
}: Props): React.ReactElement {
  const unavailable = railVerb === 'No agent';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Agent activity: ${state}`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: token['space/md'],
        width: '100%',
        maxWidth: 1200,
        minHeight: 56,
        margin: '0 auto',
        padding: `${token['space/sm']} ${token['space/base']}`,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: token['space/sm'],
          color: session === 'error' ? token['status/error'] : token['ink/high'],
          whiteSpace: 'nowrap',
        }}
      >
        {session === 'working' ? (
          <ThinkingIndicator
            size="compact"
            showIcon
          />
        ) : (
          <>
            <AgentMark
              filled={!unavailable}
              error={session === 'error'}
            />
            <span
              className="substrate-state-copy"
              key={railVerb}
            >
              {railVerb}
            </span>
          </>
        )}
      </span>
      <span
        className="substrate-state-copy"
        key={railObject}
        style={{
          minWidth: 0,
          overflow: 'hidden',
          color: token['ink/low'],
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {railObject}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: token['space/sm'] }}>
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
              onClick={() => decideConfirmation(topConfirmation.id, 'skip')}
            >
              Skip
            </button>
            <button
              className="substrate-rail-button substrate-rail-button--primary"
              type="button"
              onClick={() => decideConfirmation(topConfirmation.id, 'apply')}
            >
              Apply
            </button>
          </>
        ) : null}
        <button
          className="substrate-rail-button"
          type="button"
          onClick={() => setOpen(true)}
        >
          Open panel
        </button>
        <span
          title="Not for diagnostic use."
          style={{
            color: token['ink/low'],
            font: token['text/ui'],
            textDecoration: 'none',
          }}
        >
          Research use only
        </span>
      </span>
    </div>
  );
}
