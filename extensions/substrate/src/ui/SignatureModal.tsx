import React, { useEffect, useMemo, useRef, useState } from 'react';

import { token } from '../designTokens';
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

/** The exact report packet and the only identity that can sign it: the reader's. */
const ATTESTATION = 'I reviewed this report and take responsibility for it.';

type Props = { services: Record<string, unknown> };
type Measurement = { label: string; value: string };
type MeasurementService = {
  getMeasurement?: (
    uid: string
  ) => { label?: string; displayText?: string | { primary?: string[] } } | undefined;
  jumpToMeasurement?: (viewportId: string, uid: string) => void;
};
type ViewportGridService = {
  getState?: () => { activeViewportId?: string };
};

function AgentLamp({ supported }: { supported: boolean }): React.ReactElement {
  return (
    <span
      className={supported ? 'substrate-signature-lamp' : 'substrate-signature-lamp is-hollow'}
      aria-label={
        supported ? 'Suggested with measurement evidence' : 'Suggested without measurement evidence'
      }
      role="img"
    />
  );
}

export function SignatureModal({ services }: Props): React.ReactElement | null {
  const [, tick] = useState(0);
  const [signer, setSigner] = useState('');
  const [acceptedUnsupported, setAcceptedUnsupported] = useState<Set<string>>(new Set());
  const [exportError, setExportError] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);
  const signerRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeReport(() => tick(value => value + 1)), []);

  const request = pendingRequest();
  const version = currentVersion();
  const signed = signature();
  const isSigned = request?.status === 'signed' && signed !== null;
  const open = (request?.status === 'pending' || isSigned) && version !== null;

  useEffect(() => {
    setSigner('');
    setAcceptedUnsupported(new Set());
    setExportError('');
  }, [request?.requestId]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      (isSigned ? closeRef.current : signerRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      previous?.focus();
    };
  }, [isSigned, open]);

  // Escape answers a pending request; Tab never leaves the signing sheet.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!isSigned) resolveRequest('declined');
        dismissRequest();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSigned, open]);

  const unsupported = useMemo(
    () =>
      (version?.sentences ?? []).filter(
        sentence => sentence.review !== 'rejected' && sentence.provenance.length === 0
      ),
    [version]
  );

  if (!open || !version) return null;

  const activeSentences = version.sentences.filter(sentence => sentence.review !== 'rejected');
  const unreviewed = activeSentences.filter(sentence => sentence.review !== 'accepted');
  const unaccepted = unsupported.filter(sentence => !acceptedUnsupported.has(sentence.sentenceId));
  const canSign = Boolean(signer.trim()) && unreviewed.length === 0 && unaccepted.length === 0;

  const measurementService = services.measurementService as MeasurementService | undefined;
  const viewportGridService = services.viewportGridService as ViewportGridService | undefined;

  const measurementOf = (measurementId: string): Measurement => {
    const found = measurementService?.getMeasurement?.(measurementId);
    const display = found?.displayText;
    const value =
      typeof display === 'string'
        ? display
        : Array.isArray(display?.primary)
          ? display.primary.join(' ')
          : 'Value unavailable';
    return { label: found?.label || measurementId, value };
  };

  const showMeasurement = (measurementId: string) => {
    const viewportId = viewportGridService?.getState?.().activeViewportId;
    if (viewportId) measurementService?.jumpToMeasurement?.(viewportId, measurementId);
  };

  const measurementIds = [
    ...new Set(
      activeSentences.flatMap(sentence => sentence.provenance.map(item => item.measurementId))
    ),
  ];
  const sections = [...new Set(version.sentences.map(sentence => sentence.section))];
  const reportSentences = (section: string): Sentence[] =>
    version.sentences.filter(
      sentence => sentence.section === section && (!isSigned || sentence.review !== 'rejected')
    );

  const leaveOut = (sentence: Sentence) => {
    setAcceptedUnsupported(previous => {
      const next = new Set(previous);
      next.delete(sentence.sentenceId);
      return next;
    });
    void setSentenceReview(sentence.sentenceId, 'rejected');
  };

  const toggleUnsupported = (sentenceId: string) => {
    setAcceptedUnsupported(previous => {
      const next = new Set(previous);
      if (next.has(sentenceId)) next.delete(sentenceId);
      else next.add(sentenceId);
      return next;
    });
  };

  const exportWith = (format: 'sr' | 'pdf') => {
    try {
      setExportError('');
      if (format === 'sr') exportDicomSr(services);
      else exportPdf(services);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : format === 'sr'
            ? 'Could not create SR.'
            : 'Could not create PDF.'
      );
    }
  };

  return (
    <div
      className="substrate-signature-room"
      data-substrate-system={token['system/plate']}
    >
      <style>{signatureCss}</style>
      <div
        ref={sheetRef}
        className="substrate-signature-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="substrate-signature-title"
      >
        <h1
          id="substrate-signature-title"
          className="substrate-signature-visually-hidden"
        >
          {isSigned ? 'Signed report' : 'Sign the report'}
        </h1>

        {isSigned && signed ? (
          <div className="substrate-signature-receipt">
            <p className="substrate-signature-attestation">
              {ATTESTATION} <span className="substrate-signature-name-set">{signed.signer}</span>
            </p>
            <div className="substrate-signature-meta">
              <span>{new Date(signed.ts).toLocaleString()}</span>
              <span>SHA-256 {signed.hash}</span>
            </div>
            {signatureIsStale() ? (
              <p
                className="substrate-signature-error"
                role="alert"
              >
                The report changed after signing. Both exports will be marked stale.
              </p>
            ) : null}
            {exportError ? (
              <p
                className="substrate-signature-error"
                role="alert"
              >
                {exportError}
              </p>
            ) : null}
            <div className="substrate-signature-actions">
              <button
                ref={closeRef}
                type="button"
                className="substrate-signature-ghost"
                onClick={() => dismissRequest()}
              >
                Close
              </button>
              <span className="substrate-signature-action-space" />
              <button
                type="button"
                className="substrate-signature-ghost"
                onClick={() => exportWith('sr')}
              >
                Save SR
              </button>
              <button
                type="button"
                className="substrate-signature-ghost"
                onClick={() => exportWith('pdf')}
              >
                Save PDF
              </button>
            </div>
          </div>
        ) : (
          <>
            {measurementIds.length > 0 ? (
              <table
                className="substrate-signature-evidence"
                aria-label="Measurement evidence"
              >
                <tbody>
                  {measurementIds.map(measurementId => {
                    const measurement = measurementOf(measurementId);
                    return (
                      <tr key={measurementId}>
                        <td>{measurement.label}</td>
                        <td>{measurement.value}</td>
                        <td>
                          <button
                            type="button"
                            className="substrate-signature-citation"
                            onClick={() => showMeasurement(measurementId)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}

            <div className="substrate-signature-report">
              {sections.map(section => (
                <section
                  className="substrate-signature-section"
                  key={section}
                >
                  <h2>{section}</h2>
                  <div className="substrate-signature-lines">
                    {reportSentences(section).map(sentence => {
                      const rejected = sentence.review === 'rejected';
                      const suggested = sentence.review !== 'accepted' && !rejected;
                      const unsupportedSentence = sentence.provenance.length === 0;
                      const unsupportedAccepted = acceptedUnsupported.has(sentence.sentenceId);
                      return (
                        <article
                          className={
                            rejected
                              ? 'substrate-signature-line is-out'
                              : 'substrate-signature-line'
                          }
                          key={sentence.sentenceId}
                        >
                          <p className="substrate-signature-sentence">{sentence.text}</p>
                          <div className="substrate-signature-source">
                            {sentence.author.type === 'agent' ? (
                              <AgentLamp supported={!unsupportedSentence} />
                            ) : null}
                            {sentence.provenance.map(entry => {
                              const measurement = measurementOf(entry.measurementId);
                              return (
                                <button
                                  type="button"
                                  className="substrate-signature-citation"
                                  key={entry.measurementId}
                                  onClick={() => showMeasurement(entry.measurementId)}
                                >
                                  {measurement.label}, {measurement.value}
                                </button>
                              );
                            })}
                            {!rejected && unsupportedSentence && sentence.review === 'accepted' ? (
                              <button
                                type="button"
                                className={
                                  unsupportedAccepted
                                    ? 'substrate-signature-source-action is-selected'
                                    : 'substrate-signature-source-action'
                                }
                                aria-pressed={unsupportedAccepted}
                                onClick={() => toggleUnsupported(sentence.sentenceId)}
                              >
                                {unsupportedAccepted
                                  ? 'Accepted without measurement'
                                  : 'Accept without measurement'}
                              </button>
                            ) : null}
                          </div>
                          <div className="substrate-signature-review">
                            {rejected ? (
                              <button
                                type="button"
                                className="substrate-signature-quiet"
                                onClick={() =>
                                  void setSentenceReview(sentence.sentenceId, 'unreviewed')
                                }
                              >
                                Put back
                              </button>
                            ) : (
                              <>
                                {suggested ? (
                                  <button
                                    type="button"
                                    className="substrate-signature-quiet"
                                    onClick={() =>
                                      void setSentenceReview(sentence.sentenceId, 'accepted')
                                    }
                                  >
                                    Keep
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="substrate-signature-quiet"
                                  onClick={() => leaveOut(sentence)}
                                >
                                  Leave out
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="substrate-signature-close">
              <p className="substrate-signature-attestation">{ATTESTATION}</p>
              <label className="substrate-signature-identity">
                <span>Your name</span>
                <input
                  ref={signerRef}
                  className="substrate-signature-name"
                  value={signer}
                  onChange={event => setSigner(event.target.value)}
                  placeholder="your name"
                  aria-label="Your name"
                  autoComplete="name"
                />
              </label>
              <p
                className="substrate-signature-consequence"
                aria-live="polite"
              >
                {unreviewed.length > 0
                  ? `${unreviewed.length} suggested ${unreviewed.length === 1 ? 'sentence needs' : 'sentences need'} review.`
                  : unaccepted.length > 0
                    ? `${unaccepted.length} ${unaccepted.length === 1 ? 'sentence has' : 'sentences have'} no measurement behind ${unaccepted.length === 1 ? 'it' : 'them'}.`
                    : `${activeSentences.length} ${activeSentences.length === 1 ? 'statement' : 'statements'} will be signed.`}
              </p>
              <div className="substrate-signature-actions">
                <button
                  type="button"
                  className="substrate-signature-ghost"
                  onClick={() => {
                    resolveRequest('declined');
                    dismissRequest();
                  }}
                >
                  Not now
                </button>
                <span className="substrate-signature-action-space" />
                <button
                  type="button"
                  className="substrate-signature-primary"
                  disabled={!canSign}
                  onClick={() => {
                    sign(signer.trim(), ATTESTATION, [...acceptedUnsupported]);
                    resolveRequest('signed');
                  }}
                >
                  Sign
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const signatureCss = `
.substrate-signature-room {
  position: fixed; inset: 0; z-index: 1100;
  display: flex; align-items: center; justify-content: center;
  padding: ${token['space/xl']}; overflow: auto;
  background: rgba(0,0,0,.72); color: ${token['ink/high']};
  font: ${token['text/body']}; letter-spacing: ${token['tracking/body']};
  -webkit-font-smoothing: antialiased;
}
.substrate-signature-room * { box-sizing: border-box; }
.substrate-signature-room button,
.substrate-signature-room input { font-weight: 400; }
.substrate-signature-room button { cursor: pointer; }
.substrate-signature-room :focus-visible {
  outline: 1px solid ${token['ink/low']}; outline-offset: 2px;
}
.substrate-signature-sheet {
  width: 100%; max-width: 720px; min-width: 0;
  max-height: calc(100vh - 48px);
  padding: ${token['space/card']}; overflow-x: hidden; overflow-y: auto;
  border: 0; border-radius: ${token['radius/outer']};
  background: ${token['surface/panel']};
}
.substrate-signature-visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0;
  overflow: hidden; clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}
.substrate-signature-report,
.substrate-signature-section,
.substrate-signature-lines,
.substrate-signature-receipt {
  display: flex; flex-direction: column;
}
.substrate-signature-report { gap: ${token['space/card']}; }
.substrate-signature-section { gap: ${token['space/xs']}; }
.substrate-signature-section > h2 {
  margin: 0; color: ${token['ink/high']};
  font: ${token['text/headline']}; font-weight: 400;
  letter-spacing: ${token['tracking/headline']};
}
.substrate-signature-lines { gap: 0; }
.substrate-signature-line {
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  column-gap: ${token['space/md']}; min-width: 0;
  padding: ${token['space/md']} 0;
  border-bottom: 1px solid ${token['border/hairline']};
}
.substrate-signature-line:last-child { border-bottom: 0; }
.substrate-signature-sentence {
  grid-column: 1; min-width: 0; overflow-wrap: anywhere;
  margin: 0; color: ${token['ink/high']};
  font: ${token['text/body']}; letter-spacing: ${token['tracking/body']};
}
.substrate-signature-source {
  grid-column: 1;
  display: flex; min-height: ${token['hit/target']}; align-items: center;
  gap: ${token['space/sm']}; flex-wrap: wrap;
}
.substrate-signature-lamp {
  width: ${token['agent/lamp-size']}; height: ${token['agent/lamp-size']};
  flex: none; border-radius: ${token['radius/full']};
  background: ${token['agent/mark']};
}
.substrate-signature-lamp.is-hollow {
  border: 1px solid ${token['agent/stroke']}; background: transparent;
}
.substrate-signature-citation,
.substrate-signature-quiet,
.substrate-signature-source-action,
.substrate-signature-ghost,
.substrate-signature-primary {
  min-height: ${token['hit/target']}; border-radius: ${token['radius/inner']};
  font: ${token['text/ui']};
}
.substrate-signature-citation {
  padding: 0; border: 0; border-radius: 0; background: transparent;
  color: ${token['ink/low']}; font: ${token['text/measure']};
  letter-spacing: ${token['tracking/data']}; text-decoration: underline;
  text-decoration-color: ${token['border/hairline']}; text-underline-offset: 3px;
}
.substrate-signature-citation:hover { color: ${token['ink/high']}; }
.substrate-signature-review {
  grid-column: 2; grid-row: 1 / span 2;
  display: flex; align-items: start; gap: ${token['space/xs']};
}
.substrate-signature-quiet {
  padding: 0 ${token['space/sm']}; border: 0; background: transparent;
  color: ${token['ink/low']};
}
.substrate-signature-source-action {
  padding: 0 ${token['space/sm']};
  border: 1px solid ${token['border/hairline']};
  background: transparent; color: ${token['ink/low']};
}
.substrate-signature-source-action:hover,
.substrate-signature-source-action.is-selected {
  border-color: ${token['ink/low']}; color: ${token['ink/high']};
}
.substrate-signature-quiet:hover { color: ${token['ink/high']}; }
.substrate-signature-line.is-out .substrate-signature-sentence {
  color: ${token['ink/low']}; text-decoration: line-through;
}
.substrate-signature-line.is-out .substrate-signature-source { opacity: .5; }
.substrate-signature-evidence {
  width: 100%; margin: 0 0 ${token['space/card']};
  border-collapse: collapse; table-layout: fixed;
  color: ${token['ink/low']}; font: ${token['text/measure']};
  font-variant-numeric: tabular-nums; letter-spacing: ${token['tracking/data']};
}
.substrate-signature-evidence td {
  padding: 0; border-bottom: 1px solid ${token['border/hairline']};
  vertical-align: baseline;
}
.substrate-signature-evidence td:first-child {
  width: 38%; color: ${token['ink/high']}; text-align: left;
}
.substrate-signature-evidence td:nth-child(2) { width: 44%; text-align: right; }
.substrate-signature-evidence td:last-child { width: 18%; text-align: right; }
.substrate-signature-close {
  display: flex; flex-direction: column; gap: ${token['space/base']};
  margin-top: ${token['space/section']}; padding-top: ${token['space/xl']};
  border-top: 1px solid ${token['border/hairline']};
}
.substrate-signature-name {
  width: 100%; min-width: 0; min-height: ${token['hit/target']};
  padding: 0; border: 0;
  border-bottom: 1px solid ${token['border/hairline']};
  border-radius: 0; background: transparent; color: ${token['ink/high']};
  font: ${token['text/body-large']};
  letter-spacing: ${token['tracking/body-large']};
}
.substrate-signature-identity {
  display: grid; grid-template-columns: 88px minmax(0, 1fr);
  align-items: center; gap: ${token['space/md']}; min-width: 0;
  color: ${token['ink/low']}; font: ${token['text/body-small']};
  letter-spacing: ${token['tracking/body-small']};
}
.substrate-signature-name::placeholder { color: ${token['on/disabled']}; }
.substrate-signature-name:focus {
  border-bottom-color: ${token['ink/low']}; outline: 0;
}
.substrate-signature-consequence {
  margin: 0; color: ${token['ink/low']};
  font: ${token['text/body-small']};
  letter-spacing: ${token['tracking/body-small']};
}
.substrate-signature-actions {
  display: flex; align-items: center; gap: ${token['space/sm']};
}
.substrate-signature-action-space { flex: 1; }
.substrate-signature-ghost,
.substrate-signature-primary { padding: 7px ${token['space/md']}; }
.substrate-signature-ghost {
  border: 1px solid ${token['border/hairline']};
  background: transparent; color: ${token['ink/high']};
}
.substrate-signature-ghost:hover { border-color: ${token['ink/low']}; }
.substrate-signature-primary {
  padding: 9px ${token['space/lg']}; border: 0;
  background: ${token['action/primary']}; color: ${token['on/primary']};
}
.substrate-signature-primary:disabled {
  background: ${token['action/disabled']}; color: ${token['on/disabled']};
  cursor: not-allowed;
}
.substrate-signature-receipt { gap: ${token['space/md']}; }
.substrate-signature-attestation {
  margin: 0; color: ${token['ink/high']};
  font: ${token['text/body-large']};
  letter-spacing: ${token['tracking/body-large']};
}
.substrate-signature-name-set { border-bottom: 1px solid ${token['border/hairline']}; }
.substrate-signature-meta {
  display: flex; flex-direction: column; gap: ${token['space/sm']};
  color: ${token['ink/low']}; font: ${token['text/measure']};
  font-variant-numeric: tabular-nums; letter-spacing: ${token['tracking/data']};
  overflow-wrap: anywhere;
}
.substrate-signature-error {
  margin: 0; color: ${token['status/error']};
  font: ${token['text/body-small']};
  letter-spacing: ${token['tracking/body-small']};
}
@media (max-width: 640px) {
  .substrate-signature-room { align-items: stretch; padding: ${token['space/md']}; }
  .substrate-signature-sheet { max-height: calc(100vh - 24px); padding: ${token['space/xl']}; }
  .substrate-signature-line { grid-template-columns: minmax(0, 1fr); }
  .substrate-signature-review { grid-column: 1; grid-row: auto; justify-content: flex-start; }
}
.substrate-signature-room button:active:not(:disabled) { transform: scale(.96); }
@media (prefers-reduced-motion: no-preference) {
  .substrate-signature-room button {
    transition: transform ${token['motion/enter']}ms ease-out;
  }
}
@media (prefers-reduced-motion: reduce) {
  .substrate-signature-room button { transition: none; }
}
`;
