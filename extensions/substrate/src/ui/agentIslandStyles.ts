import type { CSSProperties } from 'react';

import { token, type SurfaceElevation } from '../designTokens';

export function surfaceStyle(elevation: SurfaceElevation): CSSProperties {
  return {
    background: token['surface/panel'],
    color: token['ink/mid'],
    font: token['text/ui'],
    borderRadius: elevation === 'flush' ? token['radius/none'] : token['radius/outer'],
  };
}

export const panelHeadingStyle: CSSProperties = {
  margin: 0,
  color: token['ink/high'],
  font: token['text/ui'],
};

export const listResetStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

export const secondaryButtonStyle: CSSProperties = {
  minHeight: token['hit/target'],
  padding: `7px ${token['space/md']}`,
  color: token['ink/high'],
  background: 'transparent',
  border: `1px solid ${token['border/hairline']}`,
  borderRadius: token['radius/inner'],
  font: token['text/ui'],
  cursor: 'pointer',
};

export const primaryButtonStyle: CSSProperties = {
  minHeight: token['hit/target'],
  padding: `9px ${token['space/lg']}`,
  color: token['on/primary'],
  background: token['action/primary'],
  border: 0,
  borderRadius: token['radius/inner'],
  font: token['text/ui'],
  cursor: 'pointer',
};
