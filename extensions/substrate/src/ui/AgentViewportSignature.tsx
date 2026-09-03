import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { presence, type AgentViewportEffect, type ToolCallEvent } from '../webmcp/presence'
import { token } from '../designTokens'
import { AgentMark } from './ThinkingIndicator'
import { autonomy } from '../engine/autonomy'

const COALESCE_MS = 180
const TRACE_MS = token['motion/presence']

type Trace = AgentViewportEffect & { pulse: number; visible: boolean }

function viewportFrame(viewportId: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(viewportId) : viewportId
  return (
    document
      .querySelector<HTMLElement>(`[data-viewportid="${escaped}"]`)
      ?.closest<HTMLElement>('.viewport-wrapper') ?? null
  )
}

/**
 * One attribution mark, at the place an agent write became visible.
 *
 * The label and ring are transient. A static loop stays until the radiologist
 * works in that viewport, so attribution remains legible without keeping
 * anything bright beside the image.
 */
export function AgentViewportSignature(): React.ReactElement {
  const [traces, setTraces] = useState<Map<string, Trace>>(new Map())
  const [, updateConfirmations] = useState(0)
  const lastEvent = useRef<ToolCallEvent | null>(null)
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const exits = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const onPresence = () => {
      const event = presence.getLast()
      if (!event || event === lastEvent.current) return
      lastEvent.current = event
      if (!event.ok || !event.effects?.length) return

      for (const effect of event.effects) {
        const previous = pending.current.get(effect.viewportId)
        if (previous) clearTimeout(previous)
        pending.current.set(
          effect.viewportId,
          setTimeout(() => {
            pending.current.delete(effect.viewportId)
            setTraces(current => {
              const next = new Map(current)
              const prior = next.get(effect.viewportId)
              next.set(effect.viewportId, {
                ...effect,
                pulse: (prior?.pulse ?? 0) + 1,
                visible: true,
              })
              return next
            })

            const oldExit = exits.current.get(effect.viewportId)
            if (oldExit) clearTimeout(oldExit)
            exits.current.set(
              effect.viewportId,
              setTimeout(() => {
                setTraces(current => {
                  const trace = current.get(effect.viewportId)
                  if (!trace) return current
                  const next = new Map(current)
                  next.set(effect.viewportId, { ...trace, visible: false })
                  return next
                })
              }, TRACE_MS)
            )
          }, COALESCE_MS)
        )
      }
    }

    const clearOnHumanInput = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      const element = target?.closest<HTMLElement>('[data-viewportid]')
      const viewportId = element?.dataset.viewportid
      if (!viewportId) return
      setTraces(current => {
        if (!current.has(viewportId)) return current
        const next = new Map(current)
        next.delete(viewportId)
        return next
      })
    }

    const off = presence.subscribe(onPresence)
    const offAutonomy = autonomy.subscribe(() => updateConfirmations(value => value + 1))
    document.addEventListener('pointerdown', clearOnHumanInput, true)
    document.addEventListener('wheel', clearOnHumanInput, true)
    return () => {
      off()
      offAutonomy()
      document.removeEventListener('pointerdown', clearOnHumanInput, true)
      document.removeEventListener('wheel', clearOnHumanInput, true)
      for (const timer of pending.current.values()) clearTimeout(timer)
      for (const timer of exits.current.values()) clearTimeout(timer)
    }
  }, [])

  return (
    <>
      <style>{`
        :root {
          --substrate-agent: ${token['agent/accent']};
          --substrate-motion-enter: ${token['motion/enter']}ms;
          --substrate-motion-exit: ${token['motion/exit']}ms;
          --substrate-motion-presence: ${token['motion/presence']}ms;
        }
        .substrate-agent-signature { position: absolute; inset: 0; z-index: 36; pointer-events: none; }
        .substrate-agent-ring { position: absolute; inset: 0; border: 2px solid var(--substrate-agent); opacity: 0; }
        .substrate-agent-ring[data-pulse='true'] { animation: substrate-agent-ring var(--substrate-motion-presence) cubic-bezier(0.23, 1, 0.32, 1) both; }
        .substrate-agent-label { position: absolute; top: 8px; left: 8px; display: flex; align-items: center; gap: 6px; padding: 3px 7px 3px 5px; color: #d9f7f2; background: #102522; border: 1px solid color-mix(in srgb, var(--substrate-agent) 52%, #102522); border-radius: 999px; font: 500 10px/1.2 system-ui, sans-serif; letter-spacing: .01em; opacity: 0; white-space: nowrap; }
        .substrate-agent-label[data-visible='true'] { animation: substrate-agent-label var(--substrate-motion-presence) cubic-bezier(0.23, 1, 0.32, 1) both; }
        .substrate-agent-mark { color: var(--substrate-agent); display: flex; flex: none; }
        .substrate-agent-trace { position: absolute; top: 8px; right: 8px; color: var(--substrate-agent); display: flex; }
        .substrate-confirmation { position: absolute; right: 8px; bottom: 0; z-index: 38; display: flex; align-items: center; gap: 7px; padding: 4px 5px 4px 8px; color: #d0d6e0; background: #0f1011; border: 1px solid #23252a; border-radius: 5px; font: 500 10.5px/1.2 system-ui, sans-serif; transform: translateY(45%); pointer-events: auto; box-shadow: 0 2px 8px rgba(0,0,0,.45); }
        .substrate-confirmation button { padding: 2px 5px; color: #8a8f98; background: transparent; border: 0; border-radius: 3px; font: inherit; cursor: pointer; }
        .substrate-confirmation button:last-child { color: #08090a; background: #d0d6e0; }
        @keyframes substrate-agent-ring { 0% { opacity: 0; } 12% { opacity: 1; } 92% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes substrate-agent-label { 0% { opacity: 0; } 12% { opacity: 1; } 92% { opacity: 1; } 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .substrate-agent-ring[data-pulse='true'], .substrate-agent-label[data-visible='true'] { animation-name: substrate-agent-fade; animation-duration: 300ms; }
          @keyframes substrate-agent-fade { from { opacity: 0; } to { opacity: 1; } }
        }
      `}</style>
      {[...traces.values()].map(trace => {
        const frame = viewportFrame(trace.viewportId)
        if (!frame) return null
        return createPortal(
          <div
            className="substrate-agent-signature"
            aria-hidden="true"
          >
            <div
              key={`ring-${trace.pulse}`}
              className="substrate-agent-ring"
              data-pulse={trace.visible}
            />
            <div
              key={`label-${trace.pulse}`}
              className="substrate-agent-label"
              data-visible={trace.visible}
            >
              <span className="substrate-agent-mark">
                <AgentMark size={11} />
              </span>
              <span>Agent · {trace.label}</span>
            </div>
            <span className="substrate-agent-trace">
              <AgentMark size={12} />
            </span>
          </div>,
          frame,
          trace.viewportId
        )
      })}
      {autonomy.getPending().map(request => {
        if (!request.viewportId) return null
        const frame = viewportFrame(request.viewportId)
        if (!frame) return null
        return createPortal(
          <div
            className="substrate-confirmation"
            role="group"
            aria-label="Confirm agent change"
          >
            <span>Apply agent change?</span>
            <button
              type="button"
              onClick={() => autonomy.decide(request.id, 'skip')}
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => autonomy.decide(request.id, 'apply')}
            >
              Apply
            </button>
          </div>,
          frame,
          `confirmation-${request.id}`
        )
      })}
    </>
  )
}
