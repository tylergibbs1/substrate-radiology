import React, { useEffect, useState } from 'react';

import { token } from '../designTokens';
import {
  addReply,
  allVersions,
  changeTemplate,
  currentVersion,
  restoreVersion,
  setSentenceReview,
  subscribeReport,
} from '../engine/report';

const styles = `
  .substrate-review {
    display: flex;
    flex-direction: column;
    gap: ${token['space/xl']};
    padding: ${token['space/xl']} ${token['space/base']};
    color: ${token['ink/high']};
    font: ${token['text/ui']};
    font-weight: 400;
  }

  .substrate-review *,
  .substrate-review *::before,
  .substrate-review *::after {
    box-sizing: border-box;
  }

  .substrate-review__header,
  .substrate-review__actions,
  .substrate-review__reply-form,
  .substrate-review__history {
    display: flex;
    align-items: center;
    gap: ${token['space/sm']};
  }

  .substrate-review__header {
    flex-wrap: wrap;
  }

  .substrate-review__title {
    margin: 0;
    font: ${token['text/ui']};
    font-weight: 400;
  }

  .substrate-review__version {
    flex: none;
    color: ${token['ink/low']};
    font: ${token['text/measure']};
    font-variant-numeric: tabular-nums;
    letter-spacing: ${token['tracking/data']};
  }

  .substrate-review__sentences {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .substrate-review__sentence {
    display: flex;
    flex-direction: column;
    gap: ${token['space/md']};
    padding: ${token['space/lg']} 0;
    border-top: 1px solid ${token['border/hairline']};
  }

  .substrate-review__attribution {
    display: flex;
    align-items: center;
    gap: ${token['space/sm']};
    min-height: 16px;
    color: ${token['ink/low']};
    font: ${token['text/ui']};
  }

  .substrate-review__lamp {
    position: relative;
    width: ${token['agent/lamp-size']};
    height: ${token['agent/lamp-size']};
    padding: 0;
    flex: none;
    border: 1px solid ${token['agent/stroke']};
    border-radius: ${token['radius/full']};
    background: transparent;
  }

  button.substrate-review__lamp {
    cursor: pointer;
  }

  button.substrate-review__lamp:focus-visible {
    outline: 1px solid ${token['ink/high']};
    outline-offset: 4px;
  }

  .substrate-review__lamp--supported {
    background: ${token['agent/mark']};
  }

  .substrate-review__previous,
  .substrate-review__text,
  .substrate-review__reply-text,
  .substrate-review__reply-author {
    margin: 0;
    font-weight: 400;
  }

  .substrate-review__previous {
    color: ${token['ink/low']};
    font: ${token['text/ui']};
    text-decoration: line-through;
  }

  .substrate-review__text {
    color: ${token['ink/high']};
    font: ${token['text/ui']};
  }

  .substrate-review__text--rejected {
    color: ${token['ink/low']};
    text-decoration: line-through;
  }

  .substrate-review__actions {
    min-width: 0;
    flex-wrap: wrap;
  }

  .substrate-review__review-state {
    color: ${token['ink/low']};
    font: ${token['text/ui']};
  }

  .substrate-review__review-state--rejected {
    color: ${token['ink/low']};
  }

  .substrate-review__citation,
  .substrate-review__button,
  .substrate-review__select {
    min-height: ${token['hit/target']};
    border-radius: ${token['radius/inner']};
    font-weight: 400;
    transition: color ${token['motion/enter']}ms ease,
      border-color ${token['motion/enter']}ms ease,
      background-color ${token['motion/enter']}ms ease,
      transform 80ms ease;
  }

  .substrate-review__button,
  .substrate-review__citation {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 7px ${token['space/md']};
    color: ${token['ink/high']};
    background: transparent;
    border: 1px solid ${token['border/hairline']};
    font: ${token['text/ui']};
    cursor: pointer;
  }

  .substrate-review__button:hover,
  .substrate-review__citation:hover {
    border-color: ${token['ink/low']};
  }

  .substrate-review__button:active,
  .substrate-review__citation:active,
  .substrate-review__select:active {
    transform: scale(0.96);
  }

  .substrate-review__button:focus-visible,
  .substrate-review__citation:focus-visible,
  .substrate-review__select:focus-visible,
  .substrate-review__reply-input:focus-visible {
    outline: 1px solid ${token['ink/high']};
    outline-offset: 2px;
  }

  .substrate-review__button--quiet {
    margin-left: auto;
    border-color: transparent;
    color: ${token['ink/low']};
  }

  .substrate-review__button--quiet[aria-pressed='false'] {
    color: ${token['on/disabled']};
  }

  .substrate-review__button:disabled {
    color: ${token['on/disabled']};
    background: ${token['action/disabled']};
    border-color: ${token['action/disabled']};
    cursor: default;
  }

  .substrate-review__button--primary {
    color: ${token['on/primary']};
    background: ${token['action/primary']};
    border-color: ${token['action/primary']};
    padding-inline: ${token['space/lg']};
  }

  .substrate-review__button--primary:hover {
    background: ${token['action/primary-hover']};
    border-color: ${token['action/primary-hover']};
  }

  .substrate-review__citation {
    max-width: 100%;
    overflow: hidden;
    color: ${token['ink/low']};
    border-color: transparent;
    border-bottom-color: ${token['border/hairline']};
    border-radius: 0;
    font: ${token['text/measure']};
    font-variant-numeric: tabular-nums;
    letter-spacing: ${token['tracking/data']};
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .substrate-review__select {
    min-width: 0;
    max-width: 100%;
    padding: 7px 32px 7px ${token['space/md']};
    color: ${token['ink/low']};
    background-color: transparent;
    border: 1px solid ${token['border/hairline']};
    font: ${token['text/ui']};
    cursor: pointer;
  }

  .substrate-review__select:hover {
    border-color: ${token['ink/low']};
  }

  .substrate-review__replies {
    display: flex;
    flex-direction: column;
    gap: ${token['space/md']};
    padding-top: ${token['space/md']};
    border-top: 1px solid ${token['border/hairline']};
  }

  .substrate-review__reply {
    display: flex;
    flex-direction: column;
    gap: ${token['space/xs']};
  }

  .substrate-review__reply-text {
    color: ${token['ink/high']};
    font: ${token['text/ui']};
  }

  .substrate-review__reply-author {
    color: ${token['ink/low']};
    font: ${token['text/ui']};
  }

  .substrate-review__reply-form {
    align-items: flex-end;
  }

  .substrate-review__reply-input {
    min-width: 0;
    min-height: ${token['hit/target']};
    flex: 1;
    padding: 8px 0 7px;
    color: ${token['ink/high']};
    background: transparent;
    border: 0;
    border-bottom: 1px solid ${token['border/hairline']};
    border-radius: 0;
    outline: 0;
    font: ${token['text/ui']};
    font-weight: 400;
    transition: border-color ${token['motion/enter']}ms ease;
  }

  .substrate-review__reply-input:focus {
    border-bottom-color: ${token['ink/low']};
  }

  .substrate-review__history {
    padding-top: ${token['space/base']};
    border-top: 1px solid ${token['border/hairline']};
  }

  .substrate-review__history .substrate-review__select {
    flex: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .substrate-review__citation,
    .substrate-review__button,
    .substrate-review__select,
    .substrate-review__reply-input {
      transition-duration: 0.01ms;
    }

    .substrate-review__button:active,
    .substrate-review__citation:active,
    .substrate-review__select:active {
      transform: none;
    }
  }
`;

export function ReviewThread({
  services,
}: {
  services: Record<string, unknown>;
}): React.ReactElement | null {
  const [, tick] = useState(0);
  const [replyingTo, setReplyingTo] = useState('');
  const [text, setText] = useState('');
  const [showChanges, setShowChanges] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState('');

  useEffect(() => subscribeReport(() => tick(value => value + 1)), []);
  useEffect(() => {
    const openReply = (event: Event) => {
      const sentenceId = (event as CustomEvent<{ sentenceId?: string }>).detail?.sentenceId;
      if (!sentenceId) return;
      setReplyingTo(sentenceId);
      setText('');
    };
    window.addEventListener('substrate:reply', openReply);
    return () => window.removeEventListener('substrate:reply', openReply);
  }, []);

  const version = currentVersion();
  if (!version) return null;
  const versions = allVersions();
  const templates = [...new Set([version.template, 'chest CT, longitudinal', 'general'])];

  const previousText = (sentenceId?: string): string => {
    if (!sentenceId) return '';
    for (const candidate of [...versions].reverse()) {
      const found = candidate.sentences.find(sentence => sentence.sentenceId === sentenceId);
      if (found) return found.text;
    }
    return '';
  };

  const grid = services.viewportGridService as
    | { getState?: () => { activeViewportId: string } }
    | undefined;
  const measurements = services.measurementService as
    | { jumpToMeasurement?: (viewportId: string, uid: string) => void }
    | undefined;
  const show = (measurementId: string) => {
    const viewportId = grid?.getState?.().activeViewportId;
    if (viewportId) measurements?.jumpToMeasurement?.(viewportId, measurementId);
  };

  return (
    <section
      className="substrate-review"
      aria-labelledby="substrate-review-title"
    >
      <style>{styles}</style>
      <div className="substrate-review__header">
        <h2
          id="substrate-review-title"
          className="substrate-review__title"
        >
          Report
        </h2>
        <select
          className="substrate-review__select"
          aria-label="Report template"
          value={version.template}
          onChange={event => void changeTemplate(event.target.value)}
        >
          {templates.map(template => (
            <option
              key={template}
              value={template}
            >
              {template}
            </option>
          ))}
        </select>
        <button
          className="substrate-review__button substrate-review__button--quiet"
          type="button"
          aria-pressed={showChanges}
          onClick={() => setShowChanges(value => !value)}
        >
          Changes
        </button>
        <span className="substrate-review__version">v{version.version}</span>
      </div>

      <ol className="substrate-review__sentences">
        {version.sentences.map(sentence => {
          const review = sentence.review ?? 'unreviewed';
          const supported = sentence.provenance.length > 0;
          return (
            <li
              key={sentence.sentenceId}
              className="substrate-review__sentence"
            >
              <div className="substrate-review__attribution">
                {sentence.author.type === 'agent' ? (
                  <>
                    {supported ? (
                      <button
                        className="substrate-review__lamp substrate-review__lamp--supported substrate-touch-hitbox"
                        type="button"
                        aria-label="Jump to cited measurement"
                        title="Jump to cited measurement"
                        onClick={() => show(sentence.provenance[0].measurementId)}
                      />
                    ) : (
                      <span
                        className="substrate-review__lamp"
                        aria-hidden="true"
                      />
                    )}
                    <span className="sr-only">
                      {supported
                        ? 'Suggested with measurement support'
                        : 'Suggested without measurement support'}
                    </span>
                  </>
                ) : (
                  <span>You ·</span>
                )}
                <span>{sentence.section}</span>
              </div>

              {showChanges && sentence.replacesSentenceId ? (
                <p className="substrate-review__previous">
                  {previousText(sentence.replacesSentenceId)}
                </p>
              ) : null}

              <p
                className={`substrate-review__text${review === 'rejected' ? 'substrate-review__text--rejected' : ''}`}
              >
                {sentence.text}
              </p>

              <div className="substrate-review__actions">
                {supported ? (
                  <button
                    className="substrate-review__citation"
                    type="button"
                    aria-label="Jump to cited measurement"
                    title={sentence.provenance[0].measurementId}
                    onClick={() => show(sentence.provenance[0].measurementId)}
                  >
                    Measurement ↗
                  </button>
                ) : null}
                <span
                  className={`substrate-review__review-state${review === 'rejected' ? 'substrate-review__review-state--rejected' : ''}`}
                >
                  {review === 'accepted'
                    ? 'Accepted'
                    : review === 'rejected'
                      ? 'Rejected'
                      : 'Unreviewed'}
                </span>
                {review !== 'accepted' ? (
                  <button
                    className="substrate-review__button"
                    type="button"
                    onClick={() => void setSentenceReview(sentence.sentenceId, 'accepted')}
                  >
                    Accept
                  </button>
                ) : null}
                {review !== 'rejected' ? (
                  <button
                    className="substrate-review__button"
                    type="button"
                    onClick={() => void setSentenceReview(sentence.sentenceId, 'rejected')}
                  >
                    Reject
                  </button>
                ) : null}
                <button
                  className="substrate-review__button substrate-review__button--quiet"
                  type="button"
                  onClick={() => {
                    setReplyingTo(sentence.sentenceId);
                    setText('');
                  }}
                >
                  Reply
                </button>
              </div>

              {sentence.replies.length > 0 ? (
                <div className="substrate-review__replies">
                  {sentence.replies.map(reply => (
                    <div
                      key={reply.replyId}
                      className="substrate-review__reply"
                    >
                      <p className="substrate-review__reply-text">{reply.text}</p>
                      <p className="substrate-review__reply-author">
                        You{reply.answeredByPointId ? ' · answered' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {replyingTo === sentence.sentenceId ? (
                <form
                  className="substrate-review__reply-form"
                  onSubmit={event => {
                    event.preventDefault();
                    const clean = text.trim();
                    if (!clean) return;
                    addReply(sentence.sentenceId, clean, clean.endsWith('?') ? 'question' : 'edit');
                    setReplyingTo('');
                    setText('');
                  }}
                >
                  <input
                    className="substrate-review__reply-input"
                    autoFocus
                    aria-label="Reply to report sentence"
                    value={text}
                    onChange={event => setText(event.target.value)}
                  />
                  <button
                    className="substrate-review__button substrate-review__button--primary"
                    type="submit"
                    disabled={!text.trim()}
                  >
                    Send
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ol>

      {versions.length > 1 ? (
        <div className="substrate-review__history">
          <select
            className="substrate-review__select"
            aria-label="Version to restore"
            value={restoreTarget}
            onChange={event => setRestoreTarget(event.target.value)}
          >
            <option value="">Version history</option>
            {versions
              .filter(candidate => candidate.version !== version.version)
              .map(candidate => (
                <option
                  key={candidate.version}
                  value={candidate.version}
                >
                  v{candidate.version} ·{' '}
                  {candidate.createdBy.type === 'human' ? 'You' : 'Suggested'}
                </option>
              ))}
          </select>
          <button
            className="substrate-review__button"
            type="button"
            disabled={!restoreTarget}
            onClick={() => {
              if (restoreTarget) void restoreVersion(Number(restoreTarget));
              setRestoreTarget('');
            }}
          >
            Restore
          </button>
        </div>
      ) : null}
    </section>
  );
}
