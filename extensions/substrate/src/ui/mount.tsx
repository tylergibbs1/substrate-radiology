import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { AgentIsland } from './AgentIsland'
import { AgentViewportSignature } from './AgentViewportSignature'
import { SignatureModal } from './SignatureModal'

/**
 * Mount the island outside OHIF's React tree.
 *
 * A viewport is a WebGL canvas that OHIF owns and re-lays-out constantly, so
 * anything of ours living inside that tree risks being unmounted by a layout
 * change at exactly the moment the agent is doing something. Its own root on
 * `body` is both simpler and steadier.
 */

const CONTAINER_ID = 'substrate-agent-island'

let root: Root | null = null

export function mountAgentIsland(services: Record<string, unknown>): void {
  if (typeof document === 'undefined' || root) return
  let container = document.getElementById(CONTAINER_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = CONTAINER_ID
    document.body.appendChild(container)
  }
  root = createRoot(container)
  root.render(
    <>
      <AgentViewportSignature />
      <AgentIsland services={services} />
      <SignatureModal services={services} />
    </>
  )
}

export function unmountAgentIsland(): void {
  if (!root) return
  const current = root
  root = null
  // Unmount on a later task: React refuses to unmount a root synchronously from
  // inside a render or lifecycle, and onModeExit can be called from one.
  setTimeout(() => {
    current.unmount()
    document.getElementById(CONTAINER_ID)?.remove()
  }, 0)
}
