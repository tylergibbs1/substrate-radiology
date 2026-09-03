import { annotation } from '@cornerstonejs/tools'

import { register, type Proposal } from './proposals'

/**
 * Putting a copied measurement on another timepoint, by geometry only.
 *
 * DICOM gives every image a position in patient space (ImagePositionPatient)
 * and an orientation. If the patient was positioned the same way on both scans
 * — which is what a screening protocol is for — then the same anatomical point
 * has roughly the same patient coordinates a year apart. So placement is: keep
 * the source points, find the slice in the target series whose position is
 * nearest along the slice axis, and put the copy there.
 *
 * This is deliberately NOT registration. Nothing here deforms, rotates, or
 * matches image content. When the two studies do not share a frame of
 * reference, the result is an estimate and is reported as unaligned so the
 * radiologist knows to check it rather than trust it. That honesty is the
 * point: a mark that silently claimed to be registered would be worse than no
 * mark at all.
 */

export type TargetInstance = {
  imageId: string
  /** ImagePositionPatient. */
  position: [number, number, number]
  frameOfReferenceUID: string
}

/** Distance along the slice normal between a point and an image position. */
function distanceAlongNormal(
  point: readonly number[],
  position: readonly number[],
  normal: readonly number[]
): number {
  const dx = point[0] - position[0]
  const dy = point[1] - position[1]
  const dz = point[2] - position[2]
  return Math.abs(dx * normal[0] + dy * normal[1] + dz * normal[2])
}

export type Placement = {
  imageId: string
  offsetMm: number
  aligned: boolean
}

/**
 * Which slice of the target series the copy belongs on.
 *
 * Returns null when the target has no usable positions, rather than guessing at
 * slice zero — a proposal on the wrong slice is worse than no proposal.
 */
export function findTargetSlice(
  sourcePoint: readonly number[],
  sourceFrameOfReferenceUID: string,
  viewPlaneNormal: readonly number[],
  targets: TargetInstance[]
): Placement | null {
  if (targets.length === 0) return null
  let best: TargetInstance | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const target of targets) {
    const distance = distanceAlongNormal(sourcePoint, target.position, viewPlaneNormal)
    if (distance < bestDistance) {
      bestDistance = distance
      best = target
    }
  }
  if (!best) return null
  return {
    imageId: best.imageId,
    offsetMm: Math.round(bestDistance * 100) / 100,
    aligned: best.frameOfReferenceUID === sourceFrameOfReferenceUID,
  }
}

export type SourceMeasurement = {
  uid: string
  toolName: string
  points: number[][]
  label?: string
  FrameOfReferenceUID: string
  metadata: { viewPlaneNormal?: number[]; viewUp?: number[] }
}

/**
 * Build and register the annotation. The points are copied verbatim in patient
 * space; only the slice they are attached to changes.
 */
export function placeProposal(
  source: SourceMeasurement,
  placement: Placement,
  target: { seriesUID: string; studyUID: string; frameOfReferenceUID: string },
  label: string
): string {
  const annotationUID = `substrate-proposal-${source.uid}-${Date.now()}`
  // Cornerstone types these as fixed-length tuples, and a plain number[] is
  // not assignable to Point3.
  const normal = source.metadata.viewPlaneNormal ?? [0, 0, -1]
  const up = source.metadata.viewUp ?? [0, -1, 0]
  const viewPlaneNormal: [number, number, number] = [normal[0], normal[1], normal[2]]
  const viewUp: [number, number, number] = [up[0], up[1], up[2]]
  const points: [number, number, number][] = source.points.map((point) => [
    point[0],
    point[1],
    point[2],
  ])

  annotation.state.addAnnotation({
    annotationUID,
    highlighted: false,
    isLocked: false,
    invalidated: true,
    metadata: {
      toolName: source.toolName,
      viewPlaneNormal,
      viewUp,
      FrameOfReferenceUID: target.frameOfReferenceUID,
      referencedImageId: placement.imageId,
    },
    data: {
      label,
      handles: {
        points,
        textBox: {},
        activeHandleIndex: null,
      },
      cachedStats: {},
      // Marks this as ours for anything reading raw annotation state.
      substrateProposal: true,
    },
    // SAFETY: this is the annotation shape OHIF itself builds when hydrating a
    // structured report; the cast is needed only because Cornerstone's type
    // does not admit our extra `substrateProposal` marker.
  } as unknown as Parameters<typeof annotation.state.addAnnotation>[0],
  target.frameOfReferenceUID)

  const proposal: Proposal = {
    annotationUID,
    sourceMeasurementId: source.uid,
    targetSeriesUID: target.seriesUID,
    targetStudyUID: target.studyUID,
    aligned: placement.aligned,
    offsetMm: placement.offsetMm,
    state: 'proposed',
    createdAt: Date.now(),
  }
  register(proposal)
  return annotationUID
}
