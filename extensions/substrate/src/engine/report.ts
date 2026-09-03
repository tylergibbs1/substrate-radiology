import type { ReviewState } from '../designTokens';

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

type Provenance = {
  measurementId: string;
};

type Author =
  | {
      type: 'agent';
      label: string;
      /** Human who remains responsible for this delegated work. */
      owner: 'active-reader';
      delegate: 'substrate';
    }
  | { type: 'human'; label: string };

type Reply = {
  replyId: string;
  author: Author;
  text: string;
  kind: 'edit' | 'question';
  answeredByPointId?: string;
  ts: number;
};

export type Sentence = {
  sentenceId: string;
  section: string;
  text: string;
  author: Author;
  provenance: Provenance[];
  replacesSentenceId?: string;
  replies: Reply[];
  review?: ReviewState;
};

export type MeasurementSnapshot = {
  measurementId: string;
  label: string;
  value: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopInstanceUid: string;
  sopClassUid: string;
  frameOfReferenceUid: string;
  referencedImageId: string;
};

export type ReportEvidenceSnapshot = {
  StudyInstanceUID: string;
  SeriesInstanceUID: string;
  SOPInstanceUID: string;
  SOPClassUID: string;
  PatientID?: string;
  PatientName?: string;
  PatientBirthDate?: string;
  PatientSex?: string;
  StudyDate?: string;
  StudyTime?: string;
  StudyID?: string;
  AccessionNumber?: string;
  StudyDescription?: string;
};

export type ReportVersion = {
  version: number;
  template: string;
  sentences: Sentence[];
  noteToSigner?: string;
  /** Immutable evidence captured when this exact report version was drafted. */
  measurements: readonly Readonly<MeasurementSnapshot>[];
  evidence: Readonly<ReportEvidenceSnapshot> | null;
  hash: string;
  createdBy: Author;
  createdAt: number;
};

export type Signature = {
  version: number;
  hash: string;
  signer: string;
  attestation: string;
  /** Sentence ids the signer accepted despite having no measurement behind them. */
  acceptedUnsupported: string[];
  ts: number;
};

/**
 * RFC 8785-style canonical JSON: object keys sorted, no insignificant
 * whitespace. Enough of the scheme for a hash both sides can recompute, and
 * deliberately small — the alternative is trusting that two JSON.stringify
 * calls happened to order keys the same way.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(',')}}`;
}

/**
 * Free text is normalized before hashing so a stray double space cannot
 * invalidate a signature, while any change that survives normalization does.
 */
function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .trim();
}

function ensureActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/** What the signature actually covers. */
export function packetFor(version: ReportVersion): unknown {
  const activeSentences = version.sentences.filter(sentence => sentence.review !== 'rejected');
  const citedIds = new Set(
    activeSentences.flatMap(sentence => sentence.provenance.map(entry => entry.measurementId))
  );
  return {
    template: version.template,
    sentences: activeSentences.map(sentence => ({
      section: sentence.section,
      text: normalizeText(sentence.text),
      cites: sentence.provenance.map(entry => entry.measurementId).sort(),
    })),
    measurements: version.measurements
      .filter(snapshot => citedIds.has(snapshot.measurementId))
      .map(snapshot => ({ ...snapshot }))
      .sort((a, b) => a.measurementId.localeCompare(b.measurementId)),
    evidence: version.evidence,
  };
}

async function hashReport(version: ReportVersion): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(packetFor(version)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* --------------------------------------------------------------- the store */

type State = {
  versions: ReportVersion[];
  signature: Signature | null;
};

const state: State = { versions: [], signature: null };
const listeners = new Set<() => void>();

type SignatureRequest = {
  requestId: string;
  versionNumber: number;
  versionHash: string;
  summaryForSigner: string;
  status: 'pending' | 'signed' | 'declined';
};

let request: SignatureRequest | null = null;

export function subscribeReport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

export function currentVersion(): ReportVersion | null {
  return state.versions[state.versions.length - 1] ?? null;
}

export function allVersions(): ReportVersion[] {
  return state.versions;
}

export function signature(): Signature | null {
  return state.signature;
}

type OpenReply = Reply & { sentenceId: string; sentenceText: string };

export function openReplies(): OpenReply[] {
  const version = currentVersion();
  if (!version) return [];
  return version.sentences.flatMap(sentence =>
    sentence.replies
      .filter(reply => !reply.answeredByPointId)
      .map(reply => ({ ...reply, sentenceId: sentence.sentenceId, sentenceText: sentence.text }))
  );
}

export function addReply(
  sentenceId: string,
  text: string,
  kind: Reply['kind'] = 'question'
): Reply | null {
  const version = currentVersion();
  const clean = normalizeText(text);
  if (!version || !clean) return null;
  const index = version.sentences.findIndex(sentence => sentence.sentenceId === sentenceId);
  if (index < 0) return null;
  const reply: Reply = {
    replyId: `reply-${Date.now()}`,
    author: { type: 'human', label: 'you' },
    text: clean,
    kind,
    ts: Date.now(),
  };
  const sentences = [...version.sentences];
  sentences[index] = {
    ...sentences[index],
    replies: [...sentences[index].replies, reply],
  };
  state.versions[state.versions.length - 1] = { ...version, sentences };
  announce();
  return reply;
}

/**
 * Whether the signature still covers what is on screen. A signature that
 * silently survived an edit would be the one genuinely dangerous bug in this
 * product, so export checks this rather than trusting that nothing changed.
 */
export function signatureIsStale(): boolean {
  const version = currentVersion();
  if (!state.signature || !version) return false;
  return state.signature.hash !== version.hash;
}

export async function addVersion(
  template: string,
  sentences: Sentence[],
  createdBy: Author,
  noteToSigner?: string,
  options: {
    measurements?: MeasurementSnapshot[];
    evidence?: ReportEvidenceSnapshot | null;
    signal?: AbortSignal;
  } = {}
): Promise<ReportVersion> {
  ensureActive(options.signal);
  const previous = currentVersion();
  const measurements = Object.freeze(
    (options.measurements ?? previous?.measurements ?? []).map(snapshot =>
      Object.freeze({ ...snapshot })
    )
  );
  const evidence = options.evidence === undefined ? (previous?.evidence ?? null) : options.evidence;
  const version: ReportVersion = {
    version: state.versions.length + 1,
    template,
    sentences,
    noteToSigner,
    measurements,
    evidence: evidence ? Object.freeze({ ...evidence }) : null,
    hash: '',
    createdBy,
    createdAt: Date.now(),
  };
  version.hash = await hashReport(version);
  ensureActive(options.signal);
  state.versions.push(version);
  if (request?.status === 'pending') request = null;
  announce();
  return version;
}

export async function setSentenceReview(
  sentenceId: string,
  review: Exclude<ReviewState, 'stale'>
): Promise<ReportVersion | null> {
  const version = currentVersion();
  if (!version) return null;
  const index = version.sentences.findIndex(sentence => sentence.sentenceId === sentenceId);
  if (index < 0) return null;
  const sentences = version.sentences.map((sentence, sentenceIndex) =>
    sentenceIndex === index ? { ...sentence, review } : sentence
  );
  if (
    request?.status === 'pending' &&
    request.versionNumber === version.version &&
    request.versionHash === version.hash
  ) {
    // Acceptance itself is outside the packet, but rejection changes which
    // sentences will be signed and exported. Recompute in both cases so this
    // branch remains safe if packetFor later incorporates more review state.
    const updated = { ...version, sentences, hash: '' };
    updated.hash = await hashReport(updated);
    state.versions[state.versions.length - 1] = updated;
    request = { ...request, versionHash: updated.hash };
    announce();
    return updated;
  }
  return addVersion(
    version.template,
    sentences,
    { type: 'human', label: 'you' },
    version.noteToSigner,
    {
      measurements: [...version.measurements],
      evidence: version.evidence ? { ...version.evidence } : null,
    }
  );
}

export async function restoreVersion(versionNumber: number): Promise<ReportVersion | null> {
  const source = state.versions.find(version => version.version === versionNumber);
  if (!source) return null;
  const sentences = source.sentences.map(sentence => ({
    ...sentence,
    provenance: sentence.provenance.map(entry => ({ ...entry })),
    replies: sentence.replies.map(reply => ({ ...reply })),
  }));
  return addVersion(
    source.template,
    sentences,
    { type: 'human', label: 'you' },
    source.noteToSigner,
    {
      measurements: [...source.measurements],
      evidence: source.evidence ? { ...source.evidence } : null,
    }
  );
}

export async function changeTemplate(template: string): Promise<ReportVersion | null> {
  const version = currentVersion();
  const clean = normalizeText(template);
  if (!version || !clean || clean === version.template) return version;
  return addVersion(
    clean,
    version.sentences,
    { type: 'human', label: 'you' },
    version.noteToSigner,
    {
      measurements: [...version.measurements],
      evidence: version.evidence ? { ...version.evidence } : null,
    }
  );
}

export function sign(
  signer: string,
  attestation: string,
  acceptedUnsupported: string[]
): Signature | null {
  if (request?.status !== 'pending' || !signer.trim() || !attestation.trim()) return null;
  const version =
    state.versions.find(
      candidate =>
        candidate.version === request?.versionNumber && candidate.hash === request.versionHash
    ) ?? null;
  if (!version) return null;
  const active = version.sentences.filter(sentence => sentence.review !== 'rejected');
  if (active.some(sentence => sentence.author.type === 'agent' && sentence.review !== 'accepted')) {
    return null;
  }
  const accepted = new Set(acceptedUnsupported);
  if (
    active.some(sentence => sentence.provenance.length === 0 && !accepted.has(sentence.sentenceId))
  ) {
    return null;
  }
  state.signature = {
    version: version.version,
    hash: version.hash,
    signer,
    attestation,
    acceptedUnsupported,
    ts: Date.now(),
  };
  announce();
  return state.signature;
}

export function clearReport(): void {
  state.versions = [];
  state.signature = null;
  request = null;
  announce();
}

/* ------------------------------------------------------ the signature request */

export function pendingRequest(): SignatureRequest | null {
  return request;
}

export function requestSignature(summaryForSigner: string): SignatureRequest | null {
  const version = currentVersion();
  if (!version) return null;
  request = {
    requestId: `sig-${version.version}-${Date.now()}`,
    versionNumber: version.version,
    versionHash: version.hash,
    summaryForSigner,
    status: 'pending',
  };
  announce();
  return request;
}

/** The exact report version a pending human request is reviewing. */
export function requestedVersion(): ReportVersion | null {
  if (!request) return null;
  return (
    state.versions.find(
      version => version.version === request?.versionNumber && version.hash === request.versionHash
    ) ?? null
  );
}

/** The immutable version covered by the current signature. */
export function signedVersion(): ReportVersion | null {
  if (!state.signature) return null;
  return (
    state.versions.find(
      version =>
        version.version === state.signature?.version && version.hash === state.signature.hash
    ) ?? null
  );
}

export function resolveRequest(status: 'signed' | 'declined'): void {
  if (request) request = { ...request, status };
  announce();
}

export function dismissRequest(): void {
  request = null;
  announce();
}
