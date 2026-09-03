import React, { useEffect, useState } from 'react'

import {
  addReply,
  allVersions,
  changeTemplate,
  currentVersion,
  restoreVersion,
  setSentenceReview,
  subscribeReport,
} from '../engine/report'
import { token } from '../designTokens'
import { AgentMark } from './ThinkingIndicator'

export function ReviewThread({
  services,
}: {
  services: Record<string, unknown>
}): React.ReactElement | null {
  const [, tick] = useState(0)
  const [replyingTo, setReplyingTo] = useState('')
  const [text, setText] = useState('')
  const [showChanges, setShowChanges] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState('')
  useEffect(() => subscribeReport(() => tick(value => value + 1)), [])
  useEffect(() => {
    const openReply = (event: Event) => {
      const sentenceId = (event as CustomEvent<{ sentenceId?: string }>).detail?.sentenceId
      if (!sentenceId) return
      setReplyingTo(sentenceId)
      setText('')
    }
    window.addEventListener('substrate:reply', openReply)
    return () => window.removeEventListener('substrate:reply', openReply)
  }, [])

  const version = currentVersion()
  if (!version) return null
  const versions = allVersions()
  const templates = [...new Set([version.template, 'chest CT, longitudinal', 'general'])]

  const previousText = (sentenceId?: string): string => {
    if (!sentenceId) return ''
    for (const candidate of [...versions].reverse()) {
      const found = candidate.sentences.find(sentence => sentence.sentenceId === sentenceId)
      if (found) return found.text
    }
    return ''
  }

  const grid = services.viewportGridService as
    | { getState?: () => { activeViewportId: string } }
    | undefined
  const measurements = services.measurementService as
    | { jumpToMeasurement?: (viewportId: string, uid: string) => void }
    | undefined
  const show = (measurementId: string) => {
    const viewportId = grid?.getState?.().activeViewportId
    if (viewportId) measurements?.jumpToMeasurement?.(viewportId, measurementId)
  }

  const subtleButton: React.CSSProperties = {
    padding: 0,
    color: '#8a8f98',
    background: 'transparent',
    border: 0,
    font: 'inherit',
    fontSize: 10.5,
    cursor: 'pointer',
  }

  return (
    <section style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, color: '#e5e5e6', fontSize: 12, fontWeight: 510 }}>Report</h2>
        <select
          aria-label="Report template"
          value={version.template}
          onChange={event => void changeTemplate(event.target.value)}
          style={{
            minWidth: 0,
            color: '#8a8f98',
            background: token['surface/room'],
            border: `1px solid ${token['border/hairline']}`,
            borderRadius: 4,
            font: 'inherit',
            fontSize: 10.5,
          }}
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
          type="button"
          aria-pressed={showChanges}
          onClick={() => setShowChanges(value => !value)}
          style={{
            ...subtleButton,
            marginLeft: 'auto',
            color: showChanges ? '#d0d6e0' : '#62666d',
          }}
        >
          Changes
        </button>
        <span style={{ color: '#62666d', font: token['text/measure'] }}>v{version.version}</span>
      </div>

      <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
        {version.sentences.map(sentence => {
          const review = sentence.review ?? 'unreviewed'
          return (
            <li
              key={sentence.sentenceId}
              style={{ padding: '9px 0', borderTop: `1px solid ${token['border/hairline']}` }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#62666d' }}>
                <AgentMark size={10} />
                <span style={{ fontSize: 10.5 }}>Suggested · {sentence.section}</span>
              </div>
              {showChanges && sentence.replacesSentenceId ? (
                <p
                  style={{
                    margin: '4px 0 0',
                    color: '#62666d',
                    fontSize: 11,
                    lineHeight: 1.45,
                    textDecoration: 'line-through',
                  }}
                >
                  {previousText(sentence.replacesSentenceId)}
                </p>
              ) : null}
              <p
                style={{
                  margin: '4px 0 0',
                  color: review === 'rejected' ? '#62666d' : '#d0d6e0',
                  fontSize: 12,
                  lineHeight: 1.45,
                  textDecoration: review === 'rejected' ? 'line-through' : 'none',
                }}
              >
                {sentence.text}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                {sentence.provenance.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => show(sentence.provenance[0].measurementId)}
                    style={subtleButton}
                  >
                    Why ↗
                  </button>
                ) : null}
                <span
                  style={{
                    color:
                      review === 'accepted'
                        ? token['review/accepted']
                        : review === 'rejected'
                          ? token['review/rejected']
                          : token['review/unreviewed'],
                    fontSize: 10.5,
                  }}
                >
                  {review === 'accepted'
                    ? 'Accepted'
                    : review === 'rejected'
                      ? 'Rejected'
                      : 'Unreviewed'}
                </span>
                {review !== 'accepted' ? (
                  <button
                    type="button"
                    onClick={() => void setSentenceReview(sentence.sentenceId, 'accepted')}
                    style={subtleButton}
                  >
                    Accept
                  </button>
                ) : null}
                {review !== 'rejected' ? (
                  <button
                    type="button"
                    onClick={() => void setSentenceReview(sentence.sentenceId, 'rejected')}
                    style={subtleButton}
                  >
                    Reject
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(sentence.sentenceId)
                    setText('')
                  }}
                  style={{ ...subtleButton, marginLeft: 'auto' }}
                >
                  Reply
                </button>
              </div>

              {sentence.replies.map(reply => (
                <div
                  key={reply.replyId}
                  style={{
                    marginTop: 8,
                    paddingLeft: 9,
                    borderLeft: `1px solid ${token['border/hairline']}`,
                  }}
                >
                  <p style={{ margin: 0, color: '#d0d6e0', fontSize: 11.5, lineHeight: 1.45 }}>
                    {reply.text}
                  </p>
                  <span style={{ color: '#62666d', fontSize: 10 }}>
                    You{reply.answeredByPointId ? ' · answered' : ''}
                  </span>
                </div>
              ))}

              {replyingTo === sentence.sentenceId ? (
                <form
                  onSubmit={event => {
                    event.preventDefault()
                    const clean = text.trim()
                    if (!clean) return
                    addReply(sentence.sentenceId, clean, clean.endsWith('?') ? 'question' : 'edit')
                    setReplyingTo('')
                    setText('')
                  }}
                  style={{ display: 'flex', gap: 6, marginTop: 8 }}
                >
                  <input
                    autoFocus
                    aria-label="Reply to report sentence"
                    value={text}
                    onChange={event => setText(event.target.value)}
                    style={{
                      minWidth: 0,
                      flex: 1,
                      padding: '5px 7px',
                      color: '#d0d6e0',
                      background: token['surface/room'],
                      border: `1px solid ${token['border/hairline']}`,
                      borderRadius: 5,
                      outline: 0,
                      font: 'inherit',
                      fontSize: 11,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!text.trim()}
                    style={{
                      padding: '5px 8px',
                      color: text.trim() ? '#08090a' : '#62666d',
                      background: text.trim() ? '#d0d6e0' : '#23252a',
                      border: 0,
                      borderRadius: 5,
                      font: 'inherit',
                      fontSize: 11,
                      cursor: text.trim() ? 'pointer' : 'default',
                    }}
                  >
                    Send
                  </button>
                </form>
              ) : null}
            </li>
          )
        })}
      </ol>

      {versions.length > 1 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingTop: 8,
            borderTop: `1px solid ${token['border/hairline']}`,
          }}
        >
          <select
            aria-label="Version to restore"
            value={restoreTarget}
            onChange={event => setRestoreTarget(event.target.value)}
            style={{
              minWidth: 0,
              flex: 1,
              color: '#8a8f98',
              background: token['surface/room'],
              border: `1px solid ${token['border/hairline']}`,
              borderRadius: 4,
              font: 'inherit',
              fontSize: 10.5,
            }}
          >
            <option value="">Version history</option>
            {versions
              .filter(candidate => candidate.version !== version.version)
              .map(candidate => (
                <option
                  key={candidate.version}
                  value={candidate.version}
                >
                  v{candidate.version} · {candidate.createdBy.type === 'human' ? 'You' : 'Agent'}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!restoreTarget}
            onClick={() => {
              if (restoreTarget) void restoreVersion(Number(restoreTarget))
              setRestoreTarget('')
            }}
            style={{
              ...subtleButton,
              color: restoreTarget ? '#d0d6e0' : '#62666d',
              cursor: restoreTarget ? 'pointer' : 'default',
            }}
          >
            Restore
          </button>
        </div>
      ) : null}
    </section>
  )
}
