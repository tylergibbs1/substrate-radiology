/** Decisions shared by Substrate's UI, code reviews, agents and demo script. */
export const token = {
  'agent/mark':
    'M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z',
  'agent/accent': '#62cfc3',

  'action/primary': '#f54e00',
  'action/primary-hover': '#ff5a0d',
  'action/primary-press': '#d04200',
  'on/primary': '#ffffff',

  'state/proposed': '#d6a84b',
  'state/confirmed': '#d0d6e0',
  'state/unaligned': '#eb5757',

  'review/unreviewed': '#d6a84b',
  'review/accepted': '#75b985',
  'review/rejected': '#eb5757',
  'review/stale': '#d6a84b',

  'session/idle': 'Idle',
  'session/working': 'Working',
  'session/waiting-for-you': 'Waiting for you',
  'session/done': 'Done',
  'session/error': 'Error',

  'autonomy/assist': 'Assist',
  'autonomy/auto-prep': 'Auto-prep',
  'autonomy/full-prep': 'Full prep',

  'surface/room': '#08090a',
  'surface/panel': '#0f1011',
  'border/hairline': '#23252a',

  'ink/high': '#f7f7f4',
  'ink/mid': '#d0d6e0',
  'ink/low': '#8a8f98',
  'ink/dim': '#62666d',

  'motion/enter': 150,
  'motion/exit': 100,
  'motion/presence': 1250,

  'text/ui': '12.5px',
  'text/measure': '500 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export type SessionState = 'idle' | 'working' | 'waiting-for-you' | 'done' | 'error';
export type AutonomyLevel = 'assist' | 'auto-prep' | 'full-prep';
export type ReviewState = 'unreviewed' | 'accepted' | 'rejected' | 'stale';

export function sessionLabel(state: SessionState): string {
  return token[`session/${state}`];
}

export function autonomyLabel(level: AutonomyLevel): string {
  return token[`autonomy/${level}`];
}
