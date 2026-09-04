import React from 'react';

import { autonomy } from '../engine/autonomy';
import { token } from '../designTokens';
import type { ToolCallEvent } from '../webmcp/presence';
import type { RegisteredTool, RegistrationResult } from '../webmcp/spec';
import { ActivityHistory } from './AgentIslandDomainPanels';
import { TimingComparison } from './TimingComparison';
import { listResetStyle, panelHeadingStyle } from './agentIslandStyles';

export type AgentDetailsSection = 'activity' | 'preferences' | 'timing' | 'connection';
export type AgentDetailsOpenState = Record<AgentDetailsSection, boolean>;

type Props = {
  hidden: boolean;
  bursts: ToolCallEvent[][];
  instructionsText: string;
  setInstructionsText: (value: string) => void;
  toolAudit: RegisteredTool[];
  registration: RegistrationResult;
  open: AgentDetailsOpenState;
  setSection: (section: AgentDetailsSection, value: boolean) => void;
  onBack: () => void;
};

export function AgentIslandDetails({
  hidden,
  bursts,
  instructionsText,
  setInstructionsText,
  toolAudit,
  registration,
  open,
  setSection,
  onBack,
}: Props): React.ReactElement {
  const askBeforeChanges = autonomy.getLevel() === 'assist';

  return (
    <div
      hidden={hidden}
      aria-label="Agent details"
      data-panel-header={token['panel/header']}
      data-panel-content={token['panel/content']}
      style={{
        display: hidden ? 'none' : 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        height: '100%',
        minHeight: 0,
      }}
    >
      <header
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: token['space/md'],
          minHeight: token['hit/target'],
          paddingBottom: token['space/sm'],
          borderBottom: `1px solid ${token['border/strong']}`,
        }}
      >
        <button
          className="substrate-control substrate-touch-hitbox"
          type="button"
          onClick={onBack}
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
          Back
        </button>
        <h2 style={panelHeadingStyle}>Details</h2>
      </header>

      <div
        style={{
          display: 'grid',
          alignContent: 'start',
          gap: token['space/base'],
          minHeight: 0,
          overflowY: 'auto',
          paddingTop: token['space/base'],
          scrollbarGutter: token['layout/scrollbar-gutter'],
        }}
      >
        {bursts.length > 0 ? (
          <details
            open={open.activity}
            onToggle={event => setSection('activity', event.currentTarget.open)}
            style={{ borderBottom: `1px solid ${token['border/hairline']}` }}
          >
            <summary className="substrate-disclosure">Activity</summary>
            <ActivityHistory bursts={bursts} />
          </details>
        ) : null}

        <details
          open={open.preferences}
          onToggle={event => setSection('preferences', event.currentTarget.open)}
          style={{ borderBottom: `1px solid ${token['border/hairline']}` }}
        >
          <summary className="substrate-disclosure">Preferences</summary>
          <div
            style={{
              display: 'grid',
              gap: token['space/base'],
              padding: token['space/md'],
              marginBottom: token['space/md'],
              background: token['surface/inset'],
              borderRadius: token['radius/inner'],
            }}
          >
            <label
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr)',
                alignItems: 'center',
                gap: token['space/md'],
                minHeight: token['hit/target'],
                color: token['ink/high'],
                font: token['text/ui'],
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={askBeforeChanges}
                onChange={event => autonomy.setLevel(event.target.checked ? 'assist' : 'auto-prep')}
                style={{ width: 16, height: 16, margin: 0, accentColor: token['ink/low'] }}
              />
              <span>Ask before changes</span>
            </label>
            <textarea
              aria-label="Standing instructions"
              rows={2}
              value={instructionsText}
              onChange={event => setInstructionsText(event.target.value)}
              onBlur={() => autonomy.setStandingInstructions(instructionsText.split('\n'))}
              placeholder="Standing instructions"
              style={{
                boxSizing: 'border-box',
                width: '100%',
                minHeight: token['hit/target'],
                padding: `0 0 ${token['space/md']}`,
                resize: 'vertical',
                color: token['ink/high'],
                background: 'transparent',
                border: 0,
                borderBottom: `1px solid ${token['border/hairline']}`,
                borderRadius: token['radius/none'],
                outline: 0,
                font: token['text/ui'],
              }}
            />
          </div>
        </details>

        <details
          open={open.timing}
          onToggle={event => setSection('timing', event.currentTarget.open)}
          style={{ borderBottom: `1px solid ${token['border/hairline']}` }}
        >
          <summary className="substrate-disclosure">Timing</summary>
          <TimingComparison />
        </details>

        <details
          open={open.connection}
          onToggle={event => setSection('connection', event.currentTarget.open)}
          style={{
            paddingBottom: token['space/md'],
            borderBottom: `1px solid ${token['border/hairline']}`,
            color: token['ink/low'],
            font: token['text/ui'],
          }}
        >
          <summary className="substrate-disclosure">Connection</summary>
          <p style={{ margin: 0 }}>A connected agent can see this page.</p>
          <ul
            style={{
              ...listResetStyle,
              display: 'grid',
              marginTop: token['space/sm'],
            }}
          >
            {toolAudit.map(tool => (
              <li
                key={tool.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `minmax(0, 1fr) ${token['lane/connection-state']}`,
                  alignItems: 'baseline',
                  gap: token['space/md'],
                  minHeight: 32,
                  padding: `${token['space/xs']} 0`,
                }}
              >
                <span
                  title={tool.title}
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tool.title ?? tool.name}
                </span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {tool.annotations?.readOnlyHint ? 'Read' : 'Write'}
                  {tool.annotations?.untrustedContentHint ? ' · untrusted' : ''}
                </span>
              </li>
            ))}
          </ul>
          {!registration.ok ? (
            <p style={{ margin: `${token['space/sm']} 0 0` }}>Unavailable</p>
          ) : null}
        </details>
      </div>
    </div>
  );
}
