import React, { useEffect, useState } from 'react'

import { timing, type TimingKind } from '../engine/timing'
import { token } from '../designTokens'

function clock(seconds: number | undefined): string {
  if (seconds === undefined) return '—'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function TimingComparison(): React.ReactElement {
  const [, tick] = useState(0)
  useEffect(() => {
    const off = timing.subscribe(() => tick(value => value + 1))
    const timer = window.setInterval(() => tick(value => value + 1), 1000)
    return () => {
      off()
      window.clearInterval(timer)
    }
  }, [])

  const state = timing.get()
  const elapsed = state.active
    ? Math.max(0, Math.round((Date.now() - state.active.startedAt) / 1000))
    : undefined
  const value = (kind: TimingKind) => (state.active?.kind === kind ? elapsed : state.results[kind])

  return (
    <section
      aria-label="Timing comparison"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 14px',
        borderTop: `1px solid ${token['border/hairline']}`,
      }}
    >
      {(['by-hand', 'with-agent'] as TimingKind[]).map(kind => (
        <button
          key={kind}
          type="button"
          onClick={() => (state.active?.kind === kind ? timing.stop() : timing.start(kind))}
          style={{
            padding: 0,
            color: state.active?.kind === kind ? '#d0d6e0' : '#8a8f98',
            background: 'transparent',
            border: 0,
            font: 'inherit',
            fontSize: 10.5,
            cursor: 'pointer',
          }}
        >
          {kind === 'by-hand' ? 'By hand' : 'With agent'} · {clock(value(kind))}
        </button>
      ))}
      <button
        type="button"
        onClick={() => timing.reset()}
        style={{
          marginLeft: 'auto',
          padding: 0,
          color: '#62666d',
          background: 'transparent',
          border: 0,
          font: 'inherit',
          fontSize: 10.5,
          cursor: 'pointer',
        }}
      >
        Reset
      </button>
    </section>
  )
}
