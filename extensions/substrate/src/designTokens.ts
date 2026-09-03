/** Canonical alpha decisions shared by Substrate's UI, reviews, agents, and demo. */
export const token = {
  'agent/mark': '#8b76ff',
  'agent/stroke': '#6d52ff',
  'on/signal': '#ffffff',
  'agent/lamp-size': '6px',
  'agent/ring-width': '2px',

  'action/primary': '#ffffff',
  'action/primary-hover': '#d8d8d8',
  'action/primary-press': '#ffffff',
  'on/primary': '#1c1c1c',
  'action/disabled': '#2a2a2a',
  'on/disabled': '#7b7b7b',

  'state/proposed': '#6d52ff',
  'state/confirmed': '#d8d8d8',
  'state/unaligned': '#eb5757',

  'review/unreviewed': '#8b76ff',
  'review/accepted': '#d8d8d8',
  'review/rejected': '#7b7b7b',
  'review/stale': '#eb5757',

  'session/idle': 'Idle',
  'session/working': 'Working',
  'session/waiting-for-you': 'Waiting for you',
  'session/done': 'Done',
  'session/error': 'Error',

  'autonomy/assist': 'Assist',
  'autonomy/auto-prep': 'Auto-prep',
  'autonomy/full-prep': 'Full prep',

  'surface/room': '#040404',
  'surface/bed': '#101014',
  'surface/panel': '#1c1c1c',
  'surface/inset': '#2a2a2a',
  'surface/raised': '#383838',
  'system/bench': 'bench',
  'system/plate': 'plate',
  // A rule on surface/card is the next surface step, never a fixed grey.
  'border/hairline': '#2a2a2a',
  'border/strong': '#464646',
  'status/error': '#eb5757',

  'ink/high': '#ffffff',
  'ink/mid': '#ffffff',
  'ink/low': '#d8d8d8',

  'motion/enter': 150,
  'motion/hold': 600,
  'motion/exit': 400,
  'motion/presence': 1150,
  'motion/shimmer': 1600,
  'motion/state-copy': 180,
  'motion/error-hold': 2000,

  'text/headline': '400 24px/1.2 "Inter Tight", Inter, sans-serif',
  'text/body-large': '400 22px/1.4 "Inter Tight", Inter, sans-serif',
  'text/body': '400 18px/1.3 "Inter Tight", Inter, sans-serif',
  'text/body-small': '400 16px/1.4 "Inter Tight", Inter, sans-serif',
  'text/ui': '400 13px/1.45 "Inter Tight", Inter, sans-serif',
  'text/measure': '400 13px/1.23 "Geist Mono", ui-monospace, Menlo, monospace',
  'tracking/headline': '-0.14px',
  'tracking/body-large': '-0.13px',
  'tracking/body': '-0.018px',
  'tracking/body-small': '-0.016px',
  'tracking/data': '-0.26px',
  'feature/tabular': '"tnum" 1',
  'wrap/heading': 'balance',
  'wrap/body': 'pretty',
  'lane/history-time': '8ch',
  'layout/panel-width': '320px',
  'hit/target': '44px',
  'icon/disclosure-size': '7px',

  'radius/none': '0px',
  'radius/inner': '8px',
  'radius/outer': '20px',
  'radius/full': '9999px',

  'space/xs': '4px',
  'space/sm': '8px',
  'space/md': '12px',
  'space/base': '16px',
  'space/lg': '20px',
  'space/xl': '24px',
  'space/card': '40px',
  'space/section': '48px',
  'space/room': '80px',
} as const;

export type SessionState = 'idle' | 'working' | 'waiting-for-you' | 'done' | 'error';
export type AutonomyLevel = 'assist' | 'auto-prep' | 'full-prep';
export type ReviewState = 'unreviewed' | 'accepted' | 'rejected' | 'stale';
export type SurfaceSystem = 'bench' | 'plate';
export type SurfaceElevation = 'flush' | 'raised';

export function sessionLabel(state: SessionState): string {
  return token[`session/${state}`];
}

export function autonomyLabel(level: AutonomyLevel): string {
  return token[`autonomy/${level}`];
}
