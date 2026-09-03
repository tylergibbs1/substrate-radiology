export type TimingKind = 'by-hand' | 'with-agent'

type TimingState = {
  active: { kind: TimingKind; startedAt: number } | null
  results: Partial<Record<TimingKind, number>>
}

const STORAGE_KEY = 'substrate.timing'
const listeners = new Set<() => void>()

function initial(): TimingState {
  if (typeof window === 'undefined') return { active: null, results: {} }
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    return { active: null, results: value.results ?? {} }
  } catch {
    return { active: null, results: {} }
  }
}

let state = initial()

function announce(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ results: state.results }))
  }
  for (const listener of listeners) listener()
}

export const timing = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get(): TimingState {
    return { active: state.active ? { ...state.active } : null, results: { ...state.results } }
  },
  start(kind: TimingKind, now = Date.now()): void {
    state = { ...state, active: { kind, startedAt: now } }
    announce()
  },
  stop(now = Date.now()): number | null {
    if (!state.active) return null
    const seconds = Math.max(0, Math.round((now - state.active.startedAt) / 1000))
    state = {
      active: null,
      results: { ...state.results, [state.active.kind]: seconds },
    }
    announce()
    return seconds
  },
  cancel(): void {
    if (!state.active) return
    state = { ...state, active: null }
    announce()
  },
  reset(): void {
    state = { active: null, results: {} }
    announce()
  },
}
