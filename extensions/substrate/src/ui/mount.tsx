import React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { AgentViewportSignature } from './AgentViewportSignature';
import { SignatureModal } from './SignatureModal';

/**
 * Mount the island outside OHIF's React tree.
 *
 * A viewport is a WebGL canvas that OHIF owns and re-lays-out constantly, so
 * anything of ours living inside that tree risks being unmounted by a layout
 * change at exactly the moment the agent is doing something. Its own root on
 * `body` is both simpler and steadier.
 */

const CONTAINER_ID = 'substrate-agent-island';

type MountedIsland = {
  container: HTMLElement;
  root: Root;
  sessionId: number;
};

let mounted: MountedIsland | null = null;

function retireIsland(island: MountedIsland): void {
  // Do not let a later mount find and reuse the container while React still
  // owns it. The deferred cleanup then removes this exact retired node only.
  island.container.removeAttribute('id');
  setTimeout(() => {
    island.root.unmount();
    island.container.remove();
  }, 0);
}

export function mountAgentIsland(services: Record<string, unknown>, sessionId = 0): void {
  if (typeof document === 'undefined') return;
  if (mounted?.sessionId === sessionId) return;
  if (mounted) {
    const previous = mounted;
    mounted = null;
    retireIsland(previous);
  }

  const existing = document.getElementById(CONTAINER_ID);
  existing?.remove();
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root, sessionId };
  root.render(
    <>
      <AgentViewportSignature />
      <SignatureModal services={services} />
    </>
  );
}

export function unmountAgentIsland(sessionId?: number): void {
  if (!mounted || (sessionId !== undefined && mounted.sessionId !== sessionId)) return;
  const current = mounted;
  mounted = null;
  // Unmount on a later task: React refuses to unmount a root synchronously from
  // inside a render or lifecycle, and onModeExit can be called from one.
  retireIsland(current);
}
