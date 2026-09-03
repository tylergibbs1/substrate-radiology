import React, { useState } from 'react';

import { autonomy } from '../engine/autonomy';
import { token } from '../designTokens';
import type { RegistrationResult, WebMcpTool } from '../webmcp/spec';
import { TimingComparison } from './TimingComparison';
import { listResetStyle, panelHeadingStyle } from './agentIslandStyles';

type Props = {
  hidden: boolean;
  instructionsText: string;
  setInstructionsText: (value: string) => void;
  toolAudit: WebMcpTool[];
  registration: RegistrationResult;
  onBack: () => void;
};

export function AgentIslandDetails({
  hidden,
  instructionsText,
  setInstructionsText,
  toolAudit,
  registration,
  onBack,
}: Props): React.ReactElement {
  const askBeforeChanges = autonomy.getLevel() === 'assist';
  const [open, setOpen] = useState({ preferences: true, timing: false, connection: false });
  const setSection = (section: keyof typeof open, value: boolean) =>
    setOpen(current => ({ ...current, [section]: value }));

  return (
    <div
      hidden={hidden}
      aria-label="Agent details"
      style={{ display: hidden ? 'none' : 'grid', gap: token['space/base'] }}
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
              onChange={event => autonomy.setLevel(event.target.checked ? 'assist' : 'full-prep')}
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
  );
}
