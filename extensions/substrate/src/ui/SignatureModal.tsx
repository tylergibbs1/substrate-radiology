import React, { useEffect, useMemo, useState } from 'react'

import {
  currentVersion,
  dismissRequest,
  pendingRequest,
  resolveRequest,
  sign,
  subscribeReport,
  type Sentence,
} from '../engine/report'

/**
 * The signature.
 *
 * Everything else in Substrate exists to make this moment honest. The
 * radiologist sees the report as it will read, every measurement it rests on,
 * and — above the sign button, not buried — the two things that should give
 * them pause: sentences that cite nothing, and sentences the agent wrote that
 * they have never touched.
 *
 * Nothing else in the product can create a signature. No tool can; the agent's
 * request only opens this dialog. The signature binds to the report's hash, so
 * an edit afterwards makes it stale and the export says so.
 */

const ATTESTATION =
  'I have reviewed the images and the measurements cited here. This report reflects my ' +
  'own interpretation, and I take responsibility for it.'

type Props = {
  services: Record<string, unknown>
}

export function SignatureModal({ services }: Props): React.ReactElement | null {
  const [, tick] = useState(0)
  const [signer, setSigner] = useState('')
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())

  useEffect(() => subscribeReport(() => tick((value) => value + 1)), [])

  const request = pendingRequest()
  const version = currentVersion()
  const open = request?.status === 'pending' && version !== null

  // Escape declines rather than silently dismissing: closing a signature
  // request without an answer would leave the agent polling forever.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resolveRequest('declined')
        dismissRequest()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const unsupported = useMemo(
    () => (version?.sentences ?? []).filter((s) => s.provenance.length === 0),
    [version]
  )
  const unreviewed = useMemo(
    () =>
      (version?.sentences ?? []).filter(
        (s) => s.author.type === 'agent' && !reviewed.has(s.sentenceId)
      ),
    [version, reviewed]
  )

  if (!open || !version) return null

  const blockers: string[] = []
  if (!signer.trim()) blockers.push('Your name is needed on the report.')
  const unaccepted = unsupported.filter((s) => !accepted.has(s.sentenceId))
  if (unaccepted.length > 0) {
    blockers.push(
      `${unaccepted.length} sentence(s) cite no measurement and have not been accepted.`
    )
  }

  const measurementService = services.measurementService as
    | { getMeasurement?: (uid: string) => { label?: string; displayText?: unknown } | undefined }
    | undefined

  const valueOf = (measurementId: string): string => {
    const found = measurementService?.getMeasurement?.(measurementId)
    const display = found?.displayText as { primary?: string[] } | undefined
    const label = found?.label ? `${found.label}: ` : ''
    return `${label}${display?.primary?.join(' ') ?? 'no value yet'}`
  }

  const bySection = new Map<string, Sentence[]>()
  for (const sentence of version.sentences) {
    const rows = bySection.get(sentence.section) ?? []
    rows.push(sentence)
    bySection.set(sentence.section, rows)
  }

  const surface: React.CSSProperties = {
    background: 'rgba(17, 24, 39, 0.92)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: 'rgba(255,255,255,0.92)',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign the report"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        padding: 24,
      }}
    >
      <div
        style={{
          ...surface,
          borderRadius: 18,
          width: 'min(760px, 100%)',
          maxHeight: 'min(84vh, 900px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header stays put; only the body scrolls, so the question never
            scrolls away from the answer. */}
        <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            Sign this report?
          </h2>
          {request?.summaryForSigner ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
              {request.summaryForSigner}
            </p>
          ) : null}
          {version.noteToSigner ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
              Your agent says: {version.noteToSigner}
            </p>
          ) : null}
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 22px', flex: 1 }}>
          {[...bySection.entries()].map(([section, rows]) => (
            <section key={section} style={{ marginBottom: 18 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.55, fontWeight: 500 }}>
                {section}
              </h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {rows.map((sentence) => {
                  const isUnsupported = sentence.provenance.length === 0
                  return (
                    <li
                      key={sentence.sentenceId}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{sentence.text}</p>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          alignItems: 'center',
                          marginTop: 6,
                        }}
                      >
                        <span style={{ fontSize: 11.5, opacity: 0.45 }}>
                          {sentence.author.type === 'agent' ? 'written by your agent' : 'written by you'}
                        </span>
                        {sentence.provenance.map((entry) => (
                          <span
                            key={entry.measurementId}
                            style={{
                              fontSize: 11.5,
                              padding: '2px 8px',
                              borderRadius: 999,
                              border: '1px solid rgba(255,255,255,0.18)',
                              opacity: 0.85,
                            }}
                          >
                            {valueOf(entry.measurementId)}
                          </span>
                        ))}
                        {isUnsupported ? (
                          <span style={{ fontSize: 11.5, color: 'rgb(251,191,36)' }}>
                            cites no measurement
                          </span>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* The two things that should give a signer pause, immediately above
            the button, where they cannot be scrolled past. */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '12px 22px' }}>
          {unsupported.length > 0 ? (
            <div style={{ marginBottom: 10 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12.5, color: 'rgb(251,191,36)' }}>
                {unsupported.length} sentence(s) are not backed by a measurement. Accept each one
                to put your name to it.
              </p>
              {unsupported.map((sentence) => (
                <label
                  key={sentence.sentenceId}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    fontSize: 12.5,
                    padding: '3px 0',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={accepted.has(sentence.sentenceId)}
                    onChange={(event) =>
                      setAccepted((prev) => {
                        const next = new Set(prev)
                        if (event.target.checked) next.add(sentence.sentenceId)
                        else next.delete(sentence.sentenceId)
                        return next
                      })
                    }
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ opacity: 0.8 }}>{sentence.text}</span>
                </label>
              ))}
            </div>
          ) : null}

          {unreviewed.length > 0 ? (
            <p style={{ margin: '0 0 10px', fontSize: 12.5, opacity: 0.7 }}>
              {unreviewed.length} sentence(s) were written by your agent and you have not edited
              them.{' '}
              <button
                type="button"
                onClick={() =>
                  setReviewed(new Set(version.sentences.map((s) => s.sentenceId)))
                }
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.9)',
                  font: 'inherit',
                  fontSize: 12.5,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                I have read them
              </button>
            </p>
          ) : null}

          <p style={{ margin: '0 0 10px', fontSize: 12.5, opacity: 0.7, lineHeight: 1.5 }}>
            {ATTESTATION}
          </p>

          <label style={{ display: 'block', fontSize: 12, opacity: 0.6, marginBottom: 4 }}>
            Your name
            <input
              value={signer}
              onChange={(event) => setSigner(event.target.value)}
              placeholder="Dr —"
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: '7px 10px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                color: 'inherit',
                font: 'inherit',
                fontSize: 13,
              }}
            />
          </label>

          <p style={{ margin: '8px 0 0', fontSize: 11, opacity: 0.4 }}>
            Your signature covers this exact text and these exact measurements. Digest{' '}
            {version.hash.slice(0, 16)}. Change anything afterwards and the export will say the
            signature is stale.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'flex-end',
              marginTop: 12,
            }}
          >
            {blockers.length > 0 ? (
              <span style={{ marginRight: 'auto', fontSize: 12, color: 'rgb(251,191,36)' }}>
                {blockers[0]}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                resolveRequest('declined')
                dismissRequest()
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                font: 'inherit',
                fontSize: 13,
                padding: '7px 10px',
                cursor: 'pointer',
              }}
            >
              Decline
            </button>
            <button
              type="button"
              disabled={blockers.length > 0}
              onClick={() => {
                sign(signer.trim(), ATTESTATION, [...accepted])
                resolveRequest('signed')
                dismissRequest()
              }}
              style={{
                background: blockers.length > 0 ? 'rgba(255,255,255,0.1)' : 'rgb(56,189,248)',
                color: blockers.length > 0 ? 'rgba(255,255,255,0.4)' : 'rgb(3,18,32)',
                border: 'none',
                borderRadius: 999,
                font: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 18px',
                cursor: blockers.length > 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Sign
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
