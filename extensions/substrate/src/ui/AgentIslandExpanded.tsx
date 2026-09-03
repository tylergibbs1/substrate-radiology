import React, { useState } from 'react';

import { autonomy } from '../engine/autonomy';
import type { Proposal } from '../engine/proposals';
import { currentVersion } from '../engine/report';
import { token, type AgentPanelView, type SessionState } from '../designTokens';
import type { ToolCallEvent } from '../webmcp/presence';
import type { RegisteredTool, RegistrationResult } from '../webmcp/spec';
import { ReviewThread } from './ReviewThread';
import { AgentIslandDetails } from './AgentIslandDetails';
import {
  PendingConfirmations,
  RecentWork,
  RunningPlan,
  SuggestedMeasurements,
} from './AgentIslandDomainPanels';
import type { IslandCommand } from './agentIslandModel';
import { panelHeadingStyle } from './agentIslandStyles';
import { AgentMark, ThinkingIndicator } from './ThinkingIndicator';

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
  toolAudit: RegisteredTool[];
  registration: RegistrationResult;
  session: SessionState;
  railVerb: string;
  railObject: string;
  railObjectKey: string;
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
  session,
  railVerb,
  railObject,
  railObjectKey,
}: Props): React.ReactElement {
  const [view, setView] = useState<AgentPanelView>('work');

  return (
    <div
      style={{
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          boxSizing: 'border-box',
          height: '100%',
          minHeight: 0,
          width: '100%',
          maxWidth: 420,
          margin: '0 auto',
          padding: token['space/md'],
        }}
      >
        <div
          hidden={view !== 'work'}
          data-panel-header={token['panel/header']}
          data-panel-content={token['panel/content']}
          data-panel-footer={token['panel/footer']}
          style={{
            display: view === 'work' ? 'grid' : 'none',
            gridTemplateRows: 'auto minmax(0, 1fr) auto',
            height: '100%',
            minHeight: 0,
          }}
        >
          <header>
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label={`Agent status: ${railVerb}${railObject ? `, ${railObject}` : ''}`}
              style={{
                display: 'grid',
                gridTemplateColumns: `${token['lane/status']} minmax(0, 1fr) auto`,
                alignItems: 'center',
                gap: token['space/sm'],
                minHeight: token['hit/target'],
                paddingBottom: token['space/sm'],
                borderBottom: `1px solid ${token['border/strong']}`,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: token['space/sm'],
                  minWidth: 0,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                {session === 'working' ? (
                  <ThinkingIndicator
                    size="compact"
                    showIcon
                    role="presentation"
                  />
                ) : (
                  <>
                    <AgentMark error={session === 'error'} />
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
                aria-hidden="true"
                className="substrate-state-copy"
                key={railObjectKey}
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
              <button
                className="substrate-control substrate-touch-hitbox"
                type="button"
                aria-label="Collapse Agent Work"
                onClick={() => window.dispatchEvent(new Event('substrate:collapse-agent-panel'))}
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
                Collapse
              </button>
            </div>
          </header>

          <div
            style={{
              display: 'grid',
              alignContent: 'start',
              gap: token['space/base'],
              minHeight: 0,
              overflowY: 'auto',
              padding: `${token['space/base']} 0`,
              scrollbarGutter: token['layout/scrollbar-gutter'],
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
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: token['space/md'],
                  }}
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

            <PendingConfirmations confirmations={confirmations} />
            <RunningPlan events={runningPlan} />

            {currentVersion() ? (
              <ReviewThread services={services} />
            ) : (
              <section
                style={{
                  display: 'grid',
                  gap: token['space/sm'],
                  padding: `${token['space/md']} 0 ${token['space/base']}`,
                }}
              >
                <h2 style={panelHeadingStyle}>Findings</h2>
                <p style={{ margin: 0, color: token['ink/low'], font: token['text/ui'] }}>
                  Label a target to propose it on the prior.
                </p>
              </section>
            )}
            <SuggestedMeasurements
              proposals={pending}
              confirmProposal={confirmProposal}
              showProposal={showProposal}
              repaint={repaint}
            />
            <RecentWork bursts={bursts} />
          </div>

          <footer
            style={{
              borderTop: `1px solid ${token['border/strong']}`,
            }}
          >
            <button
              className="substrate-control substrate-disclosure"
              type="button"
              aria-label="Details"
              onClick={() => {
                closeCommands();
                setView('details');
              }}
              style={{
                border: 0,
                background: 'transparent',
              }}
            >
              Details
            </button>
          </footer>
        </div>

        <AgentIslandDetails
          hidden={view !== 'details'}
          instructionsText={instructionsText}
          setInstructionsText={setInstructionsText}
          toolAudit={toolAudit}
          registration={registration}
          onBack={() => setView('work')}
        />
      </div>
    </div>
  );
}
