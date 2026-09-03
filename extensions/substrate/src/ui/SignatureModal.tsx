import React, { useEffect, useMemo, useState } from 'react';

import { exportDicomSr, exportPdf } from '../engine/exportReport';
import {
  currentVersion,
  dismissRequest,
  pendingRequest,
  resolveRequest,
  sign,
  signature,
  signatureIsStale,
  setSentenceReview,
  subscribeReport,
  type Sentence,
} from '../engine/report';
import { token } from '../designTokens';
import { AgentMark } from './ThinkingIndicator';

/**
 * The signature.
 *
 * Everything else in Substrate exists to make this moment honest. The
 * radiologist sees the report as it will read and reviews unsupported sentences
 * in place. One short attestation preserves accountability without repeating
 * the report or explaining the interaction.
 *
 * Nothing else in the product can create a signature. No tool can; the agent's
 * request only opens this dialog. The signature binds to the report's hash, so
 * an edit afterwards makes it stale and the export says so.
 */

const ATTESTATION = 'I reviewed this report and take responsibility for it.';

type Props = {
  services: Record<string, unknown>;
};

export function SignatureModal({ services }: Props): React.ReactElement | null {
  const [, tick] = useState(0);
  const [signer, setSigner] = useState('');
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [attested, setAttested] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => subscribeReport(() => tick(value => value + 1)), []);

  const request = pendingRequest();
  const version = currentVersion();
  const signed = signature();
  const isSigned = request?.status === 'signed' && signed !== null;
  const open = (request?.status === 'pending' || isSigned) && version !== null;

  useEffect(() => {
    setSigner('');
    setAccepted(new Set());
    setAttested(false);
    setExportError('');
  }, [version?.version]);

  // Escape declines rather than silently dismissing: closing a signature
  // request without an answer would leave the agent polling forever.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resolveRequest('declined');
        dismissRequest();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const unsupported = useMemo(
    () =>
      (version?.sentences ?? []).filter(
        sentence => sentence.review !== 'rejected' && sentence.provenance.length === 0
      ),
    [version]
  );
  if (!open || !version) return null;

  const blockers: string[] = [];
  if (!signer.trim()) blockers.push('Your name is needed on the report.');
  if (!attested) blockers.push('Review the report before signing.');
  const unaccepted = unsupported.filter(s => !accepted.has(s.sentenceId));
  if (unaccepted.length > 0) {
    blockers.push(
      `${unaccepted.length} uncited ${unaccepted.length === 1 ? 'sentence needs' : 'sentences need'} review.`
    );
  }
  const unreviewed = version.sentences.filter(
    sentence => sentence.review !== 'accepted' && sentence.review !== 'rejected'
  );
  if (unreviewed.length > 0) {
    blockers.push(
      `${unreviewed.length} suggested ${unreviewed.length === 1 ? 'sentence needs' : 'sentences need'} review.`
    );
  }

  const measurementService = services.measurementService as
    | { getMeasurement?: (uid: string) => { label?: string; displayText?: unknown } | undefined }
    | undefined;

  const valueOf = (measurementId: string): string => {
    const found = measurementService?.getMeasurement?.(measurementId);
    const display = found?.displayText as { primary?: string[] } | undefined;
    const label = found?.label ? `${found.label}: ` : '';
    return `${label}${display?.primary?.join(' ') ?? 'no value yet'}`;
  };

  const bySection = new Map<string, Sentence[]>();
  for (const sentence of version.sentences.filter(row => row.review !== 'rejected')) {
    const rows = bySection.get(sentence.section) ?? [];
    rows.push(sentence);
    bySection.set(sentence.section, rows);
  }

  const surface: React.CSSProperties = {
    background: token['surface/panel'],
    border: `1px solid ${token['border/hairline']}`,
    color: '#d0d6e0',
    fontSize: token['text/ui'],
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontFeatureSettings: '"cv01" 1, "ss03" 1, "zero" 1',
  };

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
          borderRadius: 12,
          width: 'min(680px, 100%)',
          maxHeight: 'min(84vh, 900px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 32px rgba(8,9,10,0.6)',
        }}
      >
        {/* Header stays put; only the body scrolls, so the question never
            scrolls away from the answer. */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {isSigned ? 'Signed report' : 'Sign this report?'}
          </h2>
          {!isSigned && request?.summaryForSigner ? (
            <p
              title={request.summaryForSigner}
              style={{
                margin: '4px 0 0',
                overflow: 'hidden',
                fontSize: 11.5,
                opacity: 0.55,
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {request.summaryForSigner}
            </p>
          ) : null}
        </div>

        <div style={{ overflowY: 'auto', padding: '12px 20px', flex: 1 }}>
          {[...bySection.entries()].map(([section, rows]) => (
            <section
              key={section}
              style={{ marginBottom: 18 }}
            >
              <h3 style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.55, fontWeight: 500 }}>
                {section}
              </h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {rows.map(sentence => {
                  const isUnsupported = sentence.provenance.length === 0;
                  const isSuggested =
                    sentence.review !== 'accepted' && sentence.review !== 'rejected';
                  return (
                    <li
                      key={sentence.sentenceId}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                        {!isSigned && isUnsupported && !isSuggested ? (
                          <input
                            type="checkbox"
                            aria-label={`Accept uncited sentence: ${sentence.text}`}
                            checked={accepted.has(sentence.sentenceId)}
                            onChange={event =>
                              setAccepted(previous => {
                                const next = new Set(previous);
                                if (event.target.checked) next.add(sentence.sentenceId);
                                else next.delete(sentence.sentenceId);
                                return next;
                              })
                            }
                            style={{ margin: '3px 0 0', flex: 'none' }}
                          />
                        ) : null}
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{sentence.text}</p>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          alignItems: 'center',
                          marginTop: 4,
                          marginLeft: !isSigned && isUnsupported && !isSuggested ? 24 : 0,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11.5,
                            opacity: 0.5,
                          }}
                        >
                          {sentence.author.type === 'agent' ? <AgentMark size={11} /> : null}
                          {sentence.author.type === 'agent' ? 'Agent' : 'You'}
                        </span>
                        {sentence.provenance.map(entry => (
                          <span
                            key={entry.measurementId}
                            style={{
                              fontSize: 11.5,
                              padding: '2px 8px',
                              borderRadius: 4,
                              border: '1px solid rgba(255,255,255,0.18)',
                              opacity: 0.85,
                            }}
                          >
                            {valueOf(entry.measurementId)}
                          </span>
                        ))}
                        {isUnsupported ? (
                          <span style={{ fontSize: 11.5, color: '#d0d6e0' }}>Uncited</span>
                        ) : null}
                        {!isSigned && isSuggested ? (
                          <span
                            style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}
                            aria-label="Review suggested sentence"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                void setSentenceReview(sentence.sentenceId, 'rejected')
                              }
                              style={{
                                minHeight: 40,
                                padding: '0 10px',
                                color: token['ink/low'],
                                background: 'transparent',
                                border: 0,
                                borderRadius: 6,
                                font: 'inherit',
                                fontSize: 11.5,
                                cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void setSentenceReview(sentence.sentenceId, 'accepted')
                              }
                              style={{
                                minHeight: 40,
                                padding: '0 12px',
                                color: token['on/primary'],
                                background: token['action/primary'],
                                border: 0,
                                borderRadius: 6,
                                font: 'inherit',
                                fontSize: 11.5,
                                fontWeight: 510,
                                cursor: 'pointer',
                              }}
                            >
                              Keep
                            </button>
                          </span>
                        ) : !isSigned ? (
                          <span
                            style={{ marginLeft: 'auto', color: token['ink/low'], fontSize: 11.5 }}
                          >
                            Kept
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* Signature and export remain human-only. */}
        {isSigned && signed ? (
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              padding: '14px 22px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 13, fontWeight: 600 }}>Signed by {signed.signer}</strong>
              <span style={{ fontSize: 11.5, opacity: 0.5 }}>
                {new Date(signed.ts).toLocaleString()}
              </span>
            </div>
            {signatureIsStale() ? (
              <p
                style={{
                  margin: '8px 0 0',
                  color: token['review/stale'],
                  fontSize: 12.5,
                }}
              >
                This signature is stale. Both exports will say that the report changed after
                signing.
              </p>
            ) : null}
            <p style={{ margin: '8px 0 0', font: token['text/measure'], opacity: 0.45 }}>
              SHA-256 {signed.hash}
            </p>
            {exportError ? (
              <p
                role="alert"
                style={{ margin: '8px 0 0', fontSize: 12, color: '#fca5a5' }}
              >
                {exportError}
              </p>
            ) : null}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 12,
              }}
            >
              <button
                type="button"
                onClick={() => dismissRequest()}
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
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    setExportError('');
                    exportDicomSr(services);
                  } catch (error) {
                    setExportError(error instanceof Error ? error.message : 'Could not create SR.');
                  }
                }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 6,
                  color: 'inherit',
                  font: 'inherit',
                  fontSize: 13,
                  padding: '8px 14px',
                  cursor: 'pointer',
                }}
              >
                Export DICOM SR
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    setExportError('');
                    exportPdf(services);
                  } catch (error) {
                    setExportError(
                      error instanceof Error ? error.message : 'Could not create PDF.'
                    );
                  }
                }}
                style={{
                  background: token['action/primary'],
                  border: 'none',
                  borderRadius: 6,
                  color: token['on/primary'],
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '8px 16px',
                  cursor: 'pointer',
                }}
              >
                Export PDF
              </button>
            </div>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '12px 20px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={attested}
                onChange={event => setAttested(event.target.checked)}
              />
              <span style={{ opacity: 0.8 }}>{ATTESTATION}</span>
            </label>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <label style={{ display: 'block', flex: 1, fontSize: 11.5, opacity: 0.65 }}>
                Signer
                <input
                  value={signer}
                  onChange={event => setSigner(event.target.value)}
                  placeholder="Dr. Name"
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 4,
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'inherit',
                    font: 'inherit',
                    fontSize: 13,
                  }}
                />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    resolveRequest('declined');
                    dismissRequest();
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
                    sign(signer.trim(), ATTESTATION, [...accepted]);
                    resolveRequest('signed');
                  }}
                  style={{
                    background:
                      blockers.length > 0 ? token['border/hairline'] : token['action/primary'],
                    color: blockers.length > 0 ? token['ink/dim'] : token['on/primary'],
                    border: 'none',
                    borderRadius: 6,
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
            {blockers.length > 0 ? (
              <p
                role="status"
                style={{ margin: '8px 0 0', fontSize: 11.5, color: token['review/unreviewed'] }}
              >
                {unreviewed.length > 0
                  ? `Review ${unreviewed.length} suggested ${unreviewed.length === 1 ? 'sentence' : 'sentences'}.`
                  : unaccepted.length > 0
                    ? `Review ${unaccepted.length} uncited ${unaccepted.length === 1 ? 'sentence' : 'sentences'}.`
                    : blockers[0]}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
