import React, { useEffect, useState } from 'react';

import { timing, type TimingKind } from '../engine/timing';
import { token } from '../designTokens';

function clock(seconds: number | undefined): string {
  if (seconds === undefined) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function TimingComparison(): React.ReactElement {
  const [, tick] = useState(0);
  useEffect(() => {
    const off = timing.subscribe(() => tick(value => value + 1));
    const timer = window.setInterval(() => tick(value => value + 1), 1000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, []);

  const state = timing.get();
  const elapsed = state.active
    ? Math.max(0, Math.round((Date.now() - state.active.startedAt) / 1000))
    : undefined;
  const value = (kind: TimingKind) => (state.active?.kind === kind ? elapsed : state.results[kind]);

  return (
    <section
      aria-label="Timing comparison"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: token['space/sm'],
        padding: `${token['space/sm']} 0`,
      }}
    >
      {(['by-hand', 'with-agent'] as TimingKind[]).map(kind => (
        <button
          className="substrate-control"
          key={kind}
          type="button"
          onClick={() => (state.active?.kind === kind ? timing.stop() : timing.start(kind))}
          style={{
            minHeight: token['hit/target'],
            padding: `7px ${token['space/md']}`,
            color: state.active?.kind === kind ? token['ink/mid'] : token['ink/low'],
            background: 'transparent',
            border: `1px solid ${token['border/hairline']}`,
            borderRadius: token['radius/inner'],
            font: token['text/ui'],
            cursor: 'pointer',
            transition: `border-color ${token['motion/enter']}ms ease-out, transform ${token['motion/exit']}ms ease-out`,
          }}
        >
          {kind === 'by-hand' ? 'By hand' : 'With agent'} ·{' '}
          <span style={{ font: token['text/measure'], letterSpacing: token['tracking/data'] }}>
            {clock(value(kind))}
          </span>
        </button>
      ))}
      <button
        className="substrate-control"
        type="button"
        onClick={() => timing.reset()}
        style={{
          marginLeft: 'auto',
          minHeight: token['hit/target'],
          padding: `7px ${token['space/md']}`,
          color: token['ink/low'],
          background: 'transparent',
          border: `1px solid ${token['border/hairline']}`,
          borderRadius: token['radius/inner'],
          font: token['text/ui'],
          cursor: 'pointer',
          transition: `border-color ${token['motion/enter']}ms ease-out, transform ${token['motion/exit']}ms ease-out`,
        }}
      >
        Reset
      </button>
    </section>
  );
}
