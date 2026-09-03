import React, { forwardRef, type HTMLAttributes } from 'react';

import { token } from '../designTokens';

type Size = 'default' | 'compact';

export interface ThinkingIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  size?: Size;
  showIcon?: boolean;
}

/** The agent's entire identity: one static 6 px signal lamp. */
export function AgentMark({
  filled = true,
  error = false,
}: {
  size?: number;
  filled?: boolean;
  error?: boolean;
}): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{
        boxSizing: 'border-box',
        display: 'inline-block',
        width: token['agent/lamp-size'],
        height: token['agent/lamp-size'],
        flex: 'none',
        border: filled || error ? 0 : `1px solid ${token['agent/stroke']}`,
        borderRadius: error ? token['radius/none'] : token['radius/full'],
        background: error ? token['status/error'] : filled ? token['agent/mark'] : 'transparent',
      }}
    />
  );
}

/** Working uses terse shimmer copy; viewport writes still own the presence pulse. */
export const ThinkingIndicator = forwardRef<HTMLDivElement, ThinkingIndicatorProps>(
  ({ size: _size = 'default', showIcon = true, style, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      aria-label="Working"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: token['space/sm'],
        color: token['ink/high'],
        font: token['text/ui'],
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...props}
    >
      {showIcon ? <AgentMark /> : null}
      <span
        aria-hidden="true"
        className="substrate-thinking-label"
      >
        Working
      </span>
    </div>
  )
);

ThinkingIndicator.displayName = 'ThinkingIndicator';
