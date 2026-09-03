import { getProposal, isCitable } from '../engine/proposals';
import type { JsonObject } from './spec';

export type DataSource = {
  query?: {
    studies?: {
      search?: (params: Record<string, unknown>) => Promise<StudyQuery[]>;
    };
    series?: {
      search?: (studyInstanceUid: string) => Promise<SeriesQuery[]>;
    };
  };
};

export type ViewerDependencies = {
  /** Aborted when the Substrate mode exits; every active tool call must stop with it. */
  sessionSignal: AbortSignal;
  servicesManager: { services: Record<string, unknown> };
  commandsManager: { runCommand: (name: string, options?: unknown) => unknown };
  extensionManager: {
    getActiveDataSource?: () => [DataSource?, ...unknown[]];
    getActiveDataSourceOrNull?: () => DataSource | null;
  };
};

export type ViewportGridService = {
  EVENTS?: { VIEWPORTS_READY?: string };
  subscribe?: (eventName: string, callback: () => void) => { unsubscribe: () => void };
  getState: () => {
    activeViewportId: string;
    viewports: Map<string, { displaySetInstanceUIDs?: string[] }>;
    layout: { numRows: number; numCols: number };
  };
  setActiveViewportId: (id: string) => void;
  setDisplaySetsForViewports: (
    updates: { viewportId: string; displaySetInstanceUIDs: string[] }[]
  ) => Promise<void>;
};

export type DisplaySet = {
  displaySetInstanceUID: string;
  SeriesInstanceUID: string;
  StudyInstanceUID: string;
  SeriesDescription?: string;
  SeriesNumber?: number;
  Modality?: string;
  SeriesDate?: string;
  StudyDate?: string;
  numImageFrames?: number;
  isReconstructable?: boolean;
  instances?: {
    StudyDate?: string;
    SeriesDate?: string;
    ImagePositionPatient?: number[];
    FrameOfReferenceUID?: string;
    imageId?: string;
    ImageOrientationPatient?: number[];
    PixelSpacing?: number[];
    SliceThickness?: number;
    SpacingBetweenSlices?: number;
    SliceLocation?: number;
    SOPInstanceUID?: string;
    SOPClassUID?: string;
    PatientID?: string;
    PatientName?: string;
    PatientBirthDate?: string;
    PatientSex?: string;
    StudyTime?: string;
    StudyID?: string;
    AccessionNumber?: string;
    StudyDescription?: string;
  }[];
  imageIds?: string[];
};

export type DisplaySetService = {
  getActiveDisplaySets: () => DisplaySet[];
  getDisplaySetByUID: (uid: string) => DisplaySet | undefined;
};

type StudyQuery = {
  studyInstanceUid?: string;
  date?: string;
  mrn?: string;
};

type SeriesQuery = {
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  modality?: string;
  seriesNumber?: string | number;
  seriesDate?: string;
  numSeriesInstances?: number;
  description?: string;
};

export type Measurement = {
  uid: string;
  label?: string;
  displayText?: unknown;
  referenceSeriesUID?: string;
  referenceStudyUID?: string;
  toolName?: string;
  points?: number[][];
  FrameOfReferenceUID?: string;
  data?: unknown;
  metadata?: {
    referencedImageId?: string;
    viewPlaneNormal?: number[];
    viewUp?: number[];
  };
};

export type MeasurementService = {
  getMeasurements: (filter?: (measurement: Measurement) => boolean) => Measurement[];
  getMeasurement: (uid: string) => Measurement | undefined;
  jumpToMeasurement: (viewportId: string, uid: string) => void;
  update: (uid: string, measurement: Measurement, notYetUpdatedAtSource?: boolean) => unknown;
};

type TrackedMeasurementsService = {
  getTrackedSeries: () => string[];
};

export type CornerstoneViewportService = {
  getCornerstoneViewport: (viewportId: string) =>
    | {
        element?: HTMLElement;
        viewportStatus?: string;
        getCurrentImageIdIndex?: () => number;
        getProperties?: () => Record<string, unknown>;
        setProperties?: (properties: Record<string, unknown>) => void;
        getCamera?: () => Record<string, unknown>;
        setCamera?: (camera: Record<string, unknown>) => void;
        render?: () => void;
        resetCamera?: () => boolean;
      }
    | undefined;
  getOrientation?: (viewportId: string) => string;
};

export function resolveViewerServices(deps: ViewerDependencies) {
  const services = deps.servicesManager.services;
  return {
    viewportGrid: services.viewportGridService as ViewportGridService | undefined,
    displaySet: services.displaySetService as DisplaySetService | undefined,
    measurement: services.measurementService as MeasurementService | undefined,
    tracked: services.trackedMeasurementsService as TrackedMeasurementsService | undefined,
    cornerstone: services.cornerstoneViewportService as CornerstoneViewportService | undefined,
  };
}

export function activeDataSource(deps: ViewerDependencies): DataSource | undefined {
  return (
    deps.extensionManager.getActiveDataSourceOrNull?.() ??
    deps.extensionManager.getActiveDataSource?.()?.[0]
  );
}

export function acquiredOn(displaySet: DisplaySet): string {
  const instance = displaySet.instances?.[0];
  return (
    instance?.StudyDate ??
    instance?.SeriesDate ??
    displaySet.StudyDate ??
    displaySet.SeriesDate ??
    ''
  );
}

function orientationOf(displaySet: DisplaySet): string {
  const values = displaySet.instances?.[0]?.ImageOrientationPatient;
  if (!values || values.length < 6) return '';
  const normal = [
    values[1] * values[5] - values[2] * values[4],
    values[2] * values[3] - values[0] * values[5],
    values[0] * values[4] - values[1] * values[3],
  ].map(Math.abs);
  const axis = normal.indexOf(Math.max(...normal));
  return axis === 0 ? 'sagittal' : axis === 1 ? 'coronal' : 'axial';
}

/** Metadata only. No image data or inferred findings cross the tool boundary. */
export function describeSeries(displaySet: DisplaySet): JsonObject {
  const instance = displaySet.instances?.[0];
  return {
    series_uid: displaySet.SeriesInstanceUID,
    study_uid: displaySet.StudyInstanceUID,
    display_set_id: displaySet.displaySetInstanceUID,
    description: displaySet.SeriesDescription ?? '',
    modality: displaySet.Modality ?? '',
    study_date: acquiredOn(displaySet),
    series_number: displaySet.SeriesNumber ?? 0,
    image_count: displaySet.numImageFrames ?? 0,
    reconstructable: Boolean(displaySet.isReconstructable),
    orientation: orientationOf(displaySet),
    image_orientation_patient: instance?.ImageOrientationPatient ?? [],
    pixel_spacing_mm: instance?.PixelSpacing ?? [],
    slice_spacing_mm: instance?.SpacingBetweenSlices ?? instance?.SliceThickness ?? null,
  };
}

/** Flatten the measurement exactly as OHIF displays it; never derive a new value. */
export function describeMeasurement(
  measurement: Measurement,
  trackedSeries: string[],
  displaySets: DisplaySet[] = []
): JsonObject {
  const displayText = measurement.displayText as { primary?: string[] } | string | undefined;
  const value =
    typeof displayText === 'string'
      ? displayText
      : Array.isArray(displayText?.primary)
        ? displayText.primary.join(' ')
        : '';
  const shown = displaySets.find(set => set.SeriesInstanceUID === measurement.referenceSeriesUID);
  const referencedImageId = measurement.metadata?.referencedImageId ?? '';
  const proposal = getProposal(measurement.uid);
  const citable = isCitable(measurement.uid);
  return {
    measurement_id: measurement.uid,
    label: measurement.label ?? '',
    tool: measurement.toolName ?? '',
    series_uid: measurement.referenceSeriesUID ?? '',
    study_uid: measurement.referenceStudyUID ?? '',
    value,
    tracked: trackedSeries.includes(measurement.referenceSeriesUID ?? '') && citable,
    proposed: proposal?.state === 'proposed',
    citable,
    copied_from: proposal?.sourceMeasurementId ?? '',
    aligned: proposal?.aligned ?? true,
    geometry: measurement.points ?? [],
    referenced_image_id: referencedImageId,
    slice_index: referencedImageId ? (shown?.imageIds?.indexOf(referencedImageId) ?? -1) : -1,
    author: proposal ? 'agent' : 'radiologist',
  };
}

export const CT_PRESETS = new Map<string, { window: number; level: number }>([
  ['soft tissue', { window: 400, level: 40 }],
  ['lung', { window: 1500, level: -600 }],
  ['liver', { window: 150, level: 90 }],
  ['bone', { window: 2500, level: 480 }],
  ['brain', { window: 80, level: 40 }],
]);

/** Wait for layout rebuilds before issuing a command to a Cornerstone viewport. */
export async function viewportReady(
  cornerstone: CornerstoneViewportService | undefined,
  viewportId: string
): Promise<boolean> {
  if (!cornerstone) return true;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const viewport = cornerstone.getCornerstoneViewport(viewportId);
    const status = viewport?.viewportStatus?.toLowerCase();
    const settled = status === undefined || status === 'rendered' || status === 'prerender';
    if (viewport?.element?.isConnected && settled) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return false;
}
