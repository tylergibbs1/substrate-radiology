import React from 'react';

import { autonomy } from '../engine/autonomy';
import type { Proposal } from '../engine/proposals';
import { currentVersion } from '../engine/report';
import { autonomyLabel, token } from '../designTokens';
import type { ToolCallEvent } from '../webmcp/presence';
import type { RegistrationResult, WebMcpTool } from '../webmcp/spec';
import { ReviewThread } from './ReviewThread';
import { TimingComparison } from './TimingComparison';
import {
  PendingConfirmations,
  RecentWork,
  RunningPlan,
  SuggestedMeasurements,
} from './AgentIslandDomainPanels';
import type { IslandCommand } from './agentIslandModel';
import { listResetStyle, panelHeadingStyle } from './agentIslandStyles';

type Props = {
  services: Record<string, unknown>;
  commandsOpen: boolean;
  commands: IslandCommand[];
  closeCommands: () => void;
  instructionsText: string;
  setInstructionsText: (value: string) => void;
  confirmations: ReturnType<typeof autonomy.getPending>;
  runningPlan: ToolCallEvent[];
  pending: Proposal[];
  confirmProposal: (annotationUID: string) => void;
  showProposal: (annotationUID: string) => void;
  repaint: () => void;
  bursts: ToolCallEvent[][];
  toolAudit: WebMcpTool[];
  registration: RegistrationResult;
};

export function AgentIslandExpanded({
  services,
  commandsOpen,
  commands,
  closeCommands,
  instructionsText,
  setInstructionsText,
  confirmations,
  runningPlan,
  pending,
  confirmProposal,
  showProposal,
  repaint,
  bursts,
  toolAudit,
  registration,
}: Props): React.ReactElement {
  const autonomyLevel = autonomy.getLevel();

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: token['space/base'],
          width: '100%',
          maxWidth: 420,
          margin: '0 auto',
          padding: token['space/md'],
        }}
      >
        {commandsOpen ? (
          <section
            aria-label="Substrate commands"
            style={{
              display: 'grid',
              gap: token['space/sm'],
              paddingBottom: token['space/xl'],
              borderBottom: `1px solid ${token['border/hairline']}`,
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', gap: token['space/md'] }}
            >
              <h2 style={panelHeadingStyle}>Commands</h2>
              <span style={{ color: token['ink/low'], font: token['text/measure'] }}>⌘K</span>
            </div>
            <div style={{ display: 'grid' }}>
              {commands.map(command => (
                <button
                  className="substrate-control"
                  key={command.label}
                  type="button"
                  disabled={command.disabled}
                  onClick={() => {
                    command.run();
                    closeCommands();
                  }}
                  style={{
                    minHeight: token['hit/target'],
                    padding: `${token['space/sm']} 0`,
                    color: command.disabled ? token['on/disabled'] : token['ink/high'],
                    background: 'transparent',
                    border: 0,
                    font: token['text/ui'],
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

        <header style={{ display: 'grid', gap: token['space/md'] }}>
          <div
            aria-label={`Preparation mode: ${autonomyLabel(autonomyLevel)}`}
            role="status"
            style={{
              color: token['ink/high'],
              font: token['text/ui'],
            }}
          >
            {autonomyLabel(autonomyLevel)}
          </div>
          <p style={{ margin: 0, color: token['ink/low'], font: token['text/ui'] }}>
            Nothing reads the image, chooses its own coordinates, or signs.
          </p>
        </header>

        <details style={{ borderTop: `1px solid ${token['border/hairline']}` }}>
          <summary
            className="substrate-disclosure"
            style={{
              minHeight: token['hit/target'],
            }}
          >
            Preferences
          </summary>
          <div
            style={{
              display: 'grid',
              gap: token['space/base'],
              padding: token['space/md'],
              background: token['surface/inset'],
              borderRadius: token['radius/inner'],
            }}
          >
            <label
              style={{
                display: 'grid',
                gridTemplateColumns: '18px minmax(0, 1fr)',
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
                checked={autonomyLevel === 'assist'}
                onChange={event => autonomy.setLevel(event.target.checked ? 'assist' : 'full-prep')}
                style={{
                  width: 18,
                  height: 18,
                  margin: 0,
                  accentColor: token['action/primary'],
                }}
              />
              <span>Ask before viewer changes</span>
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

        <PendingConfirmations confirmations={confirmations} />
        <RunningPlan events={runningPlan} />
        <SuggestedMeasurements
          proposals={pending}
          confirmProposal={confirmProposal}
          showProposal={showProposal}
          repaint={repaint}
        />

        {currentVersion() ? (
          <ReviewThread services={services} />
        ) : (
          <section
            style={{
              display: 'grid',
              gap: token['space/sm'],
              paddingTop: token['space/xl'],
              borderTop: `1px solid ${token['border/hairline']}`,
            }}
          >
            <h2 style={panelHeadingStyle}>Findings</h2>
            <p style={{ margin: 0, color: token['ink/low'], font: token['text/ui'] }}>
              Label a target to propose it on the prior.
            </p>
          </section>
        )}
        <RecentWork bursts={bursts} />

        <details style={{ borderTop: `1px solid ${token['border/hairline']}` }}>
          <summary
            className="substrate-disclosure"
            style={{
              minHeight: token['hit/target'],
            }}
          >
            Timing
          </summary>
          <TimingComparison />
        </details>

        <details
          style={{
            paddingTop: token['space/sm'],
            borderTop: `1px solid ${token['border/hairline']}`,
            color: token['ink/low'],
            font: token['text/ui'],
          }}
        >
          <summary
            className="substrate-disclosure"
            style={{ minHeight: token['hit/target'] }}
          >
            Connection details
          </summary>
          <p style={{ margin: 0 }}>A connected agent can see this page.</p>
          <ul style={{ ...listResetStyle, marginTop: token['space/sm'] }}>
            {toolAudit.map(tool => (
              <li
                key={tool.name}
                style={{ display: 'flex', justifyContent: 'space-between', gap: token['space/sm'] }}
              >
                <span>{tool.title}</span>
                <span>
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
