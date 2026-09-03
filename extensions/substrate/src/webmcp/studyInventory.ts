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
  let cachedInventory: Promise<InventoryStudy[]> | null = null;

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

  const get = async (): Promise<InventoryStudy[]> => {
    if (cachedInventory) {
      const cached = await cachedInventory;
      // Do not keep the empty snapshot captured before route hydration.
      if (cached.length > 0 || active().length === 0) return cached;
      cachedInventory = null;
    }

    cachedInventory = (async () => {
      const fallback = active();
      const currentStudyUid = fallback[0]?.studyUid;
      const searchStudies = dataSource?.query?.studies?.search;
      const searchSeries = dataSource?.query?.series?.search;
      if (!currentStudyUid || !searchStudies || !searchSeries) return fallback;

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
        return inventory
          .filter(study => study.studyUid && study.series.length > 0)
          .sort((a, b) => b.studyDate.localeCompare(a.studyDate));
      } catch (error) {
        console.warn('Substrate could not discover patient priors', error);
        return fallback;
      }
    })();

    return cachedInventory;
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
