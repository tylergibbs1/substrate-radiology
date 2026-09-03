import React, { forwardRef, useEffect, useState, type HTMLAttributes } from 'react'

import { token } from '../designTokens'

const CIRCLE =
  'M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z'
const LOOP = token['agent/mark']
const WORDS = ['Working', 'Planning', 'Refining']

type Size = 'default' | 'compact'

export interface ThinkingIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  size?: Size
  showIcon?: boolean
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  return reduced
}

export function AgentMark({ size = 14 }: { size?: number }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flex: 'none' }}
    >
      <path d={LOOP} />
    </svg>
  )
}

export const ThinkingIndicator = forwardRef<HTMLDivElement, ThinkingIndicatorProps>(
  ({ size = 'default', showIcon = true, style, ...props }, ref) => {
    const reducedMotion = useReducedMotion()
    const [index, setIndex] = useState(0)
    const compact = size === 'compact'

    useEffect(() => {
      if (reducedMotion) return
      const interval = window.setInterval(() => {
        setIndex(current => (current + 1) % WORDS.length)
      }, 2400)
      return () => window.clearInterval(interval)
    }, [reducedMotion])

    return (
      <div
        ref={ref}
        role="status"
        aria-label="Working"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 6 : 8,
          color: 'inherit',
          fontSize: compact ? 12 : 13,
          whiteSpace: 'nowrap',
          ...style,
        }}
        {...props}
      >
        {showIcon ? (
          <svg
            aria-hidden="true"
            width={compact ? 16 : 18}
            height={compact ? 16 : 18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'block', flex: 'none' }}
          >
            <path d={reducedMotion ? LOOP : CIRCLE}>
              {!reducedMotion ? (
                <animate
                  attributeName="d"
                  values={`${CIRCLE};${LOOP};${CIRCLE}`}
                  dur="3s"
                  repeatCount="indefinite"
                />
              ) : null}
            </path>
          </svg>
        ) : null}
        <span aria-hidden="true">{reducedMotion ? WORDS[0] : WORDS[index]}</span>
      </div>
    )
  }
)

ThinkingIndicator.displayName = 'ThinkingIndicator'
