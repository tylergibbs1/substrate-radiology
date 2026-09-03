import { annotation } from '@cornerstonejs/tools';

import { token } from '../designTokens';

/**
 * The proposal engine.
 *
 * This is the one place the agent gets to put a mark on an image, and the
 * rules around it are the whole reason the product can claim the agent never
 * interprets anything:
 *
 * - A proposal is only ever a COPY of a measurement a person already made. It
 *   takes a source measurement id, never coordinates the agent chose. There is
 *   no path here from "the agent thinks there is something at (x, y)" to a mark
 *   on the screen.
 * - It is placed by geometry alone — the same patient-space points, on whichever
 *   slice of the target study is nearest that position. No pixels are read, and
 *   nothing decides whether the thing is still there.
 * - It renders dashed and is not citable. Only a person accepting it makes it a
 *   measurement, and only accepted measurements can enter a report.
 *
 * OHIF's own tracking is per SERIES (TrackedMeasurementsService tracks series
 * UIDs), so it cannot express "this one annotation is provisional". Substrate
 * therefore owns proposal state here, and citability is this module's
 * predicate rather than OHIF's isTracked.
 */

type ProposalState = 'proposed' | 'accepted';

export type Proposal = {
  /** The annotation this describes. */
  annotationUID: string;
  /** The measurement it was copied from. */
  sourceMeasurementId: string;
  /** Reader-authored label copied from the source measurement. */
  label: string;
  targetSeriesUID: string;
  targetStudyUID: string;
  /**
   * False when the two studies do not share a frame of reference, which is the
   * usual case across timepoints. The mark is then a nearest-slice estimate and
   * says so, rather than implying a registration that was never computed.
   */
  aligned: boolean;
  /** How far the target slice sits from the source position, in millimetres. */
  offsetMm: number;
  state: ProposalState;
  /** Attribution is data, not decoration: the reader owns delegated work. */
  owner: 'active-reader';
  delegate: 'substrate';
  createdAt: number;
};

const proposals = new Map<string, Proposal>();
const listeners = new Set<() => void>();

/**
 * OHIF already renders untracked annotations dashed, so a dash alone cannot
 * mean "proposal" — a measurement the radiologist drew and has not tracked yet
 * looks identical. Proposals therefore get a colour of their own as well, and
 * accepting one clears the override so it goes back to looking like every other
 * measurement on the study.
 */
const PROPOSED_STYLE = {
  lineDash: '4,4',
  color: token['state/proposed'],
  colorHighlighted: token['state/unaligned'],
  colorSelected: token['state/unaligned'],
  textBoxColor: token['state/proposed'],
};

const ACCEPTED_STYLE = {
  lineDash: '',
  color: token['state/confirmed'],
  colorHighlighted: token['state/confirmed'],
  colorSelected: token['state/confirmed'],
  textBoxColor: token['state/confirmed'],
};

export function subscribeProposals(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

export function getProposals(): Proposal[] {
  return [...proposals.values()];
}

export function getProposal(annotationUID: string): Proposal | undefined {
  return proposals.get(annotationUID);
}

/** Whether a measurement may be cited in a report. */
export function isCitable(annotationUID: string): boolean {
  const proposal = proposals.get(annotationUID);
  return !proposal || proposal.state === 'accepted';
}

export function register(proposal: Proposal): void {
  proposals.set(proposal.annotationUID, proposal);
  // SAFETY: styling by annotation uid is Cornerstone's own per-annotation
  // override; it is ignored if the uid is unknown, so a failed placement
  // cannot leave a stray style behind.
  annotation.config.style.setAnnotationStyles(proposal.annotationUID, PROPOSED_STYLE);
  announce();
}

/**
 * A person accepted the proposal. It becomes an ordinary measurement: solid,
 * citable, and indistinguishable from one they drew, because at that point they
 * have taken responsibility for it.
 */
export function accept(annotationUID: string): boolean {
  const proposal = proposals.get(annotationUID);
  if (!proposal || proposal.state === 'accepted') return false;
  proposals.set(annotationUID, { ...proposal, state: 'accepted' });
  annotation.config.style.setAnnotationStyles(annotationUID, ACCEPTED_STYLE);
  announce();
  return true;
}

export function reject(annotationUID: string): boolean {
  if (!proposals.delete(annotationUID)) return false;
  annotation.state.removeAnnotation(annotationUID);
  announce();
  return true;
}

export function clearProposals(): void {
  proposals.clear();
  announce();
}
