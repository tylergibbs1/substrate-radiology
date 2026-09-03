import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { presence, type AgentViewportEffect, type ToolCallEvent } from '../webmcp/presence';
import { token } from '../designTokens';
import { AgentMark } from './ThinkingIndicator';
import { autonomy } from '../engine/autonomy';

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
 * The label and ring are transient. A static lamp stays until the radiologist
 * works in that viewport, so attribution remains legible without keeping
 * anything bright beside the image.
 */
export function AgentViewportSignature(): React.ReactElement {
  const [traces, setTraces] = useState<Map<string, Trace>>(new Map());
  const [, updateConfirmations] = useState(0);
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
                  const trace = current.get(effect.viewportId);
                  if (!trace) return current;
                  const next = new Map(current);
                  next.set(effect.viewportId, { ...trace, visible: false });
                  return next;
                });
              }, TRACE_MS)
            );
          }, COALESCE_MS)
        );
      }
    };

    const clearOnHumanInput = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest<HTMLElement>('[data-viewportid]');
      const viewportId = element?.dataset.viewportid;
      if (!viewportId) return;
      setTraces(current => {
        if (!current.has(viewportId)) return current;
        const next = new Map(current);
        next.delete(viewportId);
        return next;
      });
    };

    const off = presence.subscribe(onPresence);
    const offAutonomy = autonomy.subscribe(() => updateConfirmations(value => value + 1));
    document.addEventListener('pointerdown', clearOnHumanInput, true);
    document.addEventListener('wheel', clearOnHumanInput, true);
    return () => {
      off();
      offAutonomy();
      document.removeEventListener('pointerdown', clearOnHumanInput, true);
      document.removeEventListener('wheel', clearOnHumanInput, true);
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
        .substrate-agent-ring { position: absolute; inset: 0; border: ${token['agent/ring-width']} solid var(--substrate-agent-stroke); border-radius: ${token['radius/outer']}; box-shadow: 0 0 0 1px rgba(0,0,0,.85); opacity: 0; }
        .substrate-agent-ring[data-pulse='true'] { animation: substrate-agent-presence var(--substrate-motion-presence) linear both; }
        .substrate-agent-label { position: absolute; top: ${token['space/md']}; right: ${token['space/md']}; display: flex; align-items: center; gap: ${token['space/sm']}; padding: ${token['space/xs']} 10px; color: ${token['ink/low']}; background: ${token['surface/panel']}; border-radius: ${token['radius/full']}; font: ${token['text/measure']}; font-feature-settings: ${token['feature/tabular']}; letter-spacing: ${token['tracking/data']}; opacity: 0; white-space: nowrap; }
        .substrate-agent-label[data-visible='true'] { animation: substrate-agent-presence var(--substrate-motion-presence) linear both; }
        .substrate-agent-mark { display: flex; flex: none; }
        .substrate-agent-trace { position: absolute; top: ${token['space/base']}; right: ${token['space/base']}; display: flex; }
        .substrate-confirmation { position: absolute; right: ${token['space/sm']}; bottom: 0; z-index: 38; display: flex; align-items: center; gap: ${token['space/sm']}; padding: ${token['space/md']}; color: ${token['ink/high']}; background: ${token['surface/raised']}; border-radius: ${token['radius/inner']}; font: ${token['text/ui']}; font-weight: 400; transform: translateY(50%); pointer-events: auto; }
        .substrate-confirmation button { min-height: ${token['hit/target']}; padding: 7px ${token['space/md']}; color: ${token['ink/high']}; background: transparent; border: 1px solid ${token['border/hairline']}; border-radius: ${token['radius/inner']}; font: ${token['text/ui']}; font-weight: 400; cursor: pointer; transition: border-color ${token['motion/enter']}ms ease-out, background-color ${token['motion/enter']}ms ease-out, color ${token['motion/enter']}ms ease-out, transform ${token['motion/exit']}ms ease-out; }
        .substrate-confirmation button:hover { border-color: ${token['ink/low']}; }
        .substrate-confirmation button:active { transform: scale(.96); }
        .substrate-confirmation button:last-child { padding-inline: ${token['space/lg']}; color: ${token['on/primary']}; background: ${token['action/primary']}; border-color: ${token['action/primary']}; }
        .substrate-confirmation button:focus-visible { outline: 1px solid ${token['ink/low']}; outline-offset: 2px; }
        @keyframes substrate-agent-presence { 0% { opacity: 0; } 13.043% { opacity: 1; } 65.217% { opacity: 1; } 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .substrate-agent-ring[data-pulse='true'], .substrate-agent-label[data-visible='true'] { animation: none; opacity: 1; }
          .substrate-confirmation button { transition: none; }
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
            <div
              key={`label-${trace.pulse}`}
              className="substrate-agent-label"
              data-visible={trace.visible}
            >
              <span className="substrate-agent-mark">
                <AgentMark size={11} />
              </span>
              <span>{trace.label}</span>
            </div>
            {!trace.visible ? (
              <span className="substrate-agent-trace">
                <AgentMark />
              </span>
            ) : null}
          </div>,
          frame,
          trace.viewportId
        );
      })}
      {autonomy.getPending().map(request => {
        if (!request.viewportId) return null;
        const frame = viewportFrame(request.viewportId);
        if (!frame) return null;
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
        );
      })}
    </>
  );
}
