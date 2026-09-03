jest.mock('@cornerstonejs/tools', () => ({}), { virtual: true });
jest.mock('../engine/proposals', () => ({ isProposal: () => false }));

import { createStudyInventory } from './studyInventory';
import type { DataSource, DisplaySetService } from './viewerContext';

const display = (study: string, series: string) => ({
  displaySetInstanceUID: `display-${series}`,
  StudyInstanceUID: study,
  SeriesInstanceUID: series,
  StudyDate: '20260101',
  instances: [],
});

describe('study inventory freshness', () => {
  it('does not permanently cache the active-viewer fallback across studies', async () => {
    let active = [display('study-a', 'series-a')];
    const service = {
      getActiveDisplaySets: () => active,
      getDisplaySetByUID: () => undefined,
    } as DisplaySetService;
    const inventory = createStudyInventory(service, undefined);

    expect((await inventory.get('study-a'))[0].studyUid).toBe('study-a');
    active = [display('study-b', 'series-b')];
    expect((await inventory.get('study-b'))[0].studyUid).toBe('study-b');
  });

  it('retries transient discovery failures instead of caching them', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let attempts = 0;
    const dataSource: DataSource = {
      query: {
        studies: {
          search: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('temporary');
            return [{ studyInstanceUid: 'study-a', date: '20260101', mrn: 'patient-a' }];
          },
        },
        series: {
          search: async () => [
            { studyInstanceUid: 'study-a', seriesInstanceUid: 'series-a', numSeriesInstances: 10 },
          ],
        },
      },
    };
    const service = {
      getActiveDisplaySets: () => [display('study-a', 'series-live')],
      getDisplaySetByUID: () => undefined,
    } as DisplaySetService;
    const inventory = createStudyInventory(service, dataSource);

    expect((await inventory.get('study-a'))[0].series[0].seriesUid).toBe('series-live');
    expect((await inventory.get('study-a'))[0].series[0].seriesUid).toBe('series-a');
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});
