import type { RegistrationResult } from './spec';
import { token, type SessionState } from '../designTokens';

/**
 * What the agent has been doing, so the panel and the radiologist can see it.
 *
 * Every tool call passes through here on its way out, which is what makes the
 * agent's work visible and attributable rather than something that happens to
 * the viewport for no stated reason. It is a plain event emitter and not a
 * service, because it must be readable from a tool's `execute` without going
 * through React.
 */

export type ToolCallEvent = {
  callId: number;
  owner: 'active-reader';
  delegate: 'substrate';
  tool: string;
  argsSummary: string;
  resultSummary: string;
  entities: string[];
  ok: boolean;
  startedAt: number;
  finishedAt?: number;
  /** Reader-facing activity fields. Tool names never cross this boundary. */
  activity?: AgentActivity;
  running?: boolean;
  /** Cancels the in-flight execute when the browser call is still pending. */
  stop?: () => void;
  /** A successful, visible effect the agent caused in a named viewport. */
  effects?: AgentViewportEffect[];
  /** Set when the call changed something a person can put back. */
  undo?: () => void | Promise<void>;
};

export type AgentActivity = {
  action: string;
  parameter?: string;
  result?: string;
};

export type AgentViewportEffect = {
  viewportId: string;
  label: string;
};

export const WRITE_TOOLS = new Set([
  'navigate',
  'set_display',
  'hang_layout',
  'propose_measurement',
  'draft_report',
  'request_signature',
]);

export function isWriteEvent(event: ToolCallEvent): boolean {
  return WRITE_TOOLS.has(event.tool);
}

type Listener = () => void;

class Presence {
  private events: ToolCallEvent[] = [];
  private nextCallId = 1;
  private nextSessionId = 1;
  private activeSessionId = 0;
  private callSessions = new Map<number, number>();
  private registration: RegistrationResult = { ok: true, registered: [] };
  private listeners = new Set<Listener>();

  /**
   * Start an isolated mode session. Calls from an older route may still settle,
   * but their completion must never repopulate the next reader's activity feed.
   */
  beginSession(): number {
    const sessionId = this.nextSessionId++;
    this.activeSessionId = sessionId;
    this.events = [];
    this.callSessions.clear();
    this.registration = { ok: true, registered: [] };
    this.announce();
    return sessionId;
  }

  endSession(sessionId: number): void {
    if (sessionId !== this.activeSessionId) return;
    this.activeSessionId = this.nextSessionId++;
    this.events = [];
    this.callSessions.clear();
    this.registration = { ok: true, registered: [] };
    this.announce();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private announce(): void {
    for (const listener of this.listeners) listener();
  }

  record(event: ToolCallEvent): void {
    this.events = [event, ...this.events].slice(0, 200);
    this.announce();
  }

  begin(
    tool: string,
    argsSummary: string,
    startedAt: number,
    stop?: () => void,
    activity?: AgentActivity
  ): number {
    const callId = this.nextCallId++;
    this.callSessions.set(callId, this.activeSessionId);
    this.record({
      callId,
      owner: 'active-reader',
      delegate: 'substrate',
      tool,
      argsSummary,
      resultSummary: '',
      entities: [],
      ok: true,
      startedAt,
      activity,
      running: true,
      stop,
    });
    return callId;
  }

  finish(
    callId: number,
    event: Omit<ToolCallEvent, 'callId' | 'running' | 'owner' | 'delegate'>
  ): void {
    const callSessionId = this.callSessions.get(callId);
    this.callSessions.delete(callId);
    if (callSessionId !== this.activeSessionId) return;

    const index = this.events.findIndex(entry => entry.callId === callId);
    const finished: ToolCallEvent = {
      ...event,
      callId,
      owner: 'active-reader',
      delegate: 'substrate',
      running: false,
      finishedAt: Date.now(),
    };
    if (index === -1) {
      this.events = [finished, ...this.events].slice(0, 200);
    } else {
      this.events = this.events.map((entry, entryIndex) =>
        entryIndex === index ? finished : entry
      );
    }
    this.announce();
  }

  /** Newest first. The feed renders this directly. */
  getEvents(): ToolCallEvent[] {
    return this.events;
  }

  getLast(): ToolCallEvent | null {
    return this.events[0] ?? null;
  }

  getLastWrite(): ToolCallEvent | null {
    return this.events.find(isWriteEvent) ?? null;
  }

  /** The only session-state decision. UI consumers render this; they do not infer it. */
  getSessionState(waitingForHuman = false, now = Date.now()): SessionState {
    if (this.registration.ok === false && this.registration.failure.kind !== 'unsupported') {
      return 'error';
    }
    const last = this.getLast();
    if (waitingForHuman) return 'waiting-for-you';
    if (this.events.some(event => event.running && isWriteEvent(event))) return 'working';
    if (
      last &&
      !last.running &&
      !last.ok &&
      now - (last.finishedAt ?? last.startedAt) < token['motion/error-hold']
    ) {
      return 'idle';
    }
    if (
      last &&
      !last.running &&
      !last.ok &&
      now - (last.finishedAt ?? last.startedAt) >= token['motion/error-hold']
    ) {
      return 'error';
    }
    const lastWrite = this.getLastWrite();
    if (lastWrite && now - lastWrite.startedAt < 2000) return 'done';
    return 'idle';
  }

  setRegistration(registration: RegistrationResult, sessionId = this.activeSessionId): void {
    if (sessionId !== this.activeSessionId) return;
    this.registration = registration;
    this.announce();
  }

  getRegistration(): RegistrationResult {
    return this.registration;
  }

  clear(): void {
    this.events = [];
    this.announce();
  }
}

export const presence = new Presence();

/**
 * A short summary of what a call was asking for, in the reader's words.
 *
 * The feed sits on a radiologist's screen, so it must not print parameter
 * names: "slice 140" is what happened, `slice_index 140` is how it was spelled
 * in a schema. Anything without a phrasing here is left out rather than shown
 * raw, because a half-translated line reads worse than a shorter one.
 */
const PHRASING = new Map<string, (value: unknown) => string>([
  [
    'slice_index',
    value => `slice ${typeof value === 'number' ? String(value + 1) : String(value)}`,
  ],
  ['measurement_id', () => 'to a measurement'],
  ['preset', value => `${String(value)} window`],
  ['reset_zoom_pan', () => 'reset zoom and pan'],
  ['rows', value => `${String(value)} row${value === 1 ? '' : 's'}`],
  ['cols', value => `${String(value)} across`],
  ['tracked_only', () => 'tracked only'],
  ['viewports', value => `${Array.isArray(value) ? value.length : 0} series`],
  ['label', value => `labelled ${String(value)}`],
]);

export function summarize(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === false) continue;
    const phrase = PHRASING.get(key);
    if (phrase) parts.push(phrase(value));
  }
  return parts.join(', ');
}
