import type { RegistrationResult } from './spec'

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
  tool: string
  argsSummary: string
  resultSummary: string
  entities: string[]
  ok: boolean
  startedAt: number
  /** Set when the call changed something a person can put back. */
  undo?: () => void
}

type Listener = () => void

class Presence {
  private events: ToolCallEvent[] = []
  private registration: RegistrationResult = { ok: true, registered: [] }
  private listeners = new Set<Listener>()

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private announce(): void {
    for (const listener of this.listeners) listener()
  }

  record(event: ToolCallEvent): void {
    this.events = [event, ...this.events].slice(0, 200)
    this.announce()
  }

  /** Newest first. The feed renders this directly. */
  getEvents(): ToolCallEvent[] {
    return this.events
  }

  getLast(): ToolCallEvent | null {
    return this.events[0] ?? null
  }

  setRegistration(registration: RegistrationResult): void {
    this.registration = registration
    this.announce()
  }

  getRegistration(): RegistrationResult {
    return this.registration
  }

  clear(): void {
    this.events = []
    this.announce()
  }
}

export const presence = new Presence()

/** A short, human summary of a tool's input. Never the raw JSON. */
export function summarize(input: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    const rendered =
      typeof value === 'object' ? `${Array.isArray(value) ? value.length : ''}…` : String(value)
    parts.push(`${key} ${rendered}`)
  }
  return parts.join(', ')
}
