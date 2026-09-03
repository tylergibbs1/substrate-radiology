import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { presence, type AgentViewportEffect, type ToolCallEvent } from '../webmcp/presence';
import { token } from '../designTokens';

const COALESCE_MS = 180;
const TRACE_MS = token['motion/presence'];

type Trace = AgentViewportEffect & { pulse: number; visible: boolean };

function viewportFrame(viewportId: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(viewportId) : viewportId;
  return (
    document
      .querySelector<HTMLElement>(`[data-viewportid="${escaped}"]`)
      ?.closest<HTMLElement>('.viewport-wrapper') ?? null
  );
}

/**
 * One attribution mark, at the place an agent write became visible.
 *
 * The ring is transient. Its caption stays in the panel state line or status
 * strip, where it cannot cover pixels or adjacent viewer controls.
 */
export function AgentViewportSignature(): React.ReactElement {
  const [traces, setTraces] = useState<Map<string, Trace>>(new Map());
  const lastEvent = useRef<ToolCallEvent | null>(null);
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const exits = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const onPresence = () => {
      const event = presence.getLast();
      if (!event || event === lastEvent.current) return;
      lastEvent.current = event;
      if (!event.ok || !event.effects?.length) return;

      for (const effect of event.effects) {
        const previous = pending.current.get(effect.viewportId);
        if (previous) clearTimeout(previous);
        pending.current.set(
          effect.viewportId,
          setTimeout(() => {
            pending.current.delete(effect.viewportId);
            setTraces(current => {
              const next = new Map(current);
              const prior = next.get(effect.viewportId);
              next.set(effect.viewportId, {
                ...effect,
                pulse: (prior?.pulse ?? 0) + 1,
                visible: true,
              });
              return next;
            });

            const oldExit = exits.current.get(effect.viewportId);
            if (oldExit) clearTimeout(oldExit);
            exits.current.set(
              effect.viewportId,
              setTimeout(() => {
                setTraces(current => {
                  if (!current.has(effect.viewportId)) return current;
                  const next = new Map(current);
                  next.delete(effect.viewportId);
                  return next;
                });
              }, TRACE_MS)
            );
          }, COALESCE_MS)
        );
      }
    };

    const off = presence.subscribe(onPresence);
    return () => {
      off();
      for (const timer of pending.current.values()) clearTimeout(timer);
      for (const timer of exits.current.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <style>{`
        :root {
          --substrate-agent-stroke: ${token['agent/stroke']};
          --substrate-motion-presence: ${token['motion/presence']}ms;
        }
        .substrate-agent-signature { position: absolute; inset: 0; z-index: 36; pointer-events: none; }
        .substrate-agent-ring { position: absolute; inset: 0; border-radius: ${token['radius/outer']}; outline: ${token['agent/ring-width']} solid var(--substrate-agent-stroke); box-shadow: 0 0 0 1px rgba(0,0,0,.85); opacity: 0; }
        .substrate-agent-ring[data-pulse='true'] { animation: substrate-agent-presence var(--substrate-motion-presence) linear both; }
        @keyframes substrate-agent-presence { 0% { opacity: 0; } 13.043% { opacity: 1; } 65.217% { opacity: 1; } 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .substrate-agent-ring[data-pulse='true'] { animation: none; opacity: 1; }
        }
      `}</style>
      {[...traces.values()].map(trace => {
        const frame = viewportFrame(trace.viewportId);
        if (!frame) return null;
        return createPortal(
          <div
            className="substrate-agent-signature"
            aria-hidden="true"
            data-substrate-system={token['system/bench']}
          >
            <div
              key={`ring-${trace.pulse}`}
              className="substrate-agent-ring"
              data-pulse={trace.visible}
            />
          </div>,
          frame,
          trace.viewportId
        );
      })}
    </>
  );
}
