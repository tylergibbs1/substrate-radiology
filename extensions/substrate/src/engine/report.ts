/**
 * The report, and the signature bound to it.
 *
 * The rule the whole thing turns on: a sentence may only claim something that a
 * measurement supports, and that measurement must be one a person made or
 * accepted. A sentence with no provenance is not refused — radiologists write
 * true things that are not measurements — but it is flagged, listed separately
 * in the signature modal, and the signer has to accept it explicitly.
 *
 * The signature is over a SHA-256 of the canonical form of the report, so it
 * covers the exact text and the exact measurements cited. Change either
 * afterwards and the hash no longer matches, which is what "stale" means here.
 */

export type Provenance = {
  measurementId: string
}

export type Author = { type: 'agent' | 'human'; label: string }

export type Reply = {
  replyId: string
  author: Author
  text: string
  kind: 'edit' | 'question'
  answeredByPointId?: string
  ts: number
}

export type Sentence = {
  sentenceId: string
  section: string
  text: string
  author: Author
  provenance: Provenance[]
  replacesSentenceId?: string
  replies: Reply[]
}

export type ReportVersion = {
  version: number
  template: string
  sentences: Sentence[]
  noteToSigner?: string
  hash: string
  createdBy: Author
  createdAt: number
}

export type Signature = {
  version: number
  hash: string
  signer: string
  attestation: string
  /** Sentence ids the signer accepted despite having no measurement behind them. */
  acceptedUnsupported: string[]
  ts: number
}

/**
 * RFC 8785-style canonical JSON: object keys sorted, no insignificant
 * whitespace. Enough of the scheme for a hash both sides can recompute, and
 * deliberately small — the alternative is trusting that two JSON.stringify
 * calls happened to order keys the same way.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(',')}}`
}

/**
 * Free text is normalized before hashing so a stray double space cannot
 * invalidate a signature, while any change that survives normalization does.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .trim()
}

/** What the signature actually covers. */
export function packetFor(version: ReportVersion): unknown {
  return {
    template: version.template,
    sentences: version.sentences.map((sentence) => ({
      section: sentence.section,
      text: normalizeText(sentence.text),
      cites: sentence.provenance.map((entry) => entry.measurementId).sort(),
    })),
  }
}

export async function hashReport(version: ReportVersion): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(packetFor(version)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* --------------------------------------------------------------- the store */

type State = {
  versions: ReportVersion[]
  signature: Signature | null
}

const state: State = { versions: [], signature: null }
const listeners = new Set<() => void>()

export function subscribeReport(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function announce(): void {
  for (const listener of listeners) listener()
}

export function currentVersion(): ReportVersion | null {
  return state.versions[state.versions.length - 1] ?? null
}

export function allVersions(): ReportVersion[] {
  return state.versions
}

export function signature(): Signature | null {
  return state.signature
}

/**
 * Whether the signature still covers what is on screen. A signature that
 * silently survived an edit would be the one genuinely dangerous bug in this
 * product, so export checks this rather than trusting that nothing changed.
 */
export function signatureIsStale(): boolean {
  const version = currentVersion()
  if (!state.signature || !version) return false
  return state.signature.hash !== version.hash
}

export async function addVersion(
  template: string,
  sentences: Sentence[],
  createdBy: Author,
  noteToSigner?: string
): Promise<ReportVersion> {
  const version: ReportVersion = {
    version: state.versions.length + 1,
    template,
    sentences,
    noteToSigner,
    hash: '',
    createdBy,
    createdAt: Date.now(),
  }
  version.hash = await hashReport(version)
  state.versions.push(version)
  announce()
  return version
}

export function sign(signer: string, attestation: string, acceptedUnsupported: string[]): Signature | null {
  const version = currentVersion()
  if (!version) return null
  state.signature = {
    version: version.version,
    hash: version.hash,
    signer,
    attestation,
    acceptedUnsupported,
    ts: Date.now(),
  }
  announce()
  return state.signature
}

export function clearReport(): void {
  state.versions = []
  state.signature = null
  announce()
}

/* ------------------------------------------------------ the signature request */

export type SignatureRequest = {
  requestId: string
  versionNumber: number
  summaryForSigner: string
  status: 'pending' | 'signed' | 'declined'
}

let request: SignatureRequest | null = null

export function pendingRequest(): SignatureRequest | null {
  return request
}

export function requestSignature(summaryForSigner: string): SignatureRequest | null {
  const version = currentVersion()
  if (!version) return null
  request = {
    requestId: `sig-${version.version}-${Date.now()}`,
    versionNumber: version.version,
    summaryForSigner,
    status: 'pending',
  }
  announce()
  return request
}

export function resolveRequest(status: 'signed' | 'declined'): void {
  if (request) request = { ...request, status }
  announce()
}

export function dismissRequest(): void {
  request = null
  announce()
}
