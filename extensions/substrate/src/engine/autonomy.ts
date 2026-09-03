import type { AutonomyLevel } from '../designTokens'

export type ConfirmationRequest = {
  id: string
  tool: string
  summary: string
  createdAt: number
  viewportId?: string
}

type Decision = 'apply' | 'skip'
type Listener = () => void

const CONFIRMED_WRITES = new Set([
  'hang_layout',
  'navigate',
  'set_display',
  'propose_measurement',
  'draft_report',
])

const LEVEL_KEY = 'substrate.autonomy-level'
const INSTRUCTIONS_KEY = 'substrate.standing-instructions'

function storedLevel(): AutonomyLevel {
  if (typeof window === 'undefined') return 'auto-prep'
  const value = window.localStorage.getItem(LEVEL_KEY)
  return value === 'assist' || value === 'full-prep' ? value : 'auto-prep'
}

function storedInstructions(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(INSTRUCTIONS_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

class Autonomy {
  private level: AutonomyLevel = storedLevel()
  private instructions: string[] = storedInstructions()
  private pending = new Map<
    string,
    ConfirmationRequest & { resolve: (decision: Decision) => void; cleanup: () => void }
  >()
  private listeners = new Set<Listener>()
  private nextId = 1
  private viewportResolver: (() => string | undefined) | undefined

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private announce(): void {
    for (const listener of this.listeners) listener()
  }

  getLevel(): AutonomyLevel {
    return this.level
  }

  setLevel(level: AutonomyLevel): void {
    this.level = level
    if (typeof window !== 'undefined') window.localStorage.setItem(LEVEL_KEY, level)
    this.announce()
  }

  getStandingInstructions(): string[] {
    return [...this.instructions]
  }

  setStandingInstructions(instructions: string[]): void {
    this.instructions = instructions.map(value => value.trim()).filter(Boolean)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(INSTRUCTIONS_KEY, JSON.stringify(this.instructions))
    }
    this.announce()
  }

  getPending(): ConfirmationRequest[] {
    return [...this.pending.values()].map(
      ({ resolve: _resolve, cleanup: _cleanup, ...request }) => request
    )
  }

  needsConfirmation(tool: string): boolean {
    return this.level === 'assist' && CONFIRMED_WRITES.has(tool)
  }

  isConfirmable(tool: string): boolean {
    return CONFIRMED_WRITES.has(tool)
  }

  setViewportResolver(resolver?: () => string | undefined): void {
    this.viewportResolver = resolver
  }

  authorize(
    tool: string,
    summary: string,
    signal?: AbortSignal,
    viewportId?: string
  ): Promise<Decision> {
    if (!this.needsConfirmation(tool)) return Promise.resolve('apply')
    const id = `confirmation-${this.nextId++}`
    return new Promise(resolve => {
      const onAbort = () => this.decide(id, 'skip')
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        id,
        tool,
        summary,
        createdAt: Date.now(),
        viewportId: viewportId || this.viewportResolver?.(),
        resolve,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      })
      this.announce()
    })
  }

  decide(id: string, decision: Decision): boolean {
    const request = this.pending.get(id)
    if (!request) return false
    this.pending.delete(id)
    request.cleanup()
    request.resolve(decision)
    this.announce()
    return true
  }
}

export const autonomy = new Autonomy()
