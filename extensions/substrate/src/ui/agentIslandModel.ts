import type { ToolCallEvent } from '../webmcp/presence';

export const BURST_GAP_MS = 3500;

export const IN_FLIGHT = new Map<string, string>([
  ['navigate', 'moving through the study'],
  ['set_display', 'adjusting the display'],
  ['hang_layout', 'hanging the study'],
  ['propose_measurement', 'proposing a measurement'],
  ['draft_report', 'drafting the report'],
  ['request_signature', 'preparing signature review'],
]);

export const CONFIRMATION_LABEL = new Map<string, string>([
  ['navigate', 'Move through the study'],
  ['set_display', 'Adjust the display'],
  ['hang_layout', 'Hang the study'],
  ['propose_measurement', 'Suggest a measurement'],
  ['draft_report', 'Draft the report'],
]);

export function relative(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 1) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function finishedPhrase(event: ToolCallEvent): string {
  if (event.activity) return formatActivity(event.activity);
  if (!event.ok) return event.resultSummary || 'The change did not go through';
  switch (event.tool) {
    case 'hang_layout':
      return 'Hung the study';
    case 'set_display':
      return event.argsSummary ? `Applied ${event.argsSummary}` : 'Adjusted the display';
    case 'navigate':
      return event.argsSummary ? `Moved to ${event.argsSummary}` : 'Moved through the study';
    case 'propose_measurement':
      return 'Proposed a measurement on the prior';
    case 'draft_report':
      return 'Drafted the report from cited measurements';
    case 'request_signature':
      return 'Sent the report for signature review';
    default:
      return 'Updated the viewer';
  }
}

export function formatActivity(activity: NonNullable<ToolCallEvent['activity']>): string {
  return [activity.action, activity.parameter, activity.result].filter(Boolean).join(' · ');
}

export function groupBursts(events: ToolCallEvent[]): ToolCallEvent[][] {
  const groups: ToolCallEvent[][] = [];
  for (const event of events) {
    const group = groups[groups.length - 1];
    if (!group || Math.abs(group[group.length - 1].startedAt - event.startedAt) > BURST_GAP_MS) {
      groups.push([event]);
    } else {
      group.push(event);
    }
  }
  return groups;
}

export function summarizeBurst(events: ToolCallEvent[]): string {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const event of events) {
    const key = event.activity
      ? `${event.activity.action}:${event.activity.parameter}:${event.activity.result}`
      : `${event.tool}:${event.argsSummary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(finishedPhrase(event));
  }
  return phrases.join('. ');
}

export type IslandCommand = {
  label: string;
  disabled: boolean;
  run: () => void;
};
