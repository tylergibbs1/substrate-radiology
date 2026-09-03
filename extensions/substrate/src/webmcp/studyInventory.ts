import type { JsonObject } from './spec';
import {
  acquiredOn,
  describeSeries,
  type DataSource,
  type DisplaySetService,
} from './viewerContext';

type InventorySeries = {
  studyUid: string;
  studyDate: string;
  seriesUid: string;
  description: string;
  modality: string;
  seriesNumber: number;
  imageCount: number;
};

type InventoryStudy = {
  studyUid: string;
  studyDate: string;
  series: InventorySeries[];
};

/**
 * Metadata inventory shared by context, study, layout, and proposal tools.
 * Discovery never instantiates image data; a study is loaded only by hang_layout.
 */
export function createStudyInventory(
  displaySet: DisplaySetService | undefined,
  dataSource: DataSource | undefined
) {
  let cachedInventory: { currentStudyUid: string; studies: InventoryStudy[] } | null = null;
  let inFlight: { currentStudyUid: string; promise: Promise<InventoryStudy[] | null> } | null =
    null;

  const active = (): InventoryStudy[] => {
    const grouped = new Map<string, InventoryStudy>();
    for (const set of displaySet?.getActiveDisplaySets() ?? []) {
      const studyDate = acquiredOn(set);
      const study = grouped.get(set.StudyInstanceUID) ?? {
        studyUid: set.StudyInstanceUID,
        studyDate,
        series: [],
      };
      study.series.push({
        studyUid: set.StudyInstanceUID,
        studyDate,
        seriesUid: set.SeriesInstanceUID,
        description: set.SeriesDescription ?? '',
        modality: set.Modality ?? '',
        seriesNumber: Number(set.SeriesNumber ?? 0),
        imageCount: set.numImageFrames ?? set.instances?.length ?? 0,
      });
      grouped.set(study.studyUid, study);
    }
    return [...grouped.values()];
  };

  const get = async (requestedCurrentStudyUid?: string): Promise<InventoryStudy[]> => {
    const fallback = active();
    const currentStudyUid = requestedCurrentStudyUid || fallback[0]?.studyUid || '';
    if (cachedInventory?.currentStudyUid === currentStudyUid) return cachedInventory.studies;
    if (inFlight?.currentStudyUid === currentStudyUid) {
      const discovered = await inFlight.promise;
      return discovered ?? fallback;
    }

    const promise = (async (): Promise<InventoryStudy[] | null> => {
      const searchStudies = dataSource?.query?.studies?.search;
      const searchSeries = dataSource?.query?.series?.search;
      // A fallback is a live viewer snapshot, not a patient inventory. Never
      // cache it: route hydration and study changes can replace it at any time.
      if (!currentStudyUid || !searchStudies || !searchSeries) return null;

      try {
        const currentRows = await searchStudies({ studyInstanceUid: currentStudyUid });
        const patientId = currentRows[0]?.mrn;
        const studies = patientId
          ? await searchStudies({ patientId, disableWildcard: true })
          : currentRows;
        const inventory = await Promise.all(
          studies.map(async study => {
            const studyUid = study.studyInstanceUid ?? '';
            const rows = studyUid ? await searchSeries(studyUid) : [];
            return {
              studyUid,
              studyDate: study.date ?? '',
              series: rows
                .filter(row => Boolean(row.seriesInstanceUid))
                .map(row => ({
                  studyUid,
                  studyDate: study.date ?? row.seriesDate ?? '',
                  seriesUid: row.seriesInstanceUid ?? '',
                  description: row.description ?? '',
                  modality: row.modality ?? '',
                  seriesNumber: Number(row.seriesNumber ?? 0),
                  imageCount: Number(row.numSeriesInstances ?? 0),
                })),
            };
          })
        );
        const complete = inventory
          .filter(study => study.studyUid && study.series.length > 0)
          .sort((a, b) => b.studyDate.localeCompare(a.studyDate));
        return complete.length > 0 ? complete : null;
      } catch (error) {
        console.warn('Substrate could not discover patient priors', error);
        return null;
      }
    })();
    inFlight = { currentStudyUid, promise };
    const discovered = await promise;
    if (inFlight?.promise === promise) inFlight = null;
    if (discovered) cachedInventory = { currentStudyUid, studies: discovered };
    return discovered ?? fallback;
  };

  const describe = (series: InventorySeries): JsonObject => {
    const loaded = (displaySet?.getActiveDisplaySets() ?? []).find(
      set => set.SeriesInstanceUID === series.seriesUid
    );
    return loaded
      ? describeSeries(loaded)
      : {
          series_uid: series.seriesUid,
          study_uid: series.studyUid,
          display_set_id: '',
          description: series.description,
          modality: series.modality,
          study_date: series.studyDate,
          series_number: series.seriesNumber,
          image_count: series.imageCount,
          reconstructable: series.imageCount > 1,
          loaded: false,
          orientation: '',
          image_orientation_patient: [],
          pixel_spacing_mm: [],
          slice_spacing_mm: null,
        };
  };

  return { get, describe };
}
