import React, { useEffect, useState } from 'react'

import { presence, type ToolCallEvent } from '../webmcp/presence'

/**
 * The agent's island.
 *
 * It floats over the viewport rather than living in a panel, because what the
 * agent is doing is not a property of any one pane — it follows the radiologist
 * across the hang, the measurements and the report. Tinted glass so it reads as
 * hovering above the study instead of covering part of it, and deliberately
 * quiet: on a diagnostic display the only thing allowed to be bright is the
 * image.
 *
 * Styles are inline on purpose. This mounts into a portal outside OHIF's own
 * React tree, so it cannot depend on a Tailwind build whose content globs may
 * never have heard of this package.
 */

const WORKING_WINDOW_MS = 3000

/** What each tool is doing, in the words a radiologist would use. */
const PHRASE = new Map<string, string>([
  ['get_context', 'looking at what is open'],
  ['get_study', 'reading the series list'],
  ['list_measurements', 'reading your measurements'],
  ['navigate', 'moving through the study'],
  ['set_display', 'adjusting the display'],
  ['hang_layout', 'hanging the study'],
  ['propose_measurement', 'proposing a measurement on the prior'],
  ['compare_with_prior', 'comparing with the prior'],
  ['draft_report', 'drafting the report'],
  ['request_signature', 'asking you to sign'],
])

function relative(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 1) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m ago`
}

export function AgentIsland(): React.ReactElement | null {
  const [, tick] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const off = presence.subscribe(() => tick((value) => value + 1))
    const timer = setInterval(() => tick((value) => value + 1), 1000)
    return () => {
      off()
      clearInterval(timer)
    }
  }, [])

  const registration = presence.getRegistration()
  const last: ToolCallEvent | null = presence.getLast()
  const events = presence.getEvents()

  const failure = registration.ok ? null : registration.failure
  const supported = failure === null || failure.kind !== 'unsupported'
  const working = last !== null && Date.now() - last.startedAt < WORKING_WINDOW_MS

  let dot = 'rgba(255,255,255,0.35)'
  let line: React.ReactNode = 'No agent in this browser'

  if (failure) {
    // A browser with no WebMCP is the ordinary case and not an error. Anything
    // else is something the person can actually fix, so it says what it was.
    dot = failure.kind === 'unsupported' ? 'rgba(255,255,255,0.35)' : '#f87171'
    line = failure.kind === 'unsupported' ? 'No agent in this browser' : failure.message
  } else if (last && !last.ok) {
    dot = '#f87171'
    line = `Could not ${PHRASE.get(last.tool) ?? last.tool}`
  } else if (working && last) {
    dot = '#38bdf8'
    line = `Agent is ${PHRASE.get(last.tool) ?? last.tool}`
  } else if (last) {
    dot = '#4ade80'
    line = `Agent · ${PHRASE.get(last.tool) ?? last.tool} ${relative(Date.now() - last.startedAt)}`
  } else if (supported) {
    dot = '#4ade80'
    line = `Agent connected · ${registration.registered.length} tools`
  }

  const glass: React.CSSProperties = {
    background: 'rgba(14, 20, 33, 0.55)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    color: 'rgba(255, 255, 255, 0.92)',
  }

  return (
    <div
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          ...glass,
          pointerEvents: 'auto',
          borderRadius: open ? 18 : 999,
          maxWidth: 'min(560px, calc(100vw - 32px))',
          overflow: 'hidden',
          transition: 'border-radius 160ms ease-out',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="What the agent has done"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '9px 14px',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            font: 'inherit',
            fontSize: 12.5,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              flexShrink: 0,
              borderRadius: 999,
              background: dot,
              boxShadow: working ? `0 0 8px ${dot}` : 'none',
            }}
          />
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {line}
          </span>
          {events.length > 0 ? (
            <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>
              {open ? 'Hide' : `${events.length}`}
            </span>
          ) : null}
        </button>

        {open && events.length > 0 ? (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: '2px 6px 8px',
              maxHeight: 240,
              overflowY: 'auto',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {events.map((event, index) => (
              <li
                key={`${event.tool}-${event.startedAt}-${index}`}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '6px 8px',
                  fontSize: 12,
                  opacity: event.ok ? 0.85 : 1,
                  color: event.ok ? undefined : '#fca5a5',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  {PHRASE.get(event.tool) ?? event.tool}
                  {event.argsSummary ? (
                    <span style={{ opacity: 0.5 }}> — {event.argsSummary}</span>
                  ) : null}
                </span>
                <span style={{ opacity: 0.45, whiteSpace: 'nowrap' }}>
                  {relative(Date.now() - event.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
